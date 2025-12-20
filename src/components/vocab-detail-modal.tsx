"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Types corresponding to our JSON structure
type DetailedData = {
    basicInfo?: {
        meaning: string;
        radical: string;
    };
    readings?: {
        onyomi?: { kana: string; note: string };
        kunyomi?: { kana: string; note: string };
    };
    combinations?: {
        word: string;
        reading: string;
        meaning: string;
        targetKanji: string;
    }[];
    dialogue?: {
        speaker: string;
        japanese: string;
        english: string;
    }[];

    // Legacy support for older structure if any
    kanji_breakdown?: any[];
};

type VocabDetailModalProps = {
    vocab: any;
    existingWords?: Set<string>;
    onJumpTo?: (word: string) => void;
    onClose: () => void;
};

export function VocabDetailModal({ vocab, existingWords, onJumpTo, onClose }: VocabDetailModalProps) {
    if (!vocab) return null;

    // Normalize Data (Handle both new rich structure and legacy/fallback)
    const detailed = (vocab.detailed_data as DetailedData) || {};

    // Helper to get Combinations
    // Support both new `combinations` root key and old `kanji_breakdown[].combinations`
    const combinations = detailed.combinations || (detailed.kanji_breakdown?.[0]?.combinations) || [];

    // Helper to get Readings
    const onyomi = detailed.readings?.onyomi ||
        (detailed.kanji_breakdown?.[0]?.onyomi ? { kana: detailed.kanji_breakdown[0].onyomi.join('/'), note: "" } : null);
    const kunyomi = detailed.readings?.kunyomi ||
        (detailed.kanji_breakdown?.[0]?.kunyomi ? { kana: detailed.kanji_breakdown[0].kunyomi.join('/'), note: "" } : null);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-zinc-950 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-800 shadow-2xl relative scrollbar-hide"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-50 p-2 bg-zinc-900/80 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                    <span className="material-symbols-rounded text-xl">close</span>
                </button>

                <div className="p-6 pb-20">

                    {/* 1. HERO HEADER */}
                    <div className="flex flex-col items-center justify-center mb-8 mt-4">
                        <div className="relative group w-full flex justify-center">
                            <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full opacity-50" />
                            <div className={cn(
                                "bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/5 transition-all duration-300",
                                vocab.kanji_word.length > 1
                                    ? "w-auto px-12 py-8 min-w-[120px]"
                                    : "w-32 h-32"
                            )}>
                                <h1 className={cn(
                                    "font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent text-center leading-tight",
                                    vocab.kanji_word.length > 1 ? "text-4xl" : "text-6xl"
                                )}>
                                    {vocab.kanji_word}
                                </h1>
                            </div>
                        </div>
                        <p className="mt-4 text-xl font-medium text-amber-500 tracking-wide">{vocab.reading_kana}</p>
                        <p className="text-zinc-400 font-light mt-1">{vocab.meaning_en}</p>

                        {/* Basic Info Pill - Radical removed as requested */}
                        {/* 
                        {detailed.basicInfo && (
                            <div className="flex gap-2 mt-3">
                                <span className="px-2 py-1 bg-zinc-900 rounded-md text-[10px] text-zinc-500 border border-zinc-800">
                                    Radical: {detailed.basicInfo.radical}
                                </span>
                            </div>
                        )}
                        */}
                    </div>

                    {/* 2. READINGS */}
                    {(onyomi || kunyomi) && (
                        <section className="mb-8">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Readings</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                    <div className="text-[10px] text-amber-500/80 mb-1 font-mono uppercase">Onyomi</div>
                                    <div className="font-medium text-zinc-200">{onyomi?.kana || "—"}</div>
                                    <div className="text-[10px] text-zinc-500 mt-1">{onyomi?.note}</div>
                                </div>
                                <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                    <div className="text-[10px] text-emerald-500/80 mb-1 font-mono uppercase">Kunyomi</div>
                                    <div className="font-medium text-zinc-200">{kunyomi?.kana || "—"}</div>
                                    <div className="text-[10px] text-zinc-500 mt-1">{kunyomi?.note}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* 3. COMBINATIONS */}
                    {combinations.length > 0 && (
                        <section className="mb-8">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Common Words</h3>
                            <div className="space-y-2">
                                {combinations.map((combo: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors">
                                        <div>
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-bold text-white">{combo.word}</span>
                                                <span className="text-xs text-zinc-400">{combo.reading}</span>
                                            </div>
                                            <div className="text-xs text-zinc-500">{combo.meaning}</div>
                                        </div>
                                        {combo.targetKanji && (
                                            existingWords?.has(combo.targetKanji) ? (
                                                <button
                                                    className="text-[10px] bg-amber-950/30 px-1.5 py-0.5 rounded text-amber-500 border border-amber-900/30 hover:bg-amber-900/50 transition-colors flex items-center gap-1"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onJumpTo?.(combo.targetKanji);
                                                    }}
                                                >
                                                    <span className="material-symbols-rounded text-[8px]">check_circle</span>
                                                    View: {combo.targetKanji}
                                                </button>
                                            ) : (
                                                <button
                                                    className="text-[10px] bg-zinc-950 px-2 py-1 rounded text-zinc-500 border border-zinc-900 hover:text-amber-400 hover:border-amber-900/50 transition-colors"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`Learn related word: ${combo.targetKanji}?`)) {
                                                            const placeholder = {
                                                                kanji: combo.targetKanji,
                                                                reading: "...",
                                                                meaning: "Loading...",
                                                                context_usage: { sentence: "Related to " + vocab.kanji_word, english: "..." },
                                                                detailed_data: null
                                                            };
                                                            await import("@/actions/learn").then(mod => mod.saveVocabulary(placeholder, null, "related"));
                                                            onClose();
                                                            window.location.reload();
                                                        }
                                                    }}
                                                >
                                                    Next: {combo.targetKanji}
                                                </button>
                                            )
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* 4. DIALOGUE */}
                    <section>
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Conversation</h3>
                        {detailed.dialogue ? (
                            <div className="space-y-3">
                                {detailed.dialogue.map((line, i) => (
                                    <div key={i} className={cn("flex gap-3", line.speaker === "B" ? "flex-row-reverse" : "")}>
                                        <div className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-2",
                                            line.speaker === "A" ? "bg-amber-500 text-zinc-900" : "bg-zinc-700 text-zinc-300"
                                        )}>
                                            {line.speaker}
                                        </div>
                                        <div className={cn(
                                            "p-3 rounded-2xl max-w-[85%] text-sm",
                                            line.speaker === "A"
                                                ? "bg-zinc-800/80 rounded-tl-none text-zinc-200"
                                                : "bg-zinc-900 rounded-tr-none text-zinc-400 border border-zinc-800"
                                        )}>
                                            <p className="font-medium mb-1">{line.japanese}</p>
                                            <p className="text-xs opacity-70">{line.english}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                                <p className="font-medium text-zinc-200 mb-1">{vocab.context_sentence_jp}</p>
                                <p className="text-xs text-zinc-500">{vocab.context_sentence_en}</p>
                            </div>
                        )}
                    </section>

                    {/* 5. ACTIONS */}
                    <div className="mt-8 pt-8 border-t border-zinc-800 flex justify-center">
                        <Button
                            variant="destructive"
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20"
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm("Are you sure you want to delete this word?")) return;

                                await import("@/actions/learn").then(mod => mod.deleteVocabulary(vocab.id));
                                window.location.reload(); // Force hard reload to update list immediately
                            }}
                        >
                            <span className="material-symbols-rounded mr-2 text-lg">delete</span>
                            Remove Word
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
}
