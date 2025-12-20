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
    onClose: () => void;
};

export function VocabDetailModal({ vocab, onClose }: VocabDetailModalProps) {
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
                        <div className="relative group">
                            <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full opacity-50" />
                            <div className="w-32 h-32 bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/5">
                                <h1 className="text-6xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
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
                                            <span className="text-[10px] bg-zinc-950 px-2 py-1 rounded text-zinc-600 border border-zinc-900">
                                                Next: {combo.targetKanji}
                                            </span>
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

                </div>
            </div>
        </div>
    );
}
