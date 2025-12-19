"use server";

import { generateLesson, saveVocabulary } from "@/actions/learn";
import { redirect } from "next/navigation";

export async function handleSelection(formData: FormData) {
    const words = formData.getAll("words") as string[];
    const captureId = formData.get("captureId") as string;
    const fullText = formData.get("fullText") as string;

    if (words.length === 0) {
        return; // Or handle error
    }

    // Determine context. For MVP, just pass the full text block.
    // In reality, we might want to find the sentence containing the word.

    for (const word of words) {
        // 1. Generate Content
        const { lesson, error } = await generateLesson(word, fullText);

        if (lesson) {
            // 2. Save
            await saveVocabulary(lesson, captureId);
        }
    }

    redirect("/vocab");
}
