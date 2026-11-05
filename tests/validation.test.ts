import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, isUuid, MAX_WORD_LENGTH, normalizeWord, safeRedirectPath } from "@/lib/validation";

test("normalizeWord accepts words containing kanji and trims them", () => {
    assert.equal(normalizeWord("  日本語 "), "日本語");
    assert.equal(normalizeWord("食べる"), "食べる");
    assert.equal(normalizeWord("人々"), "人々");
});

test("normalizeWord rejects non-kanji, empty, overlong and non-string input", () => {
    assert.equal(normalizeWord("ひらがな"), null);
    assert.equal(normalizeWord("hello"), null);
    assert.equal(normalizeWord("   "), null);
    assert.equal(normalizeWord("日".repeat(MAX_WORD_LENGTH + 1)), null);
    assert.equal(normalizeWord(42), null);
    assert.equal(normalizeWord(null), null);
});

test("normalizeWord applies NFKC (full-width ASCII becomes half-width)", () => {
    assert.equal(normalizeWord("Ｔシャツ売場"), "Tシャツ売場");
});

test("cleanText collapses whitespace, trims and truncates", () => {
    assert.equal(cleanText("  a \n\t b  ", 50), "a b");
    assert.equal(cleanText("abcdef", 3), "abc");
    assert.equal(cleanText("   ", 10), null);
    assert.equal(cleanText(undefined, 10), null);
    assert.equal(cleanText({ toString: () => "x" }, 10), null);
});

test("safeRedirectPath only allows same-site relative paths", () => {
    assert.equal(safeRedirectPath("/vocab?x=1"), "/vocab?x=1");
    assert.equal(safeRedirectPath("/"), "/");
    assert.equal(safeRedirectPath("//evil.example"), "/");
    assert.equal(safeRedirectPath("/\\evil.example"), "/");
    assert.equal(safeRedirectPath("http://evil.example"), "/");
    assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
    assert.equal(safeRedirectPath("vocab"), "/");
    assert.equal(safeRedirectPath(undefined), "/");
    assert.equal(safeRedirectPath(null, "/login"), "/login");
});

test("isUuid", () => {
    assert.equal(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), true);
    assert.equal(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301"), true);
    assert.equal(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c330"), false);
    assert.equal(isUuid("../etc/passwd"), false);
    assert.equal(isUuid(123), false);
});
