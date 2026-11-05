"use client";

import { useEffect, useState, useTransition } from "react";
import { addRelatedWord, deleteWord, requestAiFill, updateWord } from "@/actions/vocab";
import type { VocabItem } from "@/lib/types";
import { MAX_MEANING_LENGTH, MAX_READING_LENGTH } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { describeDue, SOURCE_LABELS } from "./vocab/format";

type Props = {
    item: VocabItem;
    aiEnabled: boolean;
    /** kanji_word -> id for the user's existing words (to link combinations). */
    wordIndex: Map<string, string>;
    onOpenWord: (id: string) => void;
    onClose: () => void;
};

export function VocabDetailModal({ item, aiEnabled, wordIndex, onOpenWord, onClose }: Props) {
    const isPending = item.status === "pending";
    const needsInput = item.status === "needs_input";
    const details = item.detailed_data ?? {};
    const example =
        details.example ??
        (item.context_sentence_jp
            ? { japanese: item.context_sentence_jp, english: item.context_sentence_en ?? "", reading: undefined }
            : null);

    const [editing, setEditing] = useState(needsInput);
    const [reading, setReading] = useState(item.reading_kana ?? "");
    const [meaning, setMeaning] = useState(item.meaning_en ?? "");
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [isWorking, startTransition] = useTransition();
    const [now] = useState(() => Date.now());

    // Escape closes; lock background scroll while open.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => {
        setMessage(null);
        startTransition(async () => {
            const res = await fn();
            if (res.ok) {
                if (res.message) setMessage({ ok: true, text: res.message });
                after?.();
            } else {
                setMessage({ ok: false, text: res.error });
            }
        });
    };

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        run(() => updateWord(item.id, { reading, meaning }), () => setEditing(false));
    };

    const remove = () => {
        if (!window.confirm(`Delete 「${item.kanji_word}」 from your vocabulary?`)) return;
        run(() => deleteWord(item.id), onClose);
    };

    const inputClass =
        "w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50";

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="vocab-modal-title"
                data-lenis-prevent
                className="bg-zinc-950 w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl border border-zinc-800 shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute top-4 right-4 z-10 p-2 bg-zinc-900/80 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                    <span className="material-symbols-rounded text-xl">close</span>
                </button>

                <div className="p-6 pb-10 space-y-8">
                    {/* Hero */}
                    <div className="flex flex-col items-center text-center pt-4">
                        <div className="bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl px-10 py-6 min-w-32">
                            <h2 id="vocab-modal-title" lang="ja" className="text-6xl font-bold text-zinc-50 leading-tight break-all">
                                {item.kanji_word}
                            </h2>
                        </div>
                        <p lang="ja" className="mt-5 text-2xl font-medium text-amber-500">
                            {item.reading_kana ?? "—"}
                        </p>
                        <p className="text-zinc-300 mt-1">{item.meaning_en ?? "—"}</p>
                    </div>

                    {isPending && (
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
                            <span className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
                            Filling in the reading and meaning…
                        </div>
                    )}

                    {needsInput && (
                        <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-100 text-sm space-y-3">
                            <p>Add the reading and meaning so this word can appear in the match game.</p>
                            {aiEnabled && (
                                <button
                                    type="button"
                                    disabled={isWorking}
                                    onClick={() => run(() => requestAiFill(item.id))}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 font-bold text-xs disabled:opacity-60"
                                >
                                    <span className="material-symbols-rounded text-base">auto_awesome</span>
                                    Fill in with AI
                                </button>
                            )}
                        </div>
                    )}

                    {/* Edit */}
                    {!isPending &&
                        (editing ? (
                            <form onSubmit={save} className="space-y-3">
                                <div>
                                    <label htmlFor="edit-reading" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                        Reading
                                    </label>
                                    <input
                                        id="edit-reading"
                                        lang="ja"
                                        value={reading}
                                        onChange={(e) => setReading(e.target.value)}
                                        maxLength={MAX_READING_LENGTH}
                                        placeholder="ひらがな"
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-meaning" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                        Meaning
                                    </label>
                                    <input
                                        id="edit-meaning"
                                        value={meaning}
                                        onChange={(e) => setMeaning(e.target.value)}
                                        maxLength={MAX_MEANING_LENGTH}
                                        placeholder="Short English meaning"
                                        className={inputClass}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={isWorking}
                                        className="px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-900 font-bold hover:bg-amber-400 disabled:opacity-60"
                                    >
                                        Save
                                    </button>
                                    {!needsInput && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(false);
                                                setReading(item.reading_kana ?? "");
                                                setMeaning(item.meaning_en ?? "");
                                            }}
                                            className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setEditing(true)}
                                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-400"
                            >
                                <span className="material-symbols-rounded text-base">edit</span>
                                Edit reading &amp; meaning
                            </button>
                        ))}

                    {message && (
                        <p role="status" className={cn("text-sm", message.ok ? "text-emerald-400" : "text-red-400")}>
                            {message.text}
                        </p>
                    )}

                    {/* Kanji readings */}
                    {(details.onyomi || details.kunyomi) && (
                        <section>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Readings</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-zinc-900 rounded-2xl p-4 border border-white/5">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80 mb-1">On&apos;yomi</div>
                                    <div lang="ja" className="text-lg text-zinc-100">{details.onyomi ?? "—"}</div>
                                </div>
                                <div className="bg-zinc-900 rounded-2xl p-4 border border-white/5">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80 mb-1">Kun&apos;yomi</div>
                                    <div lang="ja" className="text-lg text-zinc-100">{details.kunyomi ?? "—"}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Combinations */}
                    {details.combinations && details.combinations.length > 0 && (
                        <section>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Common words</h3>
                            <ul className="space-y-2">
                                {details.combinations.map((combo) => {
                                    const existingId = wordIndex.get(combo.word);
                                    return (
                                        <li
                                            key={combo.word}
                                            className="flex items-center justify-between gap-3 p-4 bg-zinc-900 border border-white/5 rounded-2xl"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-baseline gap-3 flex-wrap">
                                                    <span lang="ja" className="text-xl font-bold text-white">{combo.word}</span>
                                                    <span lang="ja" className="text-sm text-zinc-400">{combo.reading}</span>
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-1">{combo.meaning}</div>
                                            </div>
                                            {existingId ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenWord(existingId)}
                                                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700"
                                                >
                                                    Open
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={isWorking}
                                                    onClick={() => run(() => addRelatedWord(combo.word, combo.reading, combo.meaning))}
                                                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60"
                                                >
                                                    <span className="material-symbols-rounded text-sm">add</span>
                                                    Add
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Example */}
                    {example && (
                        <section>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Example</h3>
                            <div className="p-5 bg-zinc-900 rounded-2xl border border-white/5 space-y-1">
                                <p lang="ja" className="text-lg font-bold text-white">{example.japanese}</p>
                                {example.reading && <p lang="ja" className="text-sm text-zinc-500">{example.reading}</p>}
                                {example.english && <p className="text-sm text-zinc-400">{example.english}</p>}
                            </div>
                        </section>
                    )}

                    {/* SRS */}
                    <section>
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Review</h3>
                        <dl className="grid grid-cols-4 gap-2 text-center">
                            <Stat label="Level" value={String(item.srs_level)} />
                            <Stat label="Next" value={item.status === "ready" ? describeDue(item.next_review_at, now) : "—"} />
                            <Stat label="Correct" value={String(item.correct_count)} />
                            <Stat label="Missed" value={String(item.wrong_count)} />
                        </dl>
                        <p className="text-[11px] text-zinc-600 mt-3">
                            Source: {SOURCE_LABELS[item.source] ?? item.source} · added{" "}
                            {new Date(item.created_at).toLocaleDateString()}
                        </p>
                    </section>

                    <button
                        type="button"
                        onClick={remove}
                        disabled={isWorking}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-sm disabled:opacity-60"
                    >
                        <span className="material-symbols-rounded text-base">delete</span>
                        Delete word
                    </button>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-zinc-900 rounded-xl p-3 border border-white/5">
            <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
            <dd className="text-sm font-bold text-zinc-100 mt-1" suppressHydrationWarning>
                {value}
            </dd>
        </div>
    );
}
