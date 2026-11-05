import { test } from "node:test";
import assert from "node:assert/strict";
import { getDisplayStreak, getLevelProgress } from "@/lib/progress";

test("getLevelProgress level boundaries", () => {
    assert.deepEqual(getLevelProgress(0), { level: 1, minXp: 0, nextXp: 100, percent: 0 });
    assert.equal(getLevelProgress(99).level, 1);
    assert.equal(getLevelProgress(99).percent, 99);
    assert.equal(getLevelProgress(100).level, 2);
    assert.equal(getLevelProgress(100).percent, 0);
    assert.equal(getLevelProgress(400).level, 3);
    assert.equal(getLevelProgress(400).minXp, 400);
    assert.equal(getLevelProgress(400).nextXp, 900);
});

test("getLevelProgress treats negative XP as zero", () => {
    assert.equal(getLevelProgress(-50).level, 1);
    assert.equal(getLevelProgress(-50).percent, 0);
});

test("getDisplayStreak keeps the streak only if the user studied today or yesterday (UTC)", () => {
    const today = new Date("2026-03-10T15:00:00Z");
    assert.equal(getDisplayStreak({ streak: 4, last_active_on: "2026-03-10" }, today), 4);
    assert.equal(getDisplayStreak({ streak: 4, last_active_on: "2026-03-09" }, today), 4);
    assert.equal(getDisplayStreak({ streak: 4, last_active_on: "2026-03-08" }, today), 0);
    assert.equal(getDisplayStreak({ streak: 4, last_active_on: null }, today), 0);
});
