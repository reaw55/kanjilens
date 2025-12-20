"use server";

import { createClient } from "@/utils/supabase/server";

// Hardcoded Level 1 Hunt List (Street Signs)
const LEVEL_1_WORDS = [
    "入口", // iriguchi - Entrance
    "出口", // deguchi - Exit
    "非常口", // hijouguchi - Emergency Exit
    "止まれ", // tomare - Stop
    "受付", // uketsuke - Reception
    "案内", // annai - Information/Guide
    "禁煙", // kinen - No Smoking
    "危険", // kiken - Danger
    "注意", // chuui - Caution
    "準備中" // junbichuu - Preparation/Closed
];

export async function getCurrentHunt() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Try to find active session
    const { data: activeSession } = await supabase
        .from("kanji_hunt_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();

    if (activeSession) {
        return { success: true, session: activeSession };
    }

    // 2. Create new session if none exists
    const { data: newSession, error } = await supabase
        .from("kanji_hunt_sessions")
        .insert({
            user_id: user.id,
            target_words: LEVEL_1_WORDS,
            found_words: [],
            is_active: true
        })
        .select()
        .single();

    if (error) {
        console.error("Create Hunt Error:", error);
        return { error: "Failed to start hunt" };
    }

    return { success: true, session: newSession };
}

export async function checkHuntMatch(scannedWord: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Get active session
    const { data: session } = await supabase
        .from("kanji_hunt_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();

    if (!session) return { match: false };

    // 2. Check match
    // Simple exact match for now. Could be fuzzy later.
    const targets = session.target_words as string[];
    const found = session.found_words as string[];

    if (targets.includes(scannedWord) && !found.includes(scannedWord)) {
        // MATCH FOUND! 
        const newFound = [...found, scannedWord];

        // Update Session
        await supabase
            .from("kanji_hunt_sessions")
            .update({ found_words: newFound })
            .eq("id", session.id);

        // Award XP (e.g., 50 XP per find)
        await supabase.rpc("increment_xp", { amount: 50, row_id: user.id }); // Assuming rpc or direct update

        // Fallback if RPC doesn't exist, manual update
        const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
        if (profile) {
            await supabase.from("profiles").update({ xp: (profile.xp || 0) + 50 }).eq("id", user.id);
        }

        // Check completion
        if (newFound.length === targets.length) {
            // Level Complete! Bonus XP
            await supabase.from("profiles").update({ xp: (profile?.xp || 0) + 50 + 500 }).eq("id", user.id); // +50 for last word, +500 bonus

            // Mark complete, maybe start new one implicitly next time
            await supabase
                .from("kanji_hunt_sessions")
                .update({ is_active: false })
                .eq("id", session.id);

            return { match: true, word: scannedWord, xp: 50, levelComplete: true, bonusXP: 500 };
        }

        return { match: true, word: scannedWord, xp: 50, levelComplete: false };
    }

    return { match: false };
}
