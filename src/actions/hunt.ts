"use server";

import { createClient } from "@/utils/supabase/server";

// Hardcoded Level 1 Hunt List (Street Signs)
const LEVEL_1_WORDS = [
    "入口", // iriguchi - Entrance
    "出口", // deguchi - Exit
    "非常口", // hijouguchi - Emergency Exit
    "止まれ", // tomare - Stop
    "受付", // uketsuke - Reception
    "禁煙"  // kinen - No Smoking
];

async function generateHuntLevel(supabase: any, user: any, levelInfo: { nextMission: number }) {
    // 1. Get ALL previously used words to avoid duplicates
    // We can select all target_words arrays and flat map them.
    const { data: pastSessions } = await supabase
        .from("kanji_hunt_sessions")
        .select("target_words")
        .eq("user_id", user.id);

    const usedWords = new Set<string>();
    if (pastSessions) {
        pastSessions.forEach((s: any) => {
            if (Array.isArray(s.target_words)) {
                s.target_words.forEach((w: string) => usedWords.add(w));
            }
        });
    }

    // 2. AI Generation
    try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const prompt = `
            Generate a unique "Kanji Hunt" level for a scavenger hunt game.
            Mission Number: ${levelInfo.nextMission}
            
            Requirements:
            1. Theme: Pick a distinct theme (e.g., "Convenience Store", "Train Station", "School", "Nature", "Kitchen", "Supermarket").
            2. Words: Provide exactly 6 COMMON Kanji words that match the theme.
            3. VISUAL: The words must be findable on SIGNS, LABELS, or PACKAGING in real life.
            4. UNIQUE: Do NOT use these words: ${JSON.stringify(Array.from(usedWords))}.
            
            Output JSON ONLY:
            {
                "theme": "Theme Name",
                "words": ["Word1", "Word2", ...]
            }
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a game designer. Output valid JSON only." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content");
        const data = JSON.parse(content);

        return {
            theme: data.theme,
            words: data.words,
            mission: levelInfo.nextMission
        };

    } catch (e) {
        console.error("AI Generation Failed", e);
        // Fallback to random subset of hardcoded if AI fails? Or just retry Level 1?
        // For now, fallback to "Review Mode"
        return {
            theme: "Review: Street Signs",
            words: LEVEL_1_WORDS,
            mission: levelInfo.nextMission
        };
    }
}

async function ensureSession(supabase: any, user: any) {
    // 0. Get Profile Mission Level (Truth)
    const { data: profile } = await supabase
        .from("profiles")
        .select("mission_level")
        .eq("id", user.id)
        .single();

    // Default to 1 if not set
    const currentMission = profile?.mission_level || 1;

    // 1. Try to find active session
    const { data: activeSessions } = await supabase
        .from("kanji_hunt_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

    if (activeSessions && activeSessions.length > 0) {
        const session = activeSessions[0];
        const sessionMission = session.mission_number || session.level_number || 1;

        // STRICT SYNC: If active session doesn't match profile mission, archive it (IT IS STALE)
        if (sessionMission === currentMission) {
            return session;
        }

        // Mismatch found (e.g. Profile reset to 1, but Session is 3)
        // Archive the stale session
        await supabase
            .from("kanji_hunt_sessions")
            .update({ is_active: false })
            .eq("id", session.id);
    }

    // 2. Create NEW session for currentMission
    const nextMission = currentMission;

    // Keep level_number in sync or just 1 for now
    const nextLevel = 1;

    let theme = "Street Signs";
    let words = LEVEL_1_WORDS;

    // If Mission > 1, Generate!
    if (nextMission > 1) {
        const gen = await generateHuntLevel(supabase, user, { nextMission });
        theme = gen.theme;
        // Clean words (remove possible markdown or extra spaces)
        if (gen.words) {
            words = gen.words.map((w: string) => w.trim());
        } else {
            // Fallback if AI generation failed to provide words
            words = LEVEL_1_WORDS;
        }
    }

    // 3. Create new session
    const { data: newSession, error } = await supabase
        .from("kanji_hunt_sessions")
        .insert({
            user_id: user.id,
            target_words: words,
            found_words: [],
            is_active: true,
            theme: theme,
            level_number: nextLevel,
            mission_number: nextMission
        })
        .select()
        .single();

    if (error) {
        console.error("Create Hunt Error:", error);
        return null;
    }

    return newSession;
}

export async function getCurrentHunt() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const session = await ensureSession(supabase, user);
    if (!session) return { error: "Failed to load session" };

    return { success: true, session };
}

export async function checkHuntMatch(scannedWord: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const cleanWord = scannedWord.trim();

    // 1. Get (or create) active session
    // This ensures we don't miss matches just because the user didn't visit the dashboard first
    const session = await ensureSession(supabase, user);
    if (!session) return { match: false };

    // 2. Check match
    const targets = session.target_words as string[];
    const found = session.found_words as string[];

    if (targets.includes(cleanWord) && !found.includes(cleanWord)) {
        // MATCH FOUND! 
        const newFound = [...found, cleanWord];

        // Update Session
        await supabase
            .from("kanji_hunt_sessions")
            .update({ found_words: newFound })
            .eq("id", session.id);

        // Award XP (e.g., 50 XP per find)
        // Check if RPC exists, catch error if not
        try {
            const { error: rpcError } = await supabase.rpc("increment_xp", { amount: 50, row_id: user.id });
            if (rpcError) throw rpcError;
        } catch (e) {
            // Fallback manual update
            const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
            if (profile) {
                await supabase.from("profiles").update({ xp: (profile.xp || 0) + 50 }).eq("id", user.id);
            }
        }

        // Check completion
        const isLevelComplete = newFound.length >= targets.length;

        if (isLevelComplete) {
            // Level Complete! Bonus XP
            try {
                // +500 Bonus
                const { error: rpcError } = await supabase.rpc("increment_xp", { amount: 500, row_id: user.id });
                if (rpcError) throw rpcError;
            } catch (e) {
                const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
                if (profile) {
                    await supabase.from("profiles").update({ xp: (profile.xp || 0) + 500 }).eq("id", user.id);
                }
            }

            // Mark complete - WE DO NOT AUTO CLOSE anymore, user must click "Next Level"
            // This prevents the UI from resetting immediately.
            // await supabase.from("kanji_hunt_sessions").update({ is_active: false }).eq("id", session.id);

            return { match: true, word: cleanWord, xp: 50, levelComplete: true, bonusXP: 500 };
        }

        return { match: true, word: cleanWord, xp: 50, levelComplete: false };
    }

    return { match: false };
}

export async function advanceLevel() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // Find the completed active session
    const { data: sessions } = await supabase
        .from("kanji_hunt_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

    const session = sessions && sessions.length > 0 ? sessions[0] : null;

    if (session) {
        // Archive it
        await supabase
            .from("kanji_hunt_sessions")
            .update({ is_active: false })
            .eq("id", session.id);
    }

    // ALWAYS INCREMENT LEVEL if we are called (we trust the UI state for MVP, or we could verify completion)
    // Even if no session found (weird state), we should let them move on if they are stuck.

    // INCREMENT PROFILE MISSION LEVEL
    const { data: profile } = await supabase
        .from("profiles")
        .select("mission_level")
        .eq("id", user.id)
        .single();

    const current = profile?.mission_level || 1;

    console.log("Advancing Level from", current, "to", current + 1);

    await supabase
        .from("profiles")
        .update({ mission_level: current + 1 })
        .eq("id", user.id);

    const { revalidatePath } = await import("next/cache");
    const { redirect } = await import("next/navigation");
    revalidatePath("/"); // Update dashboard too
    revalidatePath("/hunt");
    redirect("/hunt"); // Force navigation to refresh server component

    return { success: true };
}

export async function checkHuntVocabStatus(words: string[]) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};

    const { data } = await supabase
        .from("vocabulary_items")
        .select("id, kanji_word") // FIXED: kanji -> kanji_word
        .eq("user_id", user.id)
        .in("kanji_word", words); // FIXED: kanji -> kanji_word

    const status: Record<string, string> = {};
    if (data) {
        data.forEach((item: any) => {
            status[item.kanji_word] = item.id;
        });
    }
    return status;
}

export async function learnHuntWord(word: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Check if ANY duplicate exists first (Fast)
    const { data: existing } = await supabase
        .from("vocabulary_items")
        .select("id")
        .eq("user_id", user.id!)
        .eq("kanji_word", word)
        .single();

    const { revalidatePath } = await import("next/cache");
    const { redirect } = await import("next/navigation");

    if (existing) {
        // If it exists, we still want to redirect the user to it!
        revalidatePath("/hunt");
        revalidatePath("/vocab");
        redirect(`/vocab?open=${existing.id}`);
    }

    // 2. INSERT PLACEHOLDER IMMEDIATELY
    const { data: newItem, error } = await supabase
        .from("vocabulary_items")
        .insert({
            user_id: user.id!,
            kanji_word: word,
            reading_kana: "Loading...",
            meaning_en: "Generating definition...",
            source: "hunt",
            status: "learning",
        })
        .select()
        .single();

    if (error) return { error: error.message };


    // 3. DONE -> Redirect
    revalidatePath("/hunt");
    revalidatePath("/vocab");

    redirect(`/vocab?open=${newItem.id}`);
}

export async function scanRecentCapturesForHunt() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Get Session
    const session = await ensureSession(supabase, user);
    if (!session) return { error: "No session" };

    const targets = session.target_words as string[];
    const found = session.found_words as string[];
    const missing = targets.filter(t => !found.includes(t));

    if (missing.length === 0) return { findings: [] };

    // 2. Fetch Recent Captures (that have OCR but maybe not processed for this specific session)
    const { data: captures } = await supabase
        .from("captures")
        .select("ocr_data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .not("ocr_data", "is", null)
        .limit(20);

    if (!captures || captures.length === 0) return { findings: [] };

    // 3. Check for matches
    const newFindings: string[] = [];

    // Create a big text blob or check individually? Individually is safer for context but blob is faster.
    // Let's check string inclusion.
    for (const target of missing) {
        if (newFindings.includes(target)) continue; // Already found in this loop

        // Check all captures
        for (const cap of captures) {
            const text = cap.ocr_data?.text || "";
            if (text.includes(target)) {
                newFindings.push(target);
                break; // Found this target, move to next
            }
        }
    }

    if (newFindings.length === 0) return { findings: [] };

    // 4. Update Session (Bulk Update)
    const updatedFound = [...found, ...newFindings];

    await supabase
        .from("kanji_hunt_sessions")
        .update({ found_words: updatedFound })
        .eq("id", session.id);

    // 5. Award XP (Bulk)
    const xpAmount = newFindings.length * 50;
    try {
        const { error: rpcError } = await supabase.rpc("increment_xp", { amount: xpAmount, row_id: user.id });
        if (rpcError) throw rpcError;
    } catch (e) {
        const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
        if (profile) {
            await supabase.from("profiles").update({ xp: (profile.xp || 0) + xpAmount }).eq("id", user.id);
        }
    }

    // 6. Check Completion
    const isLevelComplete = updatedFound.length >= targets.length;
    let bonus = 0;

    if (isLevelComplete) {
        bonus = 500;
        try {
            const { error: rpcError } = await supabase.rpc("increment_xp", { amount: bonus, row_id: user.id });
            if (rpcError) throw rpcError;
        } catch (e) {
            const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user.id).single();
            if (profile) {
                await supabase.from("profiles").update({ xp: (profile.xp || 0) + bonus }).eq("id", user.id);
            }
        }

        // DO NOT AUTO CLOSE
        // await supabase.from("kanji_hunt_sessions").update({ is_active: false }).eq("id", session.id);
    }

    return {
        success: true,
        findings: newFindings,
        xpGained: xpAmount,
        levelComplete: isLevelComplete,
        bonusXP: bonus
    };
}
