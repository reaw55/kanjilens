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
    },
    detailed_data: {
        basicInfo: { meaning: "Japanese Language", radical: "言" },
        readings: {
            onyomi: { kana: "ニホンゴ", note: "Standard" },
            kunyomi: { kana: "にほんご", note: "" }
        },
        combinations: [
            { word: "日本", reading: "Nihon", meaning: "Japan", targetKanji: "本" }
        ],
        dialogue: [
            { speaker: "A", japanese: "日本語わかりますか？", english: "Do you understand Japanese?" },
            { speaker: "B", japanese: "はい、少し。", english: "Yes, a little." }
        ]
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

    // FILTER: Learn if (New) OR (Existing but Empty/Pending)
    const wordsToLearn = words.filter(w => {
        const ex = existingMap.get(w);
        if (!ex) return true; // New
        // If it exists but has no detailed_data, we treat it as "New" to generate
        if (!ex.detailed_data || Object.keys(ex.detailed_data as object).length === 0) return true;
        return false;
    });

    const results: any[] = [];

    // 2. Add Existing Items (ONLY if fully populated)
    existingMap.forEach((item) => {
        // Only return it as "done" if we aren't planning to relearn it
        if (!wordsToLearn.includes(item.kanji_word)) {
            results.push({
                kanji: item.kanji_word,
                reading: item.reading_kana,
                meaning: item.meaning_en,
                context_usage: {
                    sentence: item.context_sentence_jp,
                    english: item.context_sentence_en
                },
                id: item.id,
                detailed_data: item.detailed_data,
                existing: true
            });
        }
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
          
          STRICT JSON OUTPUT STRUCTURE:
          Return a JSON Object where keys are the requested words.
          Example:
          {
            "Word1": { ... data ... },
            "Word2": { ... data ... }
          }

          Data Structure for each word:
          {
            "currentKanji": "The Kanji itself",
            "basicInfo": {
                "meaning": "English keywords separated by slashes",
                "radical": "Root component"
            },
            "readings": {
                "onyomi": { "kana": "Katakana", "note": "Note" },
                "kunyomi": { "kana": "Hiragana", "note": "Note" }
            },
            "combinations": [
                {
                    "word": "Compound",
                    "reading": "Reading", 
                    "meaning": "Meaning",
                    "targetKanji": "Partner Kanji"
                }
            ],
            "dialogue": [
                { "speaker": "A", "japanese": "JP Sentence", "english": "EN Translation" },
                { "speaker": "B", "japanese": "JP Response", "english": "EN Translation" }
            ],
            "context_usage": {
                "sentence": "Sentence from dialogue",
                "reading": "Romaji reading",
                "english": "Translation"
            }
          }
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

        let aiData = JSON.parse(content);

        // ROBUSTNESS: Handle case where AI returns the item directly for single-word queries
        if (wordsToLearn.length === 1 && !aiData[wordsToLearn[0]] && (aiData.currentKanji || aiData.basicInfo)) {
            aiData = { [wordsToLearn[0]]: aiData };
        }

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

export async function saveVocabulary(lesson: any, captureId: string | null, source: string = "scan") {
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
        // 2. EXISTING: Link to new capture (Many-to-Many) if captureId exists
        if (captureId) {
            const { error: junctionError } = await supabase
                .from("vocabulary_captures")
                .insert({
                    vocabulary_id: vocabId,
                    capture_id: captureId,
                    user_id: user.id
                });
            // Ignore duplicate/policy errors for simplicity
        }

        // Update detailed data if provided (Enrichment)
        if (lesson.detailed_data) {
            await supabase.from("vocabulary_items")
                .update({
                    detailed_data: lesson.detailed_data,
                    meaning_en: lesson.meaning,
                    reading_kana: lesson.reading,
                    context_sentence_jp: lesson.context_usage?.sentence,
                    context_sentence_en: lesson.context_usage?.english,
                    // We don't overwrite source for existing items
                })
                .eq("id", vocabId);
        }

        return { success: true, merged: true };

    } else {
        // 3. NEW: Insert fresh record
        const { data: newVocab, error } = await supabase
            .from("vocabulary_items")
            .insert({
                user_id: user.id,
                capture_id: captureId || null, // Optional for related words
                kanji_word: lesson.kanji,
                reading_kana: lesson.reading,
                meaning_en: lesson.meaning,
                context_sentence_jp: lesson.context_usage?.sentence,
                context_sentence_en: lesson.context_usage?.english,
                srs_level: 0,
                next_review_at: new Date().toISOString(),
                detailed_data: lesson.detailed_data || null, // Save rich data
                source: source // Track where it came from
            })
            .select()
            .single();

        if (error) {
            console.error("DB Save Error:", error);
            return { error: "Failed to save vocabulary" };
        }

        // Link capture if exists
        if (captureId) {
            await supabase.from("vocabulary_captures").insert({
                vocabulary_id: newVocab.id,
                capture_id: captureId,
                user_id: user.id
            });
        }

        return { success: true };
    }
}

export async function processPendingVocab() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const { data: pendingItems } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .is("detailed_data", null)
        .limit(5);

    if (!pendingItems || pendingItems.length === 0) {
        return { success: true, count: 0 };
    }

    const processes = pendingItems.map(async (item) => {
        let contextText = "Japanese Item";
        if (item.capture_id) {
            const { data: cap } = await supabase.from("captures").select("ocr_data").eq("id", item.capture_id).single();
            if (cap?.ocr_data?.text) contextText = cap.ocr_data.text;
        }

        const result = await generateBatchLessons([item.kanji_word], contextText);

        if (result.success && result.lessons && result.lessons.length > 0) {
            const richLesson = result.lessons[0];
            await supabase.from("vocabulary_items")
                .update({
                    reading_kana: richLesson.reading,
                    meaning_en: richLesson.meaning,
                    context_sentence_jp: richLesson.context_usage?.sentence,
                    context_sentence_en: richLesson.context_usage?.english,
                    detailed_data: richLesson.detailed_data
                })
                .eq("id", item.id);
            return 1;
        }
        return 0;
    });

    const results = await Promise.all(processes);
    const processedCount = results.reduce((a, b) => a + b, 0);

    return { success: true, count: processedCount };
}

export async function deleteVocabulary(vocabId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    // 1. Delete Junctions first (Cascade might handle this, but explicit is safer)
    await supabase.from("vocabulary_captures").delete().eq("vocabulary_id", vocabId).eq("user_id", user.id);

    // 2. Delete the Item
    const { error } = await supabase
        .from("vocabulary_items")
        .delete()
        .eq("id", vocabId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Delete Error", error);
        return { error: "Failed to delete" };
    }

    return { success: true };
}
