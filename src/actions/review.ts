"use server";

import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { scheduleReview } from "@/lib/srs";
import { isUuid } from "@/lib/validation";

const ROUND_SIZE = 5;
const MIN_ROUND_SIZE = 2;
const ROUND_TTL_MS = 2 * 60 * 60 * 1000;
const PERFECT_ROUND_BONUS = 10;

export type RoundCard = { id: string; kanji: string; reading: string; meaning: string; due: boolean };

export type StartRoundResult =
    | { ok: true; roundId: string; cards: RoundCard[] }
    | { ok: false; reason: "not_enough_words" | "rate_limited"; readyCount?: number };

export type SubmitRoundResult =
    | {
          ok: true;
          xpGained: number;
          perfectBonus: number;
          totalXp: number;
          streak: number;
          results: { id: string; correct: boolean; level: number }[];
      }
    | { ok: false; error: string };

type CardRow = { id: string; kanji_word: string; reading_kana: string; meaning_en: string; due: boolean };

/** Deal a new round: due words first, topped up with random practice words. */
export async function startRound(): Promise<StartRoundResult> {
    const user = await requireUser();
    if (!rateLimit(`round:${user.id}`, 120, 60 * 60 * 1000).ok) return { ok: false, reason: "rate_limited" };

    const playable = `user_id = $1 AND status = 'ready'
        AND reading_kana IS NOT NULL AND btrim(reading_kana) <> ''
        AND meaning_en IS NOT NULL AND btrim(meaning_en) <> ''`;

    const due = await query<CardRow>(
        `SELECT id, kanji_word, reading_kana, meaning_en, true AS due
           FROM vocabulary_items
          WHERE ${playable} AND next_review_at <= now()
          ORDER BY next_review_at ASC
          LIMIT $2`,
        [user.id, ROUND_SIZE]
    );

    let cards = due;
    if (cards.length < ROUND_SIZE) {
        const extra = await query<CardRow>(
            `SELECT id, kanji_word, reading_kana, meaning_en, false AS due
               FROM vocabulary_items
              WHERE ${playable} AND next_review_at > now()
              ORDER BY random()
              LIMIT $2`,
            [user.id, ROUND_SIZE - cards.length]
        );
        cards = [...cards, ...extra];
    }

    if (cards.length < MIN_ROUND_SIZE) {
        return { ok: false, reason: "not_enough_words", readyCount: cards.length };
    }

    const [round] = await query<{ id: string }>(
        "INSERT INTO review_rounds (user_id, item_ids) VALUES ($1, $2::uuid[]) RETURNING id",
        [user.id, cards.map((c) => c.id)]
    );

    return {
        ok: true,
        roundId: round.id,
        cards: cards.map((c) => ({
            id: c.id,
            kanji: c.kanji_word,
            reading: c.reading_kana.trim(),
            meaning: c.meaning_en.trim(),
            due: c.due,
        })),
    };
}

/**
 * Record a finished round. The server only trusts the per-card mistake counts; which
 * cards were dealt, whether they were due, and how much XP that is worth are all
 * decided here. A round can be submitted once, by its owner, within ROUND_TTL_MS.
 */
export async function submitRound(roundId: string, results: { id: string; mistakes: number }[]): Promise<SubmitRoundResult> {
    const user = await requireUser();

    if (!isUuid(roundId) || !Array.isArray(results) || results.length === 0 || results.length > ROUND_SIZE) {
        return { ok: false, error: "Invalid round." };
    }
    const mistakes = new Map<string, number>();
    for (const r of results) {
        if (!r || !isUuid(r.id) || !Number.isInteger(r.mistakes) || r.mistakes < 0 || r.mistakes > 100) {
            return { ok: false, error: "Invalid round." };
        }
        mistakes.set(r.id, r.mistakes);
    }

    const outcome = await withTransaction(async (client) => {
        const { rows: rounds } = await client.query<{ item_ids: string[]; created_at: Date; completed_at: Date | null }>(
            "SELECT item_ids, created_at, completed_at FROM review_rounds WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [roundId, user.id]
        );
        const round = rounds[0];
        if (!round) return { ok: false as const, error: "Round not found." };
        if (round.completed_at) return { ok: false as const, error: "This round was already submitted." };
        if (Date.now() - round.created_at.getTime() > ROUND_TTL_MS) {
            return { ok: false as const, error: "This round expired. Start a new one." };
        }
        const dealt = new Set(round.item_ids);
        if (dealt.size !== mistakes.size || [...mistakes.keys()].some((id) => !dealt.has(id))) {
            return { ok: false as const, error: "Results don't match the round." };
        }

        const { rows: items } = await client.query<{ id: string; srs_level: number; next_review_at: Date }>(
            `SELECT id, srs_level, next_review_at FROM vocabulary_items
              WHERE user_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE`,
            [user.id, round.item_ids]
        );

        let xpGained = 0;
        const perItem: { id: string; correct: boolean; level: number }[] = [];
        for (const item of items) {
            const correct = (mistakes.get(item.id) ?? 1) === 0;
            const wasDue = item.next_review_at.getTime() <= round.created_at.getTime();
            const next = scheduleReview({ level: item.srs_level, wasDue, correct });
            xpGained += next.xp;
            perItem.push({ id: item.id, correct, level: next.level });

            await client.query(
                `UPDATE vocabulary_items
                    SET srs_level = $3,
                        next_review_at = COALESCE($4, next_review_at),
                        correct_count = correct_count + $5,
                        wrong_count = wrong_count + $6,
                        last_reviewed_at = now(),
                        updated_at = now()
                  WHERE id = $1 AND user_id = $2`,
                [
                    item.id,
                    user.id,
                    next.level,
                    next.nextReviewAt,
                    correct ? 1 : 0,
                    correct ? 0 : 1,
                ]
            );
        }

        const perfect = perItem.length >= 3 && perItem.every((r) => r.correct);
        const perfectBonus = perfect ? PERFECT_ROUND_BONUS : 0;
        xpGained += perfectBonus;

        await client.query("UPDATE review_rounds SET completed_at = now(), xp_awarded = $2 WHERE id = $1", [
            roundId,
            xpGained,
        ]);

        // Streak counts calendar days (UTC) with at least one finished round.
        const { rows: updated } = await client.query<{ xp: number; streak: number }>(
            `UPDATE users
                SET xp = xp + $2,
                    streak = CASE
                        WHEN last_active_on = (now() AT TIME ZONE 'UTC')::date THEN streak
                        WHEN last_active_on = (now() AT TIME ZONE 'UTC')::date - 1 THEN streak + 1
                        ELSE 1 END,
                    last_active_on = (now() AT TIME ZONE 'UTC')::date,
                    updated_at = now()
              WHERE id = $1
              RETURNING xp, streak`,
            [user.id, xpGained]
        );

        return {
            ok: true as const,
            xpGained,
            perfectBonus,
            totalXp: updated[0].xp,
            streak: updated[0].streak,
            results: perItem,
        };
    });

    if (outcome.ok) revalidatePath("/");
    return outcome;
}
