"use client";

import { useRef, useState, useTransition } from "react";
import { addWord } from "@/actions/vocab";
import { MAX_MEANING_LENGTH, MAX_READING_LENGTH, MAX_WORD_LENGTH } from "@/lib/validation";
import { cn } from "@/lib/utils";

export function AddWordForm({ aiEnabled }: { aiEnabled: boolean }) {
    const formRef = useRef<HTMLFormElement>(null);
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setFeedback(null);
        startTransition(async () => {
            const res = await addWord(formData);
            if (res.ok) {
                formRef.current?.reset();
                setFeedback({ ok: true, text: res.message ?? "Added." });
            } else {
                setFeedback({ ok: false, text: res.error });
            }
        });
    };

    const inputClass =
        "w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50";

    return (
        <section className="mb-6 bg-zinc-800/40 rounded-2xl ring-1 ring-white/5">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
                <span className="flex items-center gap-3 font-bold text-zinc-100">
                    <span className="material-symbols-rounded text-amber-500">add_circle</span>
                    Add a word
                </span>
                <span className={cn("material-symbols-rounded text-zinc-500 transition-transform", open && "rotate-180")}>
                    expand_more
                </span>
            </button>

            {open && (
                <form ref={formRef} onSubmit={onSubmit} className="px-5 pb-5 space-y-3">
                    <div>
                        <label htmlFor="add-word" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                            Word (kanji)
                        </label>
                        <input
                            id="add-word"
                            name="word"
                            required
                            maxLength={MAX_WORD_LENGTH}
                            placeholder="e.g. 電車"
                            lang="ja"
                            autoComplete="off"
                            className={cn(inputClass, "text-lg")}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="add-reading" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                Reading {aiEnabled && <span className="normal-case font-normal">(optional)</span>}
                            </label>
                            <input
                                id="add-reading"
                                name="reading"
                                required={!aiEnabled}
                                maxLength={MAX_READING_LENGTH}
                                placeholder="でんしゃ"
                                lang="ja"
                                autoComplete="off"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="add-meaning" className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                Meaning {aiEnabled && <span className="normal-case font-normal">(optional)</span>}
                            </label>
                            <input
                                id="add-meaning"
                                name="meaning"
                                required={!aiEnabled}
                                maxLength={MAX_MEANING_LENGTH}
                                placeholder="train"
                                autoComplete="off"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    {aiEnabled && (
                        <p className="text-xs text-zinc-500">Leave reading or meaning empty and AI will fill them in.</p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-5 py-3 rounded-xl bg-amber-500 text-zinc-900 font-bold hover:bg-amber-400 disabled:opacity-60 transition-colors"
                        >
                            {isPending ? "Adding…" : "Add word"}
                        </button>
                        {feedback && (
                            <p role="status" className={cn("text-sm", feedback.ok ? "text-emerald-400" : "text-red-400")}>
                                {feedback.text}
                            </p>
                        )}
                    </div>
                </form>
            )}
        </section>
    );
}
