"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addWordsFromCapture, ensureCaptureTranslation } from "@/actions/capture";
import { ImageHighlighter, type Detection } from "@/components/scan/image-highlighter";

const KANJI_CHAR_RE = /[㐀-䶿一-鿿々]/;

type WordPickerProps = {
    captureId: string;
    imageUrl: string;
    detections: Detection[]; // already filtered to entries that contain kanji
    ocrDimensions?: { width: number; height: number };
    initialTranslation: string | null;
    isMock: boolean;
    canTranslate: boolean;
};

export function WordPicker({
    captureId,
    imageUrl,
    detections,
    ocrDimensions,
    initialTranslation,
    isMock,
    canTranslate,
}: WordPickerProps) {
    const [filteredWords, setFilteredWords] = useState<Detection[]>(detections);
    const [highlightedWord, setHighlightedWord] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [translation, setTranslation] = useState<string | null>(initialTranslation);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    // Lazily fetch a translation the first time this capture is opened.
    useEffect(() => {
        if (translation || isMock || !canTranslate) return;
        let cancelled = false;
        ensureCaptureTranslation(captureId).then((res) => {
            if (!cancelled && res.translation) setTranslation(res.translation);
        });
        return () => {
            cancelled = true;
        };
    }, [captureId, translation, isMock, canTranslate]);

    const toggleWord = (word: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(word)) next.delete(word);
            else next.add(word);
            return next;
        });
    };

    // One chip per distinct word, plus its individual kanji that haven't appeared elsewhere.
    const groups = useMemo(() => {
        const uniqueWords = Array.from(new Map(filteredWords.map((w) => [w.description, w])).values());
        const seen = new Set<string>(uniqueWords.map((w) => w.description));
        return uniqueWords.map((w) => {
            const chars = Array.from(new Set(Array.from(w.description).filter((c) => KANJI_CHAR_RE.test(c))));
            const subItems = chars.filter((k) => !seen.has(k));
            subItems.forEach((k) => seen.add(k));
            return { word: w.description, subItems };
        });
    }, [filteredWords]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        if (selected.size === 0) {
            setError("Select at least one word.");
            return;
        }
        const formData = new FormData();
        formData.set("captureId", captureId);
        selected.forEach((w) => formData.append("words", w));
        startTransition(async () => {
            const res = await addWordsFromCapture(formData);
            if (res && "error" in res) setError(res.error);
        });
    };

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-50 pb-20">
            <div className="fixed top-0 left-0 right-0 p-4 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <Link
                    href="/scan"
                    aria-label="Back to scans"
                    className="pointer-events-auto inline-block p-2 rounded-full bg-black/40 backdrop-blur-md text-zinc-100"
                >
                    <span className="material-symbols-rounded">arrow_back</span>
                </Link>
            </div>

            <div className="relative w-full h-[60vh] bg-zinc-950">
                <ImageHighlighter
                    imageUrl={imageUrl}
                    detections={detections}
                    selectedWords={filteredWords}
                    highlightedWord={highlightedWord}
                    ocrDimensions={ocrDimensions}
                    onFilter={(filtered) => {
                        setFilteredWords(filtered);
                        // Auto-select the words captured by the lasso (but not when clearing).
                        if (filtered.length !== detections.length) {
                            setSelected((prev) => {
                                const next = new Set(prev);
                                filtered.forEach((w) => next.add(w.description));
                                return next;
                            });
                        }
                    }}
                />
                <div className="absolute bottom-4 left-4 right-4 text-xs text-amber-400 font-mono bg-black/60 p-2 rounded-lg backdrop-blur-sm pointer-events-none flex justify-between items-center">
                    <span>DETECTED {groups.length} WORDS</span>
                    <span className="text-zinc-400 text-[10px]">Draw to filter</span>
                </div>
            </div>

            <div className="bg-zinc-900 rounded-t-3xl min-h-[40vh] -mt-6 relative z-10 px-6 py-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
                <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-8" />

                <h2 className="text-2xl font-bold mb-2 headline-metallic">Select Words</h2>

                {isMock && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-xl text-red-200 text-xs flex items-center gap-2">
                        <span className="material-symbols-rounded text-lg">warning</span>
                        <div>
                            <strong>Placeholder OCR data:</strong> <br />
                            Google Vision credentials are not configured. Words and boxes are examples.
                        </div>
                    </div>
                )}

                {translation && (
                    <div className="mb-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 text-zinc-300 text-sm leading-relaxed">
                        <div className="flex items-center gap-2 mb-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
                            <span className="material-symbols-rounded text-sm">translate</span>
                            Context Translation
                        </div>
                        {translation}
                    </div>
                )}

                <p className="text-zinc-400 text-sm mb-6">Tap the words you want to add to your review deck.</p>

                <form onSubmit={handleSubmit}>
                    <div className="flex flex-wrap gap-2">
                        {groups.length === 0 && (
                            <div className="text-zinc-500 text-sm italic">
                                No kanji detected. Try scanning a clearer image.
                            </div>
                        )}

                        {groups.map(({ word, subItems }) => (
                            <div key={word} className="flex flex-col gap-1">
                                <button
                                    type="button"
                                    aria-pressed={selected.has(word)}
                                    onMouseEnter={() => setHighlightedWord(word)}
                                    onMouseLeave={() => setHighlightedWord(null)}
                                    onClick={() => toggleWord(word)}
                                    className={`inline-block px-4 py-2 rounded-xl border transition-all hover:bg-zinc-700 ${
                                        selected.has(word)
                                            ? "bg-amber-500 text-zinc-900 border-amber-400 font-bold hover:bg-amber-400"
                                            : "bg-zinc-800 border-zinc-700 text-zinc-300"
                                    }`}
                                >
                                    {word}
                                </button>

                                {subItems.length > 0 && (
                                    <div className="flex gap-2 pl-4 border-l-2 border-zinc-800 ml-2">
                                        {subItems.map((k) => (
                                            <button
                                                type="button"
                                                key={k}
                                                aria-pressed={selected.has(k)}
                                                onMouseEnter={() => setHighlightedWord(k)}
                                                onMouseLeave={() => setHighlightedWord(null)}
                                                onClick={() => toggleWord(k)}
                                                className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm transition-all hover:border-zinc-600 ${
                                                    selected.has(k)
                                                        ? "bg-amber-500/20 text-amber-500 border-amber-500/50 font-bold"
                                                        : "bg-zinc-900 border-zinc-800 text-zinc-500"
                                                }`}
                                            >
                                                {k}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div role="alert" className="mt-6 p-3 text-sm text-red-400 bg-red-500/10 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="mt-8">
                        <Button
                            type="submit"
                            disabled={isPending || selected.size === 0}
                            className="w-full h-12 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white font-bold text-lg"
                        >
                            {isPending
                                ? "Adding..."
                                : selected.size > 0
                                  ? `Add ${selected.size} to Review Deck`
                                  : "Add to Review Deck"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
