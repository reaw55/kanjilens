"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// Simple SRS intervals in minutes
const SRS_INTERVALS = [0, 10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 30]; // 0(Reset), 10m, 1d, 3d, 7d, 30d

export async function submitReview(itemId: string, quality: 'forgot' | 'hard' | 'easy') {
    const supabase = await createClient();

    // 1. Get current item state
    const { data: item } = await supabase
        .from("vocabulary_items")
        .select("srs_level")
        .eq("id", itemId)
        .single();

    if (!item) return { error: "Item not found" };

    let newLevel = item.srs_level;

    if (quality === 'forgot') {
        newLevel = 0;
    } else if (quality === 'hard') {
        newLevel = Math.max(0, newLevel - 1); // Or keep same? Let's say -1
    } else if (quality === 'easy') {
        newLevel = Math.min(SRS_INTERVALS.length - 1, newLevel + 1);
    }

    // Calculate next review time
    const minutesToAdd = SRS_INTERVALS[newLevel];
    const nextReview = new Date();
    nextReview.setMinutes(nextReview.getMinutes() + minutesToAdd);

    // 2. Update DB
    const { error } = await supabase
        .from("vocabulary_items")
        .update({
            srs_level: newLevel,
            next_review_at: nextReview.toISOString()
        })
        .eq("id", itemId);

    if (error) {
        console.error("SRS Update Error", error);
        return { error: "Failed to update" };
    }

    revalidatePath("/quiz");
    return { success: true };
}
