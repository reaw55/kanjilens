"use server";

import { createClient } from "@/utils/supabase/server";

export type ConversationData = {
    word: string;
    reading: string;
    meaning: string;
    dialogue: {
        speaker: "A" | "B";
        japanese: string;
        romaji: string;
        english: string;
    }[];
};

export async function generateConversationsForWords(words: string[]): Promise<Record<string, ConversationData>> {
    if (!words || words.length === 0) return {};

    try {
        const supabase = await createClient();

        // 1. Check Cache
        const { data: cachedItems } = await supabase
            .from("word_conversation_cache")
            .select("*")
            .in("word", words);

        const cacheMap: Record<string, ConversationData> = {};
        const foundWords = new Set<string>();

        if (cachedItems) {
            cachedItems.forEach((item: any) => {
                cacheMap[item.word] = item.data;
                foundWords.add(item.word);
            });
        }

        // 2. Identify Missing
        const missingWords = words.filter(w => !foundWords.has(w));

        if (missingWords.length === 0) {
            return cacheMap;
        }

        // 3. Generate Missing
        console.log("Generating conversations for missing words:", missingWords);

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const prompt = `
            Generate distinct conversation scenarios for EACH of the following Japanese words:
            ${JSON.stringify(missingWords)}

            For each word, create a specific scenario where that word is used naturally.
            
            Requirements:
            1. Characters: Two speakers, "A" and "B".
            2. Length: VERY SHORT. Exactly 1 speech bubble per person (Total 2 lines of dialogue).
            3. Content: A simple, daily life interaction.
            4. Output: JSON Object where keys are the input words.
            
            Format per word:
            {
                "reading": "Kana reading of the word",
                "meaning": "English meaning",
                "dialogue": [
                    { "speaker": "A", "japanese": "JP text", "romaji": "Romaji", "english": "English translation" },
                    { "speaker": "B", "japanese": "JP text", "romaji": "Romaji", "english": "English translation" }
                ]
            }
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a Japanese tutor. Output valid JSON only." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content from AI");

        const newData = JSON.parse(content) as Record<string, ConversationData>;

        // 4. Save to Cache
        const inserts = Object.entries(newData).map(([word, data]) => ({
            word,
            data
        }));

        if (inserts.length > 0) {
            const { error } = await supabase
                .from("word_conversation_cache")
                .upsert(inserts);

            if (error) console.error("Cache Insert Error:", error);
        }

        // 5. Merge and Return
        return { ...cacheMap, ...newData };

    } catch (e) {
        console.error("Conversation Generation Failed", e);
        return {};
    }
}
