"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Types for our Rich Data (JSONB)
type DetailedData = {
    kanji_breakdown?: {
        kanji: string;
        onyomi: string[];
        kunyomi: string[];
        combinations: {
            word: string;
            reading: string;
            meaning: string;
        }[];
    }[];
    dialogue?: {
        speaker: string;
        jp: string;
        en: string;
    }[];
};

export default function VocabDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [vocab, setVocab] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        async function fetchData() {
            const { data, error } = await supabase
                .from("vocabulary_items")
                .select("*, vocabulary_captures(capture_id, captures(ocr_data))")
                .eq("id", id)
                .single();

            if (data) {
                // Flatten the capture data to get the text easily
                // We take the first associated capture's text as the "context"
                const associatedText = data.vocabulary_captures?.[0]?.captures?.ocr_data?.text || null;
                setVocab({ ...data, associatedText });
            }
            setLoading(false);
        }
        fetchData();
    }, [id]);

    if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
    if (!vocab) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-500">Word not found.</div>;

    // Parse the Rich Data
    const details = (vocab.detailed_data as DetailedData) || {};
    // Fallback if details are missing (e.g. old data) - generic structure
    const mainKanji = vocab.kanji_word;
    const reading = vocab.reading_kana;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 pb-20 relative font-sans selection:bg-amber-500/30">

            {/* 1. STICKY HEADER / HERO */}
            <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 transition-all">
                <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/vocab" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
                        <span className="material-symbols-rounded text-3xl">arrow_back</span>
                    </Link>

                    {/* Centered Kanji Card (Mini Version on Scroll? For now static large) */}
                    <div className="flex-1 flex justify-center">
                        {/* We can animate this to shrink on scroll later */}
                    </div>

                    <div className="w-10" /> {/* Spacer */}
                </div>
            </header>

            <main className="max-w-md mx-auto px-6 pt-2">

                {/* HERO KANJI DISPLAY */}
                <div className="flex flex-col items-center justify-center mb-10 mt-4 reveal-up">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="w-40 h-40 bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/5">
                            <h1 className="text-7xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
                                {mainKanji}
                            </h1>
                        </div>
                    </div>
                    <p className="mt-6 text-2xl font-medium text-amber-500 tracking-wide">{reading}</p>
                    <p className="text-zinc-400 font-light mt-1">{vocab.meaning_en}</p>
                </div>

                {/* 2. READINGS (If available in details) */}
                {details.kanji_breakdown && details.kanji_breakdown[0] && (
                    <section className="mb-10 reveal-up delay-100">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Readings</h3>
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 space-y-4">
                            <div>
                                <div className="text-xs text-amber-500/80 mb-1 font-mono">ONYOMI (Sound Reading)</div>
                                <div className="text-lg font-medium text-zinc-100 tracking-wider">
                                    {details.kanji_breakdown[0].onyomi.join(" / ") || "—"}
                                </div>
                            </div>
                            <div className="h-px bg-white/5" />
                            <div>
                                <div className="text-xs text-emerald-500/80 mb-1 font-mono">KUNYOMI (Native Reading)</div>
                                <div className="text-lg font-medium text-zinc-100 tracking-wider">
                                    {details.kanji_breakdown[0].kunyomi.join(" / ") || "—"}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* 3. ESSENTIAL COMBINATIONS */}
                {details.kanji_breakdown && details.kanji_breakdown[0]?.combinations && (
                    <section className="mb-10 reveal-up delay-200">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Common Words</h3>
                        <div className="grid gap-3">
                            {details.kanji_breakdown[0].combinations.map((combo, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-zinc-900 border border-white/5 rounded-2xl hover:bg-zinc-800 transition-colors group">
                                    <div>
                                        <div className="flex items-baseline gap-3">
                                            <span className="text-xl font-bold text-white">{combo.word}</span>
                                            <span className="text-sm text-zinc-400">{combo.reading}</span>
                                        </div>
                                        <div className="text-xs text-zinc-500 mt-1">{combo.meaning}</div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-full text-xs font-bold"
                                        onClick={() => {
                                            // This would ideally check if we have this page or trigger a search/learn for it
                                            // For now, let's just create a query to "Learn" it if missing?
                                            // Simplest MVP: Just link to a search/learn page?
                                            // Or "Explore" means just searching this word in the app.
                                            // We'll leave the logic empty or console log for now as requested.
                                            console.log("Explore:", combo.word);
                                        }}
                                    >
                                        Explore <span className="material-symbols-rounded text-sm ml-1">arrow_forward</span>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 4. DIALOGUE / CONTEXT */}
                <section className="mb-20 reveal-up delay-300">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">In Conversation</h3>

                    {details.dialogue ? (
                        <div className="space-y-4">
                            {details.dialogue.map((line, i) => (
                                <div key={i} className={cn("flex gap-4", line.speaker === "B" ? "flex-row-reverse" : "")}>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                        line.speaker === "A" ? "bg-amber-500 text-zinc-900" : "bg-zinc-700 text-zinc-300"
                                    )}>
                                        {line.speaker}
                                    </div>
                                    <div className={cn(
                                        "p-4 rounded-2xl max-w-[85%] text-sm",
                                        line.speaker === "A"
                                            ? "bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-tl-none border border-white/5"
                                            : "bg-zinc-900 rounded-tr-none border border-zinc-800"
                                    )}>
                                        <p className="font-bold text-zinc-200 mb-1">{line.jp}</p>
                                        <p className="text-zinc-500 text-xs leading-relaxed">{line.en}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        // Fallback to simple context sentence if no rich dialogue
                        <div className="p-6 bg-zinc-900 rounded-2xl border border-white/5">
                            <p className="text-lg font-bold text-white mb-2">{vocab.context_sentence_jp}</p>
                            <p className="text-zinc-400 text-sm">{vocab.context_sentence_en}</p>
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
}
