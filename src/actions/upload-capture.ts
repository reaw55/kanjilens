"use server";

import { createClient } from "@/utils/supabase/server";
import { v4 as uuidv4 } from "uuid";
import { detectText } from "@/utils/ocr";

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

    // 7. Update Capture with OCR Data
    const { error: updateError } = await supabase
        .from("captures")
        .update({ ocr_data: ocrResult })
        .eq("id", capture.id);

    if (updateError) {
        console.error("Failed to save OCR data to DB", updateError);
    }

    return { success: true, captureId: capture.id, ocrResult };
}
