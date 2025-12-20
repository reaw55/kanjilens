"use server";

import { createClient } from "@/utils/supabase/server";

// Mock response for MVP development without burning tokens
const MOCK_LESSON = {
    kanji: "日本語",
    reading: "Nihongo",
    meaning: "Japanese Language",
    explanation: "It is the language spoken by the people of Japan.",
    components: [
        { kanji: "日", meaning: "sun/day" },
        { kanji: "本", meaning: "origin/book" },
        { kanji: "語", meaning: "language" }
    ],
    context_usage: {
        sentence: "日本語を勉強しています。",
        reading: "Nihongo o benkyou shiteimasu.",
        english: "I am studying Japanese."
    }
};

import OpenAI from "openai";

// ... MOCK_LESSON remains as fallback ...

// Batch Generation to save tokens
export async function generateBatchLessons(words: string[], contextFullText: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    // 1. Identify what we already know (Deduplication)
    const { data: existingItems } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .in("kanji_word", words);

    const existingMap = new Map(existingItems?.map(i => [i.kanji_word, i]) || []);
    const wordsToLearn = words.filter(w => !existingMap.has(w));

    const results: any[] = [];

    // 2. Add Existing Items to results immediately
    existingMap.forEach((item) => {
        results.push({
            kanji: item.kanji_word,
            reading: item.reading_kana,
            meaning: item.meaning_en,
            context_usage: {
                sentence: item.context_sentence_jp,
                english: item.context_sentence_en
            },
            id: item.id, // Important for linking
            existing: true
        });
    });

    if (wordsToLearn.length === 0) {
        return { success: true, lessons: results };
    }

    // 3. Batch Call to OpenAI for new words
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        // Mock fallback
        wordsToLearn.forEach(w => {
            results.push({ ...MOCK_LESSON, kanji: w });
        });
        return { success: true, lessons: results };
    }

    try {
        const openai = new OpenAI({ apiKey });

        // Optimize Prompt: Send Context ONCE
        const prompt = `
          Analyze the following Japanese words: ${JSON.stringify(wordsToLearn)}.
          Shared Context: "${contextFullText.substring(0, 300)}...".
          
          TASK: Create a detailed "Vocabulary Card Drill" for each word.
          
          STRICT JSON OUTPUT STRUCTURE (For each word key):
          {
            "currentKanji": "The Kanji itself",
            "basicInfo": {
                "meaning": "English keywords separated by slashes",
                "radical": "Root component (e.g., 气)"
            },
            "readings": {
                "onyomi": { "kana": "Katakana reading", "note": "Usage note" },
                "kunyomi": { "kana": "Hiragana reading", "note": "Usage note" }
            },
            "combinations": [
                {
                    "word": "Compound Word",
                    "reading": "Reading", 
                    "meaning": "Meaning",
                    "targetKanji": "The OTHER kanji in the word to learn next (recursive)"
                }
                // Provide exactly 5 essential combinations
            ],
            "dialogue": [
                { "speaker": "A", "japanese": "Sentence using the word", "english": "Translation" },
                { "speaker": "B", "japanese": "Response using the word (if possible)", "english": "Translation" }
            ],
            "context_usage": { // Keep this standard field for backward compat
                "sentence": "One of the dialogue sentences",
                "reading": "Romaji reading",
                "english": "Translation"
            }
          }
           
          STRICT RULES:
          1. Use the JSON keys provided exactly.
          2. Combinations MUST include "targetKanji" (the partner character).
          3. Dialogue MUST be conversational (A/B).
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-5-nano-2025-08-07",
            messages: [
                { role: "system", content: "You are a helpful Japanese language tutor. Return valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content");

        const aiData = JSON.parse(content);

        // Merge AI results
        wordsToLearn.forEach(w => {
            if (aiData[w]) {
                const item = aiData[w];

                // Map the new rich structure to our DB columns
                // Standard columns:
                const standardLesson = {
                    kanji: item.currentKanji || w,
                    reading: item.readings?.on_reading?.kana || item.readings?.kun_reading?.kana || (item.readings?.onyomi?.kana || "") + (item.readings?.kunyomi?.kana ? " / " + item.readings.kunyomi.kana : ""),
                    meaning: item.basicInfo?.meaning || "Meaning",
                    context_usage: item.context_usage || {
                        sentence: item.dialogue?.[0]?.japanese || "N/A",
                        english: item.dialogue?.[0]?.english || "N/A",
                        reading: ""
                    },
                    detailed_data: {
                        basicInfo: item.basicInfo,
                        readings: item.readings,
                        combinations: item.combinations,
                        dialogue: item.dialogue
                    }
                };

                // Polyfill reading if complex
                if (!standardLesson.reading || standardLesson.reading === "undefined") {
                    // Fallback
                    standardLesson.reading = "Reading";
                }

                results.push({ ...standardLesson, kanji: w });
            } else {
                // Fallback if AI missed one
                results.push({ ...MOCK_LESSON, kanji: w });
            }
        });

        return { success: true, lessons: results };

    } catch (e) {
        console.error("Batch AI Error", e);
        // Fallback all
        wordsToLearn.forEach(w => {
            results.push({ ...MOCK_LESSON, kanji: w });
        });
        return { success: true, lessons: results };
    }
}

// Single wrapper for backward compatibility (or just unused)
// Single wrapper for backward compatibility
// Now reuses the batch logic so we have a SINGLE source of truth for prompts/models
export async function generateLesson(word: string, contextFullText: string) {
    // Just wrap the batch function
    const result = await generateBatchLessons([word], contextFullText);

    if (result.success && result.lessons && result.lessons.length > 0) {
        return { success: true, lesson: result.lessons[0] };
    }

    return { error: "Failed to generate lesson" };
}

export async function saveVocabulary(lesson: any, captureId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Check if already exists (Double check to be safe)
    let vocabId = lesson.id;

    if (!vocabId) {
        const { data: existing } = await supabase
            .from("vocabulary_items")
            .select("id")
            .eq("user_id", user.id)
            .eq("kanji_word", lesson.kanji)
            .single();
        if (existing) vocabId = existing.id;
    }

    if (vocabId) {
        // 2. EXISTING: Link to new capture (Many-to-Many)
        // Try to insert into junction table if it exists
        const { error: junctionError } = await supabase
            .from("vocabulary_captures")
            .insert({
                vocabulary_id: vocabId,
                capture_id: captureId,
                user_id: user.id
            });

        if (junctionError) {
            // 2b. Fallback for 1:1 schema (if migration not run)
            // We just acknowledge the duplicate but can't link multiple
            console.warn("Could not link multiple captures (Migration likely missing):", junctionError.message);
        }

        return { success: true, merged: true };

    } else {
        // 3. NEW: Insert fresh record
        const { data: newVocab, error } = await supabase
            .from("vocabulary_items")
            .insert({
                user_id: user.id,
                capture_id: captureId, // Keep for backward compatibility
                kanji_word: lesson.kanji,
                reading_kana: lesson.reading,
                meaning_en: lesson.meaning,
                context_sentence_jp: lesson.context_usage.sentence,
                context_sentence_en: lesson.context_usage.english,
                srs_level: 0,
                next_review_at: new Date().toISOString(),
                detailed_data: lesson.detailed_data || null // Save rich data
            })
            .select()
            .single();

        if (error) {
            console.error("DB Save Error:", error);
            return { error: "Failed to save vocabulary" };
        }

        // Try to insert into junction table too
        // Try to insert into junction table too
        // Supabase typically returns { error } rather than throwing, but we check just in case
        const { error: junctionError2 } = await supabase
            .from("vocabulary_captures")
            .insert({
                vocabulary_id: newVocab.id,
                capture_id: captureId,
                user_id: user.id
            });

        if (junctionError2) {
            // Ignore or log debug
            // console.debug("Junction insert failed (optional):", junctionError2.message);
        }

        return { success: true };
    }
}
