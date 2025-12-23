"use server";

import { createAdminClient } from "@/utils/supabase/admin";

export async function getAdminMissingThumbnails() {
    const supabase = createAdminClient();

    // Select user_id too so we can construct storage path
    const { data, error } = await supabase
        .from("captures")
        .select("id, image_url, user_id")
        .is("thumbnail_url", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Admin Fetch Error:", error);
        return { error: error.message };
    }

    return { data };
}

export async function updateAdminThumbnail(captureId: string, userId: string, formData: FormData) {
    const supabase = createAdminClient();

    const thumbnailFile = formData.get("thumbnail") as File;
    if (!thumbnailFile) return { error: "No thumbnail provided" };

    try {
        // Construct path: thumbnails/{userId}/{captureId}.jpg
        const thumbName = `thumbnails/${userId}/${captureId}.jpg`;

        const { error: thumbErr } = await supabase.storage
            .from("captures")
            .upload(thumbName, await thumbnailFile.arrayBuffer(), {
                contentType: "image/jpeg",
                upsert: true
            });

        if (thumbErr) throw thumbErr;

        const { data: thumbUrlData } = supabase.storage
            .from("captures")
            .getPublicUrl(thumbName);

        const { error: dbError } = await supabase
            .from("captures")
            .update({ thumbnail_url: thumbUrlData.publicUrl })
            .eq("id", captureId);
        // No need to check user_id for permission since we are admin

        if (dbError) throw dbError;

        return { success: true, url: thumbUrlData.publicUrl };
    } catch (e: any) {
        console.error("Admin Thumbnail Update Failed", e);
        return { error: e.message || "Update failed" };
    }
}
