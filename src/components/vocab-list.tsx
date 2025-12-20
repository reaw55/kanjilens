"use client";

import { useState } from "react";
import { VocabDetailModal } from "./vocab-detail-modal";

export function VocabList({ items }: { items: any[] }) {
    const [selectedVocab, setSelectedVocab] = useState<any | null>(null);

    if (!items || items.length === 0) {
        return (
            <div className="text-center py-20 bg-zinc-800/20 rounded-3xl border border-zinc-800 border-dashed">
                <p className="text-zinc-500">No words yet.</p>
                <a href="/" className="text-amber-400 font-medium mt-2 inline-block">Start Scanning</a>
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-4 pb-20">
                {items.map((item) => (
                    <div
                        key={item.id}
                        onClick={() => setSelectedVocab(item)}
                        className="bg-zinc-800 rounded-2xl p-5 ring-1 ring-white/5 hover:bg-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                        {/* Summary Card Content */}
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-3xl font-bold text-zinc-50">{item.kanji_word}</div>
                            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">Level {item.srs_level}</div>
                        </div>
                        <div className="text-amber-400 text-sm font-medium mb-1">{item.reading_kana}</div>
                        <div className="text-zinc-300 mb-4 line-clamp-1">{item.meaning_en}</div>

                        <div className="bg-zinc-900/50 p-3 rounded-xl border-l-2 border-amber-500/50">
                            <p className="text-zinc-200 text-sm italic line-clamp-1">"{item.context_sentence_jp}"</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {selectedVocab && (
                <VocabDetailModal
                    vocab={selectedVocab}
                    onClose={() => setSelectedVocab(null)}
                />
            )}
        </>
    );
}
