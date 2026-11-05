import { test } from "node:test";
import assert from "node:assert/strict";
import * as srs from "@/lib/srs";

// SM-2 scheduling (see src/lib/srs.ts). Loosely typed so a change in the exact
// return shape shows up as a failing assertion rather than a compile error.
/* eslint-disable @typescript-eslint/no-explicit-any */
const { DEFAULT_EASE, MIN_EASE, RELEARN_MINUTES, qualityFromMistakes, sm2, scheduleReview } = srs as any;

const now = new Date("2026-01-01T00:00:00Z");
const DAY_MS = 86_400_000;
const near = (actual: number, expected: number, msg?: string) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `expected ${expected}, got ${actual}`);
const fresh = () => ({ repetitions: 0, easeFactor: DEFAULT_EASE, intervalDays: 0 });
/** scheduleReview may return the new state nested or spread; accept either. */
const stateOf = (r: any) => r.state ?? r;

test("constants", () => {
    assert.equal(DEFAULT_EASE, 2.5);
    assert.equal(MIN_EASE, 1.3);
    assert.equal(RELEARN_MINUTES, 10);
});

test("qualityFromMistakes maps mistakes to SM-2 quality", () => {
    assert.equal(qualityFromMistakes(0), 5);
    assert.equal(qualityFromMistakes(1), 3);
    assert.equal(qualityFromMistakes(2), 2);
    assert.equal(qualityFromMistakes(3), 1);
    assert.equal(qualityFromMistakes(10), 1);
});

test("sm2: perfect answers follow the classic 1, 6, round(I×EF) intervals", () => {
    let s = sm2(fresh(), 5);
    assert.equal(s.passed, true);
    assert.equal(s.repetitions, 1);
    assert.equal(s.intervalDays, 1);
    near(s.easeFactor, 2.6);

    s = sm2(s, 5);
    assert.equal(s.repetitions, 2);
    assert.equal(s.intervalDays, 6);
    near(s.easeFactor, 2.7);

    // Classic order: interval uses the EF *before* this answer's update: round(6 × 2.7) = 16.
    s = sm2(s, 5);
    assert.equal(s.repetitions, 3);
    assert.equal(s.intervalDays, 16, "interval should be computed with the old EF (6×2.7=16.2→16), not the new one (6×2.8=16.8→17)");
    near(s.easeFactor, 2.8);
});

test("sm2: ease factor updates by quality", () => {
    near(sm2(fresh(), 3).easeFactor, 2.36);
    near(sm2(fresh(), 4).easeFactor, 2.5);
    near(sm2(fresh(), 5).easeFactor, 2.6);
});

test("sm2: repeated hard passes floor the ease factor at 1.3", () => {
    let s = fresh();
    for (let i = 0; i < 20; i++) s = sm2(s, 3);
    near(s.easeFactor, MIN_EASE);
    assert.ok(s.easeFactor >= MIN_EASE);
});

test("sm2: a failed answer resets repetitions and interval but keeps EF", () => {
    const before = { repetitions: 4, easeFactor: 2.2, intervalDays: 30 };
    for (const q of [0, 1, 2]) {
        const s = sm2(before, q);
        assert.equal(s.passed, false);
        assert.equal(s.repetitions, 0);
        assert.equal(s.intervalDays, 1);
        near(s.easeFactor, 2.2);
    }
});

test("sm2 does not mutate its input", () => {
    const before = { repetitions: 2, easeFactor: 2.5, intervalDays: 6 };
    sm2(before, 5);
    assert.deepEqual(before, { repetitions: 2, easeFactor: 2.5, intervalDays: 6 });
});

test("scheduleReview: due + perfect → next review in intervalDays, 15 XP", () => {
    const r = scheduleReview({ state: { repetitions: 1, easeFactor: 2.6, intervalDays: 1 }, wasDue: true, mistakes: 0, now });
    const s = stateOf(r);
    assert.equal(s.repetitions, 2);
    assert.equal(s.intervalDays, 6);
    assert.equal(r.nextReviewAt.getTime(), now.getTime() + 6 * DAY_MS);
    assert.equal(r.xp, 15);
});

test("scheduleReview: due + pass with one mistake → 10 XP", () => {
    const r = scheduleReview({ state: fresh(), wasDue: true, mistakes: 1, now });
    assert.equal(stateOf(r).repetitions, 1);
    assert.equal(r.nextReviewAt.getTime(), now.getTime() + 1 * DAY_MS);
    assert.equal(r.xp, 10);
});

test("scheduleReview: due + fail → relearn in 10 minutes, reps reset, 0 XP", () => {
    const r = scheduleReview({ state: { repetitions: 3, easeFactor: 2.4, intervalDays: 15 }, wasDue: true, mistakes: 2, now });
    const s = stateOf(r);
    assert.equal(s.repetitions, 0);
    near(s.easeFactor, 2.4);
    assert.equal(r.nextReviewAt.getTime(), now.getTime() + RELEARN_MINUTES * 60_000);
    assert.equal(r.xp, 0);
});

test("scheduleReview: practice (not due) + pass leaves the schedule alone, 2 XP", () => {
    const state = { repetitions: 3, easeFactor: 2.4, intervalDays: 15 };
    const r = scheduleReview({ state, wasDue: false, mistakes: 0, now });
    const s = stateOf(r);
    assert.equal(s.repetitions, 3);
    assert.equal(s.intervalDays, 15);
    near(s.easeFactor, 2.4);
    assert.equal(r.nextReviewAt, null);
    assert.equal(r.xp, 2);
});

test("scheduleReview: practice (not due) + fail resets and relearns in 10 minutes", () => {
    const r = scheduleReview({ state: { repetitions: 3, easeFactor: 2.4, intervalDays: 15 }, wasDue: false, mistakes: 3, now });
    assert.equal(stateOf(r).repetitions, 0);
    assert.equal(r.nextReviewAt.getTime(), now.getTime() + RELEARN_MINUTES * 60_000);
    assert.equal(r.xp, 0);
});
