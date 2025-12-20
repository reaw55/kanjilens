"use server";

import { createClient } from "@/utils/supabase/server";
import { v4 as uuidv4 } from "uuid";
import { detectText } from "@/utils/ocr";

// Helper for Translation
async function generateTranslation(text: string) {
    if (!text || !process.env.OPENAI_API_KEY) return null;
    try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
            model: "gpt-5-nano-2025-08-07",
            messages: [
                { role: "system", content: "You are a translator. Translate the Japanese text to English. detailed, context-aware translation. If it's a menu/sign, describe it briefly." },
                { role: "user", content: `Translate this text found on a sign/image:\n\n${text}` }
            ],
            max_completion_tokens: 300
        });

        return completion.choices[0].message.content;
    } catch (e) {
        console.error("AI Translation Failed", e);
        return null;
    }
}

export async function ensureCaptureTranslation(captureId: string) {
    const supabase = await createClient();

    // 1. Get Capture
    const { data: capture } = await supabase.from("captures").select("*").eq("id", captureId).single();
    if (!capture || !capture.ocr_data?.text) return { error: "No text to translate" };
    if (capture.translation) return { success: true, translation: capture.translation };

    // 2. Generate
    const translation = await generateTranslation(capture.ocr_data.text);

    // 3. Save
    if (translation) {
        await supabase.from("captures").update({ translation }).eq("id", captureId);
    }

    return { success: true, translation };
}

export async function uploadCapture(formData: FormData) {
    const supabase = await createClient();
    const file = formData.get("file") as File;
    const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
    const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;

    if (!file) {
        return { error: "No file uploaded" };
    }

    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: "You must be logged in to upload" };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Compute Image Hash (SHA-256) for Deduplication
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const imageHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 3. Check for Duplicate Image
    // We check if ANY capture (even from other users if we wanted, but let's stick to current user for privacy/isolation or global if 'waste space' is top priority.
    // Let's optimize for space: Check GLOBAL for the hash (Requires generic access or admin role, or we just trust RLS allows select if publicly visible?)
    // Actually, RLS usually prevents seeing others' captures.
    // So we'll limit deduplication to the *current user's* history to be safe and simple.
    const { data: existingCapture } = await supabase
        .from("captures")
        .select("image_url")
        .eq("image_hash", imageHash)
        .limit(1)
        .single();

    let publicUrl = "";

    if (existingCapture) {
        console.log("Duplicate image found! Reusing URL.");
        publicUrl = existingCapture.image_url;
    } else {
        // 4. Upload to Storage (If new)
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${uuidv4()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("captures")
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            console.error("Upload error:", uploadError);
            return { error: `Upload failed: ${uploadError.message}` };
        }

        const { data: urlData } = supabase.storage
            .from("captures")
            .getPublicUrl(fileName);

        publicUrl = urlData.publicUrl;
    }

    // 5. Create Capture Record
    // (We accept that multiple capture records might point to the same image_url)
    const { data: capture, error: dbError } = await supabase
        .from("captures")
        .insert({
            user_id: user.id,
            image_url: publicUrl,
            image_hash: imageHash, // Store hash for future checks
            geo_lat: lat,
            geo_lng: lng
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Error:", dbError);
        return { error: "Failed to save capture data" };
    }

    // 6. Run OCR
    // (Optimization: If we have 100% duplicate image, we could arguably copy the OCR data too!
    // But maybe the user cropped it differently? No, hash is on full file.
    // So yes, we can reuse OCR data too!)

    let ocrResult = null;

    // Check if we have OCR data for this hash already?
    if (existingCapture) {
        const { data: previousOcr } = await supabase
            .from("captures")
            .select("ocr_data")
            .eq("image_hash", imageHash)
            .not("ocr_data", "is", null)
            .limit(1)
            .single();
        if (previousOcr) {
            ocrResult = previousOcr.ocr_data;
        }
    }

    if (!ocrResult) {
        ocrResult = await detectText(buffer);
    }

    // 7. Generate AI Translation (Context Aware)
    // We do this PARALLEL to the DB update or after. Let's do it after OCR is confirmed.
    let translation = null;
    if (ocrResult?.text) {
        translation = await generateTranslation(ocrResult.text);
    }

    // 8. Update Capture with OCR Data AND Translation
    const { error: updateError } = await supabase
        .from("captures")
        .update({
            ocr_data: ocrResult,
            translation: translation
        })
        .eq("id", capture.id);

    if (updateError) {
        console.error("Failed to save OCR data to DB", updateError);
    }

    return { success: true, captureId: capture.id, ocrResult, translation };
}
