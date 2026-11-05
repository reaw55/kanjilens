export type VocabStatus = "pending" | "ready" | "needs_input";
export type VocabSource = "scan" | "manual" | "starter" | "related" | "import";

/** Optional rich data produced by the AI lesson generator. All fields may be missing. */
export type VocabDetails = {
    onyomi?: string;
    kunyomi?: string;
    radical?: string;
    combinations?: { word: string; reading: string; meaning: string }[];
    example?: { japanese: string; reading?: string; english: string };
};

export type VocabItem = {
    id: string;
    capture_id: string | null;
    kanji_word: string;
    reading_kana: string | null;
    meaning_en: string | null;
    context_sentence_jp: string | null;
    context_sentence_en: string | null;
    detailed_data: VocabDetails | null;
    status: VocabStatus;
    source: VocabSource;
    srs_level: number;
    next_review_at: string;
    correct_count: number;
    wrong_count: number;
    created_at: string;
};

export type CaptureSummary = {
    id: string;
    created_at: string;
    text_preview: string;
    word_count: number;
};
