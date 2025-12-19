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

    // 2. Upload to Storage
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${uuidv4()}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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

    const { data: { publicUrl } } = supabase.storage
        .from("captures")
        .getPublicUrl(fileName);

    // 3. Create Capture Record
    const { data: capture, error: dbError } = await supabase
        .from("captures")
        .insert({
            user_id: user.id,
            image_url: publicUrl,
            geo_lat: lat,
            geo_lng: lng
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Error:", dbError);
        // Try to cleanup storage if DB fails? For MVP, skip.
        return { error: "Failed to save capture data" };
    }

    // 4. Run OCR
    // Note: For large images/slow OCR this might be slow for a synchronous action.
    // In production, use background jobs (Inngest/bullmq). For MVP, await is fine.
    const ocrResult = await detectText(buffer);

    // 5. Update Capture with OCR Data
    // Note: detectText always returns a valid object (mock or real), so we don't check for .error
    const { error: updateError } = await supabase
        .from("captures")
        .update({ ocr_data: ocrResult })
        .eq("id", capture.id);

    if (updateError) {
        console.error("Failed to save OCR data to DB", updateError);
    }

    return { success: true, captureId: capture.id, ocrResult };
}
