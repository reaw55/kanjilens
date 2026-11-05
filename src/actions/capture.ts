"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit, formatRetry } from "@/lib/rate-limit";
import { getOpenAI, isAiEnabled, OPENAI_MODEL } from "@/lib/openai";
import { isUuid, normalizeWord } from "@/lib/validation";
import { detectText, MOCK_TEXT_PREFIX, type OcrDetection } from "@/lib/ocr";
import {
    deleteUpload,
    extensionFor,
    saveUpload,
    sniffImageType,
    stripJpegMetadata,
} from "@/lib/storage";

// NOTE: every export in this file is a publicly callable Server Action endpoint.
// Each one must authenticate and scope its queries to the current user.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOADS_PER_HOUR = 30;
const TRANSLATIONS_PER_HOUR = 60;
const MAX_WORDS_PER_SUBMIT = 30;
const MAX_TRANSLATION_INPUT = 2000;

type StoredOcr = {
    text: string;
    detections: { description: string; boundingPoly: { vertices: { x: number; y: number }[] } }[];
    page: { width: number; height: number } | null;
};

/** Keep only what the UI needs from the Vision response (the full annotation is very large). */
function compactOcr(result: { text: string; detections?: OcrDetection[]; details?: unknown }): StoredOcr {
    const detections = (result.detections ?? [])
        .filter((d) => typeof d.description === "string" && d.description.length > 0)
        .map((d) => ({
            description: d.description as string,
            boundingPoly: {
                vertices: (d.boundingPoly?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 })),
            },
        }));
    const firstPage = (result.details as { pages?: { width?: number; height?: number }[] } | null)?.pages?.[0];
    const page =
        firstPage && typeof firstPage.width === "number" && typeof firstPage.height === "number"
            ? { width: firstPage.width, height: firstPage.height }
            : null;
    return { text: result.text, detections, page };
}

export async function uploadCapture(formData: FormData): Promise<{ captureId: string } | { error: string }> {
    const user = await requireUser();

    const limit = rateLimit(`upload:${user.id}`, UPLOADS_PER_HOUR, 60 * 60 * 1000);
    if (!limit.ok) {
        return { error: `Upload limit reached. Try again in ${formatRetry(limit.retryAfterMs)}.` };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return { error: "No image was uploaded." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return { error: "Image is too large (max 10 MB)." };
    }

    let data: Buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageType(data);
    if (!mime) {
        return { error: "Unsupported image. Please upload a JPEG, PNG or WebP photo." };
    }
    if (mime === "image/jpeg") {
        data = stripJpegMetadata(data);
    }

    const imageHash = createHash("sha256").update(data).digest("hex");

    const existing = await queryOne<{ id: string }>(
        "SELECT id FROM captures WHERE user_id = $1 AND image_hash = $2",
        [user.id, imageHash]
    );
    if (existing) {
        return { captureId: existing.id };
    }

    let fileName: string;
    try {
        fileName = await saveUpload(user.id, data, extensionFor(mime));
    } catch (error) {
        console.error("Failed to store upload:", error);
        return { error: "Could not save the image. Please try again." };
    }

    const inserted = await queryOne<{ id: string }>(
        `INSERT INTO captures (user_id, file_name, mime_type, byte_size, image_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, image_hash) DO NOTHING
         RETURNING id`,
        [user.id, fileName, mime, data.length, imageHash]
    );

    if (!inserted) {
        // A concurrent upload of the same image won the race; reuse it.
        await deleteUpload(fileName).catch(() => {});
        const winner = await queryOne<{ id: string }>(
            "SELECT id FROM captures WHERE user_id = $1 AND image_hash = $2",
            [user.id, imageHash]
        );
        return winner ? { captureId: winner.id } : { error: "Could not save the image. Please try again." };
    }

    const ocr = await detectText(data);
    if ("error" in ocr) {
        // Don't keep a capture we couldn't read; the user can simply retry.
        await query("DELETE FROM captures WHERE id = $1 AND user_id = $2", [inserted.id, user.id]);
        await deleteUpload(fileName).catch(() => {});
        return { error: ocr.error };
    }

    await query("UPDATE captures SET ocr_data = $1 WHERE id = $2 AND user_id = $3", [
        JSON.stringify(compactOcr(ocr)),
        inserted.id,
        user.id,
    ]);

    revalidatePath("/scan");
    return { captureId: inserted.id };
}

async function translateText(text: string): Promise<string | null> {
    const openai = getOpenAI();
    if (!openai) return null;
    try {
        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content:
                        "You are a translator. Translate the Japanese text to English. Output ONLY the translation. If text is garbled, provide a SINGLE sentence summary. Max length: 50 words. No notes. No explanations.",
                },
                {
                    role: "user",
                    content: `Translate this text found on a sign/image:\n\n${text.slice(0, MAX_TRANSLATION_INPUT)}`,
                },
            ],
        });
        const output = completion.choices[0]?.message?.content?.trim();
        return output ? output.slice(0, 1000) : null;
    } catch (error) {
        console.error("Translation failed:", error);
        return null;
    }
}

/** Return the capture's English translation, generating it on first request if AI is configured. */
export async function ensureCaptureTranslation(captureId: string): Promise<{ translation: string | null }> {
    const user = await requireUser();
    if (!isUuid(captureId)) return { translation: null };

    const capture = await queryOne<{ translation: string | null; text: string | null }>(
        "SELECT translation, ocr_data->>'text' AS text FROM captures WHERE id = $1 AND user_id = $2",
        [captureId, user.id]
    );
    if (!capture) return { translation: null };
    if (capture.translation) return { translation: capture.translation };
    if (!capture.text || capture.text.startsWith(MOCK_TEXT_PREFIX) || !isAiEnabled()) {
        return { translation: null };
    }

    if (!rateLimit(`translate:${user.id}`, TRANSLATIONS_PER_HOUR, 60 * 60 * 1000).ok) {
        return { translation: null };
    }

    const translation = await translateText(capture.text);
    if (translation) {
        await query(
            "UPDATE captures SET translation = $1 WHERE id = $2 AND user_id = $3 AND translation IS NULL",
            [translation, captureId, user.id]
        );
    }
    return { translation };
}

export async function deleteCapture(captureId: string): Promise<{ success: true } | { error: string }> {
    const user = await requireUser();
    if (!isUuid(captureId)) return { error: "Capture not found." };

    const deleted = await queryOne<{ file_name: string }>(
        "DELETE FROM captures WHERE id = $1 AND user_id = $2 RETURNING file_name",
        [captureId, user.id]
    );
    if (!deleted) return { error: "Capture not found." };

    try {
        await deleteUpload(deleted.file_name);
    } catch (error) {
        console.error("Failed to delete capture file:", error);
    }

    revalidatePath("/scan");
    return { success: true };
}

/** Add the selected words from a capture to the user's vocabulary, then go to /vocab. */
export async function addWordsFromCapture(formData: FormData): Promise<{ error: string } | void> {
    const user = await requireUser();

    const captureId = formData.get("captureId");
    if (!isUuid(captureId)) return { error: "Capture not found." };

    const owned = await queryOne<{ id: string }>("SELECT id FROM captures WHERE id = $1 AND user_id = $2", [
        captureId,
        user.id,
    ]);
    if (!owned) return { error: "Capture not found." };

    const words = Array.from(
        new Set(
            formData
                .getAll("words")
                .map((w) => normalizeWord(w))
                .filter((w): w is string => w !== null)
        )
    ).slice(0, MAX_WORDS_PER_SUBMIT);

    if (words.length === 0) return { error: "Select at least one word." };

    await query(
        `INSERT INTO vocabulary_items (user_id, capture_id, kanji_word, source, status)
         SELECT $1, $2, w, 'scan', $4 FROM unnest($3::text[]) AS w
         ON CONFLICT (user_id, kanji_word) DO NOTHING`,
        [user.id, captureId, words, isAiEnabled() ? "pending" : "needs_input"]
    );

    revalidatePath("/vocab");
    revalidatePath("/");
    redirect("/vocab");
}
