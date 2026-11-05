"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { isAiEnabled } from "@/lib/openai";
import { generateLessons, MAX_WORDS_PER_CALL } from "@/lib/lessons";
import { STARTER_DECK } from "@/lib/starter-deck";
import {
    cleanText,
    isUuid,
    MAX_MEANING_LENGTH,
    MAX_READING_LENGTH,
    normalizeWord,
} from "@/lib/validation";
import type { VocabDetails, VocabItem, VocabSource, VocabStatus } from "@/lib/types";

export type VocabActionResult =
    | { ok: true; message?: string; id?: string; status?: VocabStatus; added?: number }
    | { ok: false; error: string };

export type ProcessPendingResult = {
    processed: number;
    failed: number;
    remaining: number;
    aiEnabled: boolean;
    rateLimited?: boolean;
    busy?: boolean;
    message?: string;
};

const HOUR = 60 * 60 * 1000;
const ADD_LIMIT_PER_HOUR = 200;
const AI_WORDS_PER_HOUR = 60;

const VOCAB_COLUMNS = `
    id, capture_id, kanji_word, reading_kana, meaning_en, context_sentence_jp, context_sentence_en,
    detailed_data, status, source, srs_level, next_review_at, correct_count, wrong_count, created_at`;

type VocabRow = Omit<VocabItem, "next_review_at" | "created_at"> & {
    next_review_at: Date | string;
    created_at: Date | string;
};

function toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toVocabItem(row: VocabRow): VocabItem {
    return { ...row, next_review_at: toIso(row.next_review_at), created_at: toIso(row.created_at) };
}

function revalidateVocab() {
    revalidatePath("/vocab");
    revalidatePath("/");
}

function checkAddLimit(userId: string): VocabActionResult | null {
    const limit = rateLimit(`vocab-add:${userId}`, ADD_LIMIT_PER_HOUR, HOUR);
    return limit.ok ? null : { ok: false, error: `Too many changes. Try again in ${formatRetry(limit.retryAfterMs)}.` };
}

/** All of the signed-in user's vocabulary, newest first. */
export async function listVocab(): Promise<VocabItem[]> {
    const user = await requireUser();
    const rows = await query<VocabRow>(
        `SELECT ${VOCAB_COLUMNS} FROM vocabulary_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5000`,
        [user.id]
    );
    return rows.map(toVocabItem);
}

/** Insert one word for a user. Returns the new id, or null if it already exists. */
async function insertWord(
    userId: string,
    word: string,
    reading: string | null,
    meaning: string | null,
    status: VocabStatus,
    source: VocabSource
): Promise<string | null> {
    const row = await queryOne<{ id: string }>(
        `INSERT INTO vocabulary_items (user_id, kanji_word, reading_kana, meaning_en, status, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, kanji_word) DO NOTHING
         RETURNING id`,
        [userId, word, reading, meaning, status, source]
    );
    return row?.id ?? null;
}

/** Add a word from the "Add a word" form. Fields: word (required), reading, meaning. */
export async function addWord(formData: FormData): Promise<VocabActionResult> {
    const user = await requireUser();
    const limited = checkAddLimit(user.id);
    if (limited) return limited;

    const word = normalizeWord(formData.get("word"));
    if (!word) return { ok: false, error: "Enter a word containing at least one kanji (16 characters max)." };
    const reading = cleanText(formData.get("reading"), MAX_READING_LENGTH);
    const meaning = cleanText(formData.get("meaning"), MAX_MEANING_LENGTH);

    let status: VocabStatus;
    if (reading && meaning) status = "ready";
    else if (isAiEnabled()) status = "pending";
    else return { ok: false, error: "AI fill-in isn't configured on this server. Please enter both the reading and the meaning." };

    const id = await insertWord(user.id, word, reading, meaning, status, "manual");
    if (!id) return { ok: false, error: `「${word}」 is already in your list.` };

    revalidateVocab();
    return {
        ok: true,
        id,
        status,
        message: status === "pending" ? `Added 「${word}」. Filling in the details…` : `Added 「${word}」.`,
    };
}

/** Edit the reading/meaning of one of the user's words. Both present => playable ('ready'). */
export async function updateWord(id: string, input: { reading: string; meaning: string }): Promise<VocabActionResult> {
    const user = await requireUser();
    if (!isUuid(id)) return { ok: false, error: "Word not found." };
    const limited = checkAddLimit(user.id);
    if (limited) return limited;

    const reading = cleanText(input?.reading, MAX_READING_LENGTH);
    const meaning = cleanText(input?.meaning, MAX_MEANING_LENGTH);
    const status: VocabStatus = reading && meaning ? "ready" : "needs_input";

    const row = await queryOne<{ id: string }>(
        `UPDATE vocabulary_items
            SET reading_kana = $3, meaning_en = $4, status = $5, updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING id`,
        [id, user.id, reading, meaning, status]
    );
    if (!row) return { ok: false, error: "Word not found." };

    revalidateVocab();
    return { ok: true, id, status, message: status === "ready" ? "Saved." : "Saved. Add both reading and meaning to use it in the game." };
}

export async function deleteWord(id: string): Promise<VocabActionResult> {
    const user = await requireUser();
    if (!isUuid(id)) return { ok: false, error: "Word not found." };

    const row = await queryOne<{ id: string }>(
        "DELETE FROM vocabulary_items WHERE id = $1 AND user_id = $2 RETURNING id",
        [id, user.id]
    );
    if (!row) return { ok: false, error: "Word not found." };

    revalidateVocab();
    return { ok: true, message: "Deleted." };
}

/** Seed the user's deck with common N5 words. Words already present are skipped. */
export async function addStarterDeck(): Promise<VocabActionResult> {
    const user = await requireUser();
    const limit = rateLimit(`vocab-starter:${user.id}`, 10, HOUR);
    if (!limit.ok) return { ok: false, error: `Try again in ${formatRetry(limit.retryAfterMs)}.` };

    const rows = await query<{ id: string }>(
        `INSERT INTO vocabulary_items (user_id, kanji_word, reading_kana, meaning_en, status, source)
         SELECT $1, w, r, m, 'ready', 'starter'
           FROM unnest($2::text[], $3::text[], $4::text[]) AS t(w, r, m)
         ON CONFLICT (user_id, kanji_word) DO NOTHING
         RETURNING id`,
        [
            user.id,
            STARTER_DECK.map((s) => s.word),
            STARTER_DECK.map((s) => s.reading),
            STARTER_DECK.map((s) => s.meaning),
        ]
    );

    revalidateVocab();
    const added = rows.length;
    return {
        ok: true,
        added,
        message: added === 0 ? "You already have every starter word." : `Added ${added} starter word${added === 1 ? "" : "s"}.`,
    };
}

/**
 * Add a word suggested in another word's details (a "combination").
 * If the suggestion's reading and meaning are passed it's playable immediately;
 * otherwise AI fills it in, or the user is asked to.
 */
export async function addRelatedWord(word: string, reading?: string, meaning?: string): Promise<VocabActionResult> {
    const user = await requireUser();
    const limited = checkAddLimit(user.id);
    if (limited) return limited;

    const normalized = normalizeWord(word);
    if (!normalized) return { ok: false, error: "That isn't a valid word." };
    const cleanReading = cleanText(reading, MAX_READING_LENGTH);
    const cleanMeaning = cleanText(meaning, MAX_MEANING_LENGTH);
    const status: VocabStatus =
        cleanReading && cleanMeaning ? "ready" : isAiEnabled() ? "pending" : "needs_input";

    const id = await insertWord(user.id, normalized, cleanReading, cleanMeaning, status, "related");
    if (!id) return { ok: false, error: `「${normalized}」 is already in your list.` };

    revalidateVocab();
    return { ok: true, id, status, message: `Added 「${normalized}」.` };
}

/** Ask AI to fill in a word that's waiting for input. */
export async function requestAiFill(id: string): Promise<VocabActionResult> {
    const user = await requireUser();
    if (!isAiEnabled()) return { ok: false, error: "AI fill-in isn't configured on this server." };
    if (!isUuid(id)) return { ok: false, error: "Word not found." };

    const row = await queryOne<{ id: string }>(
        `UPDATE vocabulary_items SET status = 'pending', updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status = 'needs_input'
          RETURNING id`,
        [id, user.id]
    );
    if (!row) return { ok: false, error: "Word not found." };

    revalidateVocab();
    return { ok: true, id, status: "pending" };
}

/**
 * Queue every word that's waiting for input (and still missing its reading or meaning)
 * for AI fill-in. The vocab page's polling loop then processes them within the hourly budget.
 */
export async function requestAiFillAll(): Promise<VocabActionResult> {
    const user = await requireUser();
    if (!isAiEnabled()) return { ok: false, error: "AI fill-in isn't configured on this server." };
    const limited = checkAddLimit(user.id);
    if (limited) return limited;

    const rows = await query<{ id: string }>(
        `UPDATE vocabulary_items SET status = 'pending', updated_at = now()
          WHERE id IN (
                SELECT id FROM vocabulary_items
                 WHERE user_id = $1 AND status = 'needs_input'
                   AND (coalesce(btrim(reading_kana), '') = '' OR coalesce(btrim(meaning_en), '') = '')
                 ORDER BY created_at
                 LIMIT 200)
            AND user_id = $1
          RETURNING id`,
        [user.id]
    );

    revalidateVocab();
    const added = rows.length;
    return {
        ok: true,
        added,
        message: added === 0 ? "Nothing to fill in." : `Filling in ${added} word${added === 1 ? "" : "s"}…`,
    };
}

declare global {
    var __kanjilensVocabProcessing: Set<string> | undefined;
}
const inFlight = (globalThis.__kanjilensVocabProcessing ??= new Set<string>());

async function countPending(userId: string): Promise<number> {
    const row = await queryOne<{ n: number }>(
        "SELECT count(*)::int AS n FROM vocabulary_items WHERE user_id = $1 AND status = 'pending'",
        [userId]
    );
    return row?.n ?? 0;
}

/**
 * Fill in up to MAX_WORDS_PER_CALL of the user's 'pending' words with AI.
 * Called repeatedly by the vocab page while anything is pending.
 */
export async function processPendingVocab(): Promise<ProcessPendingResult> {
    const user = await requireUser();

    if (!isAiEnabled()) {
        const flipped = await query(
            `UPDATE vocabulary_items SET status = 'needs_input', updated_at = now()
              WHERE user_id = $1 AND status = 'pending' RETURNING id`,
            [user.id]
        );
        if (flipped.length > 0) revalidateVocab();
        return { processed: 0, failed: flipped.length, remaining: 0, aiEnabled: false };
    }

    if (inFlight.has(user.id)) {
        return { processed: 0, failed: 0, remaining: await countPending(user.id), aiEnabled: true, busy: true };
    }
    inFlight.add(user.id);

    try {
        const pending = await query<{ id: string; kanji_word: string; context: string | null }>(
            `SELECT v.id, v.kanji_word, c.ocr_data->>'text' AS context
               FROM vocabulary_items v
               LEFT JOIN captures c ON c.id = v.capture_id AND c.user_id = v.user_id
              WHERE v.user_id = $1 AND v.status = 'pending'
              ORDER BY v.created_at
              LIMIT $2`,
            [user.id, MAX_WORDS_PER_CALL]
        );
        if (pending.length === 0) return { processed: 0, failed: 0, remaining: 0, aiEnabled: true };

        // Spend the per-user hourly AI budget one word at a time.
        const allowed: typeof pending = [];
        let retryAfterMs = 0;
        for (const item of pending) {
            const limit = rateLimit(`vocab-ai:${user.id}`, AI_WORDS_PER_HOUR, HOUR);
            if (!limit.ok) {
                retryAfterMs = limit.retryAfterMs;
                break;
            }
            allowed.push(item);
        }
        if (allowed.length === 0) {
            return {
                processed: 0,
                failed: 0,
                remaining: await countPending(user.id),
                aiEnabled: true,
                rateLimited: true,
                message: `AI fill-in limit reached. Try again in ${formatRetry(retryAfterMs)}.`,
            };
        }

        // Group by source text so each word gets its own capture as context.
        const groups = new Map<string, typeof allowed>();
        for (const item of allowed) {
            const key = item.context ?? "";
            groups.set(key, [...(groups.get(key) ?? []), item]);
        }

        let processed = 0;
        let failed = 0;
        for (const [context, items] of groups) {
            const lessons = await generateLessons(items.map((i) => i.kanji_word), context || null);
            for (const item of items) {
                const lesson = lessons[item.kanji_word];
                if (lesson) {
                    const details: VocabDetails = lesson.details;
                    // COALESCE keeps anything the user typed themselves.
                    await query(
                        `UPDATE vocabulary_items
                            SET reading_kana = COALESCE(reading_kana, $3),
                                meaning_en = COALESCE(meaning_en, $4),
                                context_sentence_jp = $5,
                                context_sentence_en = $6,
                                detailed_data = $7,
                                status = 'ready',
                                updated_at = now()
                          WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
                        [
                            item.id,
                            user.id,
                            lesson.reading,
                            lesson.meaning,
                            lesson.example?.japanese ?? null,
                            lesson.example?.english ?? null,
                            JSON.stringify(details),
                        ]
                    );
                    processed++;
                } else {
                    await query(
                        `UPDATE vocabulary_items SET status = 'needs_input', updated_at = now()
                          WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
                        [item.id, user.id]
                    );
                    failed++;
                }
            }
        }

        revalidateVocab();
        return { processed, failed, remaining: await countPending(user.id), aiEnabled: true };
    } finally {
        inFlight.delete(user.id);
    }
}
