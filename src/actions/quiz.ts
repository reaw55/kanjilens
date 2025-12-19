"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// Simple SRS intervals in minutes
const SRS_INTERVALS = [0, 10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 30]; // 0(Reset), 10m, 1d, 3d, 7d, 30d

export async function getQuizData() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { items: [], distractors: [] };

    const now = new Date().toISOString();

    // 1. Fetch Due Items
    const { data: items } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .lte("next_review_at", now)
        .order("next_review_at", { ascending: true })
        .limit(20);

    // 2. Fetch Distractors (Random pool of other words)
    // In a real app, use a more efficient random query. Here we just fetch recent 50.
    const { data: distractors } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .limit(50);

    return {
        items: items || [],
        distractors: distractors || []
    };
}

export async function submitQuizResult(itemId: string, isCorrect: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    // 1. Get current item state
    const { data: item } = await supabase
        .from("vocabulary_items")
        .select("srs_level")
        .eq("id", itemId)
        .single();

    if (!item) return { error: "Item not found" };

    let newLevel = item.srs_level;
    let xpGained = 0;

    if (isCorrect) {
        newLevel = Math.min(SRS_INTERVALS.length - 1, newLevel + 1);
        xpGained = 10 + (newLevel * 2); // Base 10 XP + Bonus for higher levels

        // Update Profile XP
        await supabase.rpc('increment_xp', { amount: xpGained, user_id_param: user.id });
        // Fallback if RPC doesn't exist (client side handles this usually but good to have)
        // actually we will manually update for safety if RPC missing, 
        // but let's assume we do a direct update
        const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
        if (profile) {
            await supabase.from("profiles").update({ xp: profile.xp + xpGained }).eq("id", user.id);
        }

    } else {
        newLevel = Math.max(0, newLevel - 1); // Decay on fail
    }

    // Calculate next review time
    const minutesToAdd = SRS_INTERVALS[newLevel];
    const nextReview = new Date();
    nextReview.setMinutes(nextReview.getMinutes() + minutesToAdd);

    // 2. Update Vocabulary Item
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
    revalidatePath("/"); // Update home stats
    return { success: true, xp: xpGained };
}
