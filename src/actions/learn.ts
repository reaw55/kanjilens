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

export async function generateLesson(word: string, contextFullText: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    // Check for API Keys
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn("No OpenAI API Key found. Using Mock Lesson.");
        // Simulate delay
        await new Promise(r => setTimeout(r, 1500));
        return { success: true, lesson: { ...MOCK_LESSON, kanji: word } };
    }

    try {
        const openai = new OpenAI({ apiKey });

        const prompt = `
          Analyze the Japanese word "${word}".
          Context: "${contextFullText.substring(0, 200)}...".
          
          Return a valid JSON object with the following structure:
          {
            "kanji": "${word}",
            "reading": "romaji reading",
            "meaning": "English meaning",
            "explanation": "Brief explanation of the word's nuance or usage",
            "components": [
              { "kanji": "part", "meaning": "meaning of part" }
            ],
            "context_usage": {
              "sentence": "A simple example sentence using the word",
              "reading": "Romaji reading of the sentence",
              "english": "English translation of the sentence"
            }
          }
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: "You are a helpful Japanese language tutor. You always response in valid JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content returned from OpenAI");

        const lessonData = JSON.parse(content);

        // Ensure strictly structured data or fallback to some defaults if partial
        return { success: true, lesson: { ...MOCK_LESSON, ...lessonData, kanji: word } };

    } catch (error) {
        console.error("AI Generation Error:", error);
        // Fallback to mock on error to keep app usable
        return { success: true, lesson: { ...MOCK_LESSON, kanji: word } };
    }
}

export async function saveVocabulary(lesson: any, captureId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("vocabulary_items")
        .insert({
            user_id: user.id,
            capture_id: captureId,
            kanji_word: lesson.kanji,
            reading_kana: lesson.reading,
            meaning_en: lesson.meaning,
            context_sentence_jp: lesson.context_usage.sentence,
            context_sentence_en: lesson.context_usage.english,
            srs_level: 0,
            next_review_at: new Date().toISOString()
        });

    if (error) {
        console.error("DB Save Error:", error);
        return { error: "Failed to save vocabulary" };
    }

    return { success: true };
}
