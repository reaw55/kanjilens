/**
 * Spaced-repetition scheduling using the SM-2 algorithm (SuperMemo 2, P. Woźniak 1987).
 *
 * Each word carries an SM-2 state: how many times in a row it has been recalled
 * (`repetitions`), its ease factor (`easeFactor`, ≥ 1.3) and the current interval in days.
 * A round grades every card 0–5 from how many wrong drops it took.
 */

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
/** SM-2 says to repeat failed items within the same session; we bring them back after this many minutes. */
export const RELEARN_MINUTES = 10;

export type Sm2State = { repetitions: number; easeFactor: number; intervalDays: number };

/**
 * Map wrong drops on a card to an SM-2 quality grade.
 * Each card has two slots, so one wrong drop already means "correct with serious difficulty".
 */
export function qualityFromMistakes(mistakes: number): number {
    if (!Number.isFinite(mistakes) || mistakes <= 0) return 5;
    if (mistakes === 1) return 3;
    if (mistakes === 2) return 2;
    return 1;
}

function clampQuality(quality: number): number {
    if (!Number.isFinite(quality)) return 0;
    return Math.min(5, Math.max(0, Math.round(quality)));
}

function safeEase(ease: number): number {
    return Number.isFinite(ease) && ease >= MIN_EASE ? ease : MIN_EASE;
}

/** One classic SM-2 step. */
export function sm2(state: Sm2State, quality: number): Sm2State & { passed: boolean } {
    const q = clampQuality(quality);
    const easeFactor = safeEase(state.easeFactor);
    const repetitions = Math.max(0, Math.floor(Number.isFinite(state.repetitions) ? state.repetitions : 0));
    const intervalDays = Math.max(0, Number.isFinite(state.intervalDays) ? state.intervalDays : 0);

    if (q < 3) {
        return { repetitions: 0, easeFactor, intervalDays: 1, passed: false };
    }

    const nextInterval =
        repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(intervalDays * easeFactor);
    const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    // SM-2's EF deltas are exact to 2 decimals; rounding keeps floating-point drift out of the DB.
    const nextEase = Math.max(MIN_EASE, Math.round((easeFactor + delta) * 100) / 100);

    return { repetitions: repetitions + 1, easeFactor: nextEase, intervalDays: nextInterval, passed: true };
}

/**
 * Schedule a card after a round.
 * - Due cards follow SM-2. A pass is scheduled `intervalDays` ahead; a fail comes back in
 *   RELEARN_MINUTES (and its SM-2 state resets).
 * - Cards dealt before they were due (practice / weak-words rounds) can't earn a promotion,
 *   but a fail still resets them so weak words come back sooner.
 */
export function scheduleReview(opts: {
    state: Sm2State;
    wasDue: boolean;
    mistakes: number;
    now?: Date;
}): { state: Sm2State; nextReviewAt: Date | null; quality: number; passed: boolean; xp: number } {
    const now = opts.now ?? new Date();
    const quality = qualityFromMistakes(opts.mistakes);
    const relearnAt = new Date(now.getTime() + RELEARN_MINUTES * 60_000);

    if (!opts.wasDue && quality >= 3) {
        const { repetitions, easeFactor, intervalDays } = opts.state;
        return { state: { repetitions, easeFactor, intervalDays }, nextReviewAt: null, quality, passed: true, xp: 2 };
    }

    const { passed, ...state } = sm2(opts.state, quality);
    if (!passed) {
        return { state, nextReviewAt: relearnAt, quality, passed, xp: 0 };
    }
    return {
        state,
        nextReviewAt: new Date(now.getTime() + state.intervalDays * 86_400_000),
        quality,
        passed,
        xp: quality === 5 ? 15 : 10,
    };
}
