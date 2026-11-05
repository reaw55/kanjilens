"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { processPendingVocab } from "@/actions/vocab";
import type { VocabItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { VocabDetailModal } from "./vocab-detail-modal";
import { StarterDeckButton } from "./vocab/starter-deck-button";
import { describeDue, SOURCE_LABELS } from "./vocab/format";

type Filter = "all" | "scan" | "manual" | "starter" | "needs_input";

const FILTERS: { id: Filter; label: string; match: (i: VocabItem) => boolean }[] = [
    { id: "all", label: "All", match: () => true },
    { id: "scan", label: "Scan", match: (i) => i.source === "scan" },
    { id: "manual", label: "Manual", match: (i) => i.source === "manual" },
    { id: "starter", label: "Starter", match: (i) => i.source === "starter" },
    { id: "needs_input", label: "Needs input", match: (i) => i.status === "needs_input" },
];

export function VocabList({ items, aiEnabled }: { items: VocabItem[]; aiEnabled: boolean }) {
    const searchParams = useSearchParams();
    const [filter, setFilter] = useState<Filter>("all");
    // Deep link: /vocab?open=<id> opens that word.
    const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("open"));
    const [now] = useState(() => Date.now());

    const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;
    const wordIndex = useMemo(() => new Map(items.map((i) => [i.kanji_word, i.id])), [items]);
    const pendingCount = items.filter((i) => i.status === "pending").length;

    // Poll the AI fill-in while anything is pending (replaces the old Supabase realtime channel).
    // Each successful call revalidates /vocab, so fresh `items` arrive as props.
    const [pollTick, setPollTick] = useState(0);
    const [pollStopped, setPollStopped] = useState(false);
    const [pollMessage, setPollMessage] = useState<string | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        if (pendingCount === 0 || pollStopped) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (inFlight.current) {
                setPollTick((t) => t + 1);
                return;
            }
            inFlight.current = true;
            try {
                const res = await processPendingVocab();
                if (cancelled) return;
                if (res.rateLimited) {
                    setPollStopped(true);
                    setPollMessage(res.message ?? "AI fill-in limit reached.");
                } else {
                    setPollTick((t) => t + 1);
                }
            } catch {
                if (!cancelled) {
                    setPollStopped(true);
                    setPollMessage("Couldn't reach the server to fill in words.");
                }
            } finally {
                inFlight.current = false;
            }
        }, pollTick === 0 ? 300 : 3000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [pendingCount, pollTick, pollStopped]);

    const closeModal = useCallback(() => setSelectedId(null), []);

    const retryPolling = () => {
        setPollMessage(null);
        setPollStopped(false);
        setPollTick((t) => t + 1);
    };

    if (items.length === 0) {
        return (
            <div className="text-center py-16 px-6 bg-zinc-800/20 rounded-3xl border border-zinc-800 border-dashed space-y-4">
                <span className="material-symbols-rounded text-5xl text-zinc-600">menu_book</span>
                <p className="text-zinc-400">No words yet. Start with common beginner words, add your own, or scan some text.</p>
                <StarterDeckButton />
                <Link href="/scan" className="inline-block text-amber-400 text-sm font-medium hover:text-amber-300">
                    Scan text with the camera
                </Link>
            </div>
        );
    }

    const visible = items.filter(FILTERS.find((f) => f.id === filter)!.match);

    return (
        <>
            {pendingCount > 0 && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40">
                    <div className="bg-zinc-900/95 backdrop-blur-md text-zinc-200 text-xs font-bold px-4 py-2 rounded-full border border-amber-500/30 shadow-2xl flex items-center gap-3">
                        {pollStopped ? (
                            <>
                                <span className="material-symbols-rounded text-amber-500 text-base">pause_circle</span>
                                <span>{pollMessage}</span>
                                <button type="button" onClick={retryPolling} className="text-amber-400 hover:text-amber-300">
                                    Retry
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                <span>
                                    Filling in {pendingCount} word{pendingCount === 1 ? "" : "s"}…
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div role="tablist" aria-label="Filter words" className="flex gap-2 mb-5 overflow-x-auto pb-2 no-scrollbar">
                {FILTERS.map((f) => {
                    const count = items.filter(f.match).length;
                    if (f.id === "needs_input" && count === 0) return null;
                    return (
                        <button
                            key={f.id}
                            role="tab"
                            aria-selected={filter === f.id}
                            onClick={() => setFilter(f.id)}
                            className={cn(
                                "px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                filter === f.id
                                    ? f.id === "needs_input"
                                        ? "bg-orange-500 text-zinc-900"
                                        : "bg-amber-500 text-zinc-900 shadow-lg shadow-amber-500/20"
                                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            )}
                        >
                            {f.label}
                            <span className="ml-2 opacity-60 text-[10px]">{count}</span>
                        </button>
                    );
                })}
            </div>

            {visible.length === 0 ? (
                <p className="text-center text-zinc-500 py-12">Nothing here yet.</p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {visible.map((item) => (
                        <li key={item.id}>
                            <VocabCard item={item} now={now} onOpen={() => setSelectedId(item.id)} />
                        </li>
                    ))}
                </ul>
            )}

            {selected && (
                <VocabDetailModal
                    key={selected.id}
                    item={selected}
                    aiEnabled={aiEnabled}
                    wordIndex={wordIndex}
                    onOpenWord={setSelectedId}
                    onClose={closeModal}
                />
            )}
        </>
    );
}

function VocabCard({ item, now, onOpen }: { item: VocabItem; now: number; onOpen: () => void }) {
    const isPending = item.status === "pending";
    const needsInput = item.status === "needs_input";

    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                "w-full text-left bg-zinc-800 rounded-2xl p-5 ring-1 transition-all relative overflow-hidden hover:bg-zinc-700/50 active:scale-[0.98]",
                needsInput ? "ring-orange-500/40" : "ring-white/5",
                isPending && "opacity-80"
            )}
        >
            <div className="flex justify-between items-start gap-3 mb-2">
                <div lang="ja" className="text-3xl font-bold text-zinc-50 break-all">
                    {item.kanji_word}
                </div>
                {isPending ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500/80 shrink-0">
                        <span className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        Filling in
                    </span>
                ) : needsInput ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-1 rounded-full shrink-0">
                        Needs input
                    </span>
                ) : (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
                        Lv {item.srs_level}
                    </span>
                )}
            </div>

            <div lang="ja" className="text-amber-400 text-sm font-medium min-h-5">
                {item.reading_kana ?? <span className="text-zinc-600">reading?</span>}
            </div>
            <div className="text-zinc-300 line-clamp-1 min-h-6">
                {item.meaning_en ?? <span className="text-zinc-600">meaning?</span>}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
                {item.status === "ready" && <span suppressHydrationWarning>{describeDue(item.next_review_at, now)}</span>}
            </div>
        </button>
    );
}
