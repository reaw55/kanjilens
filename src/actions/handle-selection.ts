"use server";

import { generateBatchLessons, saveVocabulary } from "@/actions/learn";
import { redirect } from "next/navigation";

export async function handleSelection(formData: FormData) {
    const words = formData.getAll("words") as string[];
    const captureId = formData.get("captureId") as string;

    // We don't wait for generation here anymore.
    // 1. Save Placeholders immediately
    for (const word of words) {
        // Check if exists first? Handled by saveVocabulary check or unique constraint?
        // saveVocabulary handles duplicates/linking.
        // We pass a dummy lesson object.
        const placeholder = {
            kanji: word,
            reading: "Generating...", // Indicator for UI
            meaning: "Processing definition...",
            context_usage: { sentence: "...", english: "..." },
            detailed_data: null // Pending Flag
        };

        await saveVocabulary(placeholder, captureId);
    }

    // 2. Redirect immediately
    redirect("/vocab");
}
