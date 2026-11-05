import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLessonResponse } from "@/lib/lessons";
import { MAX_MEANING_LENGTH } from "@/lib/validation";

const good = {
    words: {
        水: {
            reading: "みず",
            meaning: "water",
            onyomi: "スイ",
            kunyomi: "みず",
            radical: "水",
            combinations: [{ word: "水曜日", reading: "すいようび", meaning: "Wednesday" }],
            example: { japanese: "水を飲みます。", reading: "みずをのみます。", english: "I drink water." },
        },
        学校: { reading: "がっこう", meaning: "school", onyomi: "ガク", kunyomi: "まなぶ" },
    },
};

test("parses a well-formed response", () => {
    const out = parseLessonResponse(JSON.stringify(good), ["水", "学校"]);
    assert.equal(out["水"].reading, "みず");
    assert.equal(out["水"].meaning, "water");
    assert.equal(out["水"].details.onyomi, "スイ");
    assert.equal(out["水"].details.combinations?.[0].word, "水曜日");
    assert.equal(out["水"].example?.english, "I drink water.");
    assert.equal(out["学校"].meaning, "school");
});

test("on/kun readings are kept only for single-kanji words", () => {
    const out = parseLessonResponse(JSON.stringify(good), ["学校"]);
    assert.equal(out["学校"].details.onyomi, undefined);
    assert.equal(out["学校"].details.kunyomi, undefined);
});

test("accepts a bare entry when a single word was requested", () => {
    const out = parseLessonResponse(JSON.stringify({ reading: "やま", meaning: "mountain" }), ["山"]);
    assert.equal(out["山"].reading, "やま");
});

test("words missing from the response are dropped, never invented", () => {
    const out = parseLessonResponse(JSON.stringify(good), ["水", "電車"]);
    assert.ok("水" in out);
    assert.ok(!("電車" in out));
});

test("non-kana readings and meanings without Latin letters are rejected", () => {
    const out = parseLessonResponse(
        JSON.stringify({
            words: {
                水: { reading: "mizu", meaning: "water" },
                山: { reading: "やま", meaning: "やま" },
                川: { reading: "かわ<script>", meaning: "river" },
            },
        }),
        ["水", "山", "川"]
    );
    assert.deepEqual(out, {});
});

test("oversized fields are truncated and junk combinations skipped", () => {
    const out = parseLessonResponse(
        JSON.stringify({
            words: {
                水: {
                    reading: "みず",
                    meaning: "water ".repeat(200),
                    combinations: [
                        "not an object",
                        { word: "abc", reading: "えー", meaning: "latin word" },
                        { word: "水", reading: "みず", meaning: "same as the word" },
                        { word: "水道", reading: "すいどう", meaning: "water supply" },
                        { word: "水着", reading: "みずぎ", meaning: "swimsuit" },
                        { word: "香水", reading: "こうすい", meaning: "perfume" },
                        { word: "水泳", reading: "すいえい", meaning: "swimming" },
                    ],
                },
            },
        }),
        ["水"]
    );
    assert.ok(out["水"].meaning.length <= MAX_MEANING_LENGTH);
    const combos = out["水"].details.combinations ?? [];
    assert.equal(combos.length, 3);
    assert.deepEqual(combos.map((c) => c.word), ["水道", "水着", "香水"]);
});

test("invalid or non-object JSON yields {}", () => {
    assert.deepEqual(parseLessonResponse("not json", ["水"]), {});
    assert.deepEqual(parseLessonResponse("[1,2,3]", ["水"]), {});
    assert.deepEqual(parseLessonResponse("null", ["水"]), {});
    assert.deepEqual(parseLessonResponse('"水"', ["水"]), {});
});
