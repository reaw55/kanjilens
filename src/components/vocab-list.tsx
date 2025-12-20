"use client";

import { useState, useEffect } from "react";
import { VocabDetailModal } from "./vocab-detail-modal";
import { useRouter } from "next/navigation";
import { processPendingVocab } from "@/actions/learn";

export function VocabList({ items }: { items: any[] }) {
    const [selectedVocab, setSelectedVocab] = useState<any | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const [filter, setFilter] = useState<'all' | 'scan' | 'related'>('all');

    useEffect(() => {
        const hasPending = items.some(i => !i.detailed_data);
        if (hasPending && !isProcessing) {
            // ... existing effect
            setIsProcessing(true);
            const runProcessor = async () => {
                const res = await processPendingVocab();
                if (res.success && res.count > 0) {
                    router.refresh();
                }
                setIsProcessing(false);
            };
            runProcessor();
        }
    }, [items, isProcessing, router]);

    const filteredItems = items.filter(item => {
        if (filter === 'all') return true;
        // Default to 'scan' if null (for legacy items before migration)
        const source = item.source || 'scan';
        return source === filter;
    });

    if (!items || items.length === 0) { // ... existing empty check ...
        return (
            <div className="text-center py-20 bg-zinc-800/20 rounded-3xl border border-zinc-800 border-dashed">
                <p className="text-zinc-500">No words yet.</p>
                <a href="/" className="text-amber-400 font-medium mt-2 inline-block">Start Scanning</a>
            </div>
        );
    }

    return (
        <>
            {/* Floating Progress Pill */}
            {items.some(i => !i.detailed_data) && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in">
                    <div className="bg-zinc-900/90 backdrop-blur-md text-zinc-200 text-xs font-bold px-4 py-2 rounded-full border border-amber-500/30 shadow-2xl flex items-center gap-3 ring-1 ring-white/10">
                        <div className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        <span>
                            Generating {items.filter(i => !i.detailed_data).length} words...
                        </span>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                {(['all', 'scan', 'related'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === f
                            ? 'bg-amber-500 text-zinc-900 shadow-lg shadow-amber-500/20'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                            }`}
                    >
                        {f === 'all' ? 'All Words' : f === 'scan' ? 'From Camera' : 'Related Words'}
                        <span className="ml-2 opacity-60 text-[10px]">
                            {items.filter(i => (i.source || 'scan') === f || f === 'all').length}
                        </span>
                    </button>
                ))}
            </div>

            <div className="grid gap-4 pb-20">
                {filteredItems.map((item) => {
                    const isPending = !item.detailed_data;
                    return (
                        <div
                            key={item.id}
                            onClick={() => !isPending && setSelectedVocab(item)} // Only clickable if ready
                            className={`bg-zinc-800 rounded-2xl p-5 ring-1 ring-white/5 transition-all relative overflow-hidden ${isPending ? 'opacity-80' : 'hover:bg-zinc-700/50 active:scale-[0.98] cursor-pointer'}`}
                        >
                            {/* Loading Overlay */}
                            {isPending && (
                                <div className="absolute top-2 right-2">
                                    <div className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-2">
                                <div className="text-3xl font-bold text-zinc-50">{item.kanji_word}</div>
                                <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">
                                    {isPending ? 'Processing...' : `Level ${item.srs_level}`}
                                </div>
                            </div>
                            <div className="text-amber-400 text-sm font-medium mb-1">{item.reading_kana}</div>
                            <div className="text-zinc-300 mb-4 line-clamp-1">{item.meaning_en}</div>

                            <div className="bg-zinc-900/50 p-3 rounded-xl border-l-2 border-amber-500/50">
                                <p className="text-zinc-200 text-sm italic line-clamp-1">"{item.context_sentence_jp}"</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {selectedVocab && (
                <VocabDetailModal
                    vocab={selectedVocab}
                    existingWords={new Set(items.map(i => i.kanji_word))}
                    onJumpTo={(word) => {
                        const target = items.find(i => i.kanji_word === word);
                        if (target) setSelectedVocab(target);
                    }}
                    onClose={() => setSelectedVocab(null)}
                />
            )}
        </>
    );
}
