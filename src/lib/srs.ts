/** Minutes until the next review for each SRS level (index = level after answering). */
export const SRS_INTERVALS_MIN = [
    10, // 0: just missed, see it again soon
    60 * 24, // 1: 1 day
    60 * 24 * 3, // 2: 3 days
    60 * 24 * 7, // 3: 1 week
    60 * 24 * 14, // 4: 2 weeks
    60 * 24 * 30, // 5: 1 month
    60 * 24 * 90, // 6: 3 months
];
export const MAX_SRS_LEVEL = SRS_INTERVALS_MIN.length - 1;

/** nextReviewAt is null when the schedule should stay as it is. */
export type ReviewOutcome = { level: number; nextReviewAt: Date | null; xp: number };

/**
 * Schedule an item after a round.
 * Due items move up/down the ladder. Extra "practice" items (dealt before they were due)
 * don't earn promotions, but a miss still demotes them so weak words come back sooner.
 */
export function scheduleReview(opts: { level: number; wasDue: boolean; correct: boolean; now?: Date }): ReviewOutcome {
    const now = opts.now ?? new Date();
    const after = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

    if (!opts.correct) {
        const level = Math.max(0, opts.level - 1);
        return { level, nextReviewAt: after(SRS_INTERVALS_MIN[0]), xp: 0 };
    }
    if (!opts.wasDue) {
        return { level: opts.level, nextReviewAt: null, xp: 2 };
    }
    const level = Math.min(MAX_SRS_LEVEL, opts.level + 1);
    return { level, nextReviewAt: after(SRS_INTERVALS_MIN[level]), xp: 10 + level * 2 };
}
