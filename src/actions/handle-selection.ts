"use server";

import { saveVocabulary } from "@/actions/learn";
import { checkHuntMatch } from "@/actions/hunt";
import { redirect } from "next/navigation";

export async function handleSelection(formData: FormData) {
    const words = formData.getAll("words") as string[];
    const captureId = formData.get("captureId") as string;

    let huntResult = null;

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

        // CHECK HUNT
        const match = await checkHuntMatch(word);
        if (match.match) {
            huntResult = match;
        }
    }

    // 2. Redirect immediately
    // Pass hunt result via query params if exists
    if (huntResult) {
        const params = new URLSearchParams();
        params.set("hunt_word", huntResult.word!);
        params.set("hunt_xp", huntResult.xp?.toString() || "0");
        if (huntResult.levelComplete) {
            params.set("hunt_complete", "true");
            params.set("hunt_bonus", huntResult.bonusXP?.toString() || "0");
        }
        redirect(`/vocab?${params.toString()}`);
    }

    redirect("/vocab");
}
