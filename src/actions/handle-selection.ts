"use server";

import { generateBatchLessons, saveVocabulary } from "@/actions/learn";
import { redirect } from "next/navigation";

export async function handleSelection(formData: FormData) {
    const words = formData.getAll("words") as string[];
    const captureId = formData.get("captureId") as string;
    const fullText = formData.get("fullText") as string;

    if (words.length === 0) {
        return; // Or handle error
    }

    // 1. Batch Generate (Single API Call)
    const { lessons } = await generateBatchLessons(words, fullText);

    if (lessons) {
        // 2. Save / Link All
        // We can run these DB writes in parallel as they are independent
        await Promise.all(lessons.map(lesson => saveVocabulary(lesson, captureId)));
    }

    redirect("/vocab");
}
