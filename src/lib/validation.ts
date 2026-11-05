const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value);
}

/** CJK Unified Ideographs (+ Extension A) and the iteration mark 々. */
export const KANJI_RE = /[㐀-䶿一-鿿々]/;

export const MAX_WORD_LENGTH = 16;
export const MAX_READING_LENGTH = 80;
export const MAX_MEANING_LENGTH = 120;

/** Normalize a vocabulary word: NFKC, trimmed, must contain a kanji and be short. */
export function normalizeWord(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const word = value.normalize("NFKC").trim();
    if (!word || word.length > MAX_WORD_LENGTH || !KANJI_RE.test(word)) return null;
    return word;
}

/** Trim and length-limit free text; returns null for empty. */
export function cleanText(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!text) return null;
    return text.slice(0, maxLength);
}

/** Only allow same-site relative redirect targets like "/vocab". */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
    if (typeof value !== "string") return fallback;
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
    return value;
}
