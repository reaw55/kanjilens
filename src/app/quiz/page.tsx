
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
// Removed unused framer-motion import
// Actually, package.json check implies looking at file. I saw package.json earlier, I don't recall framer-motion being there. 
// I'll stick to CSS transitions/Tailwind to be safe and avoid "Module not found".

import { submitReview } from "@/actions/quiz";
import Link from "next/link";

export default function QuizPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [finished, setFinished] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        async function fetchReviews() {
            const now = new Date().toISOString();
            const { data } = await supabase
                .from("vocabulary_items")
                .select("*")
                .lte("next_review_at", now) // Due items
                .order("next_review_at", { ascending: true })
                .limit(20);

            if (data) setItems(data);
            setLoading(false);
        }
        fetchReviews();
    }, []);

    const handleGrade = async (quality: 'forgot' | 'hard' | 'easy') => {
        const currentItem = items[currentIndex];
        // Optimistic update / Move to next
        const nextIdx = currentIndex + 1;

        // Submit in background
        await submitReview(currentItem.id, quality);

        setIsFlipped(false);

        if (nextIdx >= items.length) {
            setFinished(true);
        } else {
            setCurrentIndex(nextIdx);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500 bg-zinc-900">Loading reviews...</div>;

    if (finished) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-zinc-50 p-4">
                <span className="material-symbols-rounded text-6xl text-amber-400 mb-4">check_circle</span>
                <h1 className="text-3xl font-bold mb-2 headline-metallic">All Done!</h1>
                <p className="text-zinc-400 mb-8">You've reviewed your due cards.</p>
                <Link href="/"><Button>Back Home</Button></Link>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-zinc-50 p-4">
                <span className="material-symbols-rounded text-6xl text-zinc-700 mb-4">sentiment_satisfied</span>
                <h1 className="text-2xl font-bold mb-2">No Reviews Due</h1>
                <p className="text-zinc-400 mb-8">Great job catching up!</p>
                <Link href="/"><Button>Back Home</Button></Link>
            </div>
        );
    }

    const item = items[currentIndex];

    return (
        <div className="min-h-screen bg-zinc-900 flex flex-col pb-10">
            {/* Header */}
            <div className="p-4 flex justify-between items-center text-zinc-400 text-sm">
                <span>{currentIndex + 1} / {items.length}</span>
                <Link href="/"><span className="material-symbols-rounded">close</span></Link>
            </div>

            {/* Card Area */}
            <div className="flex-1 flex items-center justify-center p-6 perspective-[1000px]">
                <div
                    className={`relative w-full max-w-sm aspect-[3/4] transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    {/* FRONT */}
                    <div className="absolute inset-0 backface-hidden bg-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-zinc-700">
                        <div className="text-8xl font-black text-zinc-50 mb-8">{item.kanji_word}</div>
                        <p className="text-zinc-500 text-sm uppercase tracking-widest">Tap to reveal</p>
                    </div>

                    {/* BACK */}
                    <div className="absolute inset-0 backface-hidden bg-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-zinc-700 rotate-y-180">
                        <div className="text-3xl font-bold text-amber-400 mb-2">{item.reading_kana}</div>
                        <div className="text-xl text-zinc-100 font-medium mb-6 text-center">{item.meaning_en}</div>
                        <div className="bg-zinc-900/50 p-4 rounded-xl border-l-2 border-zinc-600 w-full">
                            <p className="text-sm text-zinc-300 italic mb-1">"{item.context_sentence_jp}"</p>
                            <p className="text-xs text-zinc-500">{item.context_sentence_en}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="h-32 px-6 flex items-center justify-center gap-4">
                {isFlipped ? (
                    <>
                        <Button onClick={() => handleGrade('forgot')} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 h-14 px-6 rounded-xl flex-1 border border-red-500/20">Forgot</Button>
                        <Button onClick={() => handleGrade('hard')} className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 h-14 px-6 rounded-xl flex-1 border border-amber-500/20">Hard</Button>
                        <Button onClick={() => handleGrade('easy')} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 h-14 px-6 rounded-xl flex-1 border border-emerald-500/20">Easy</Button>
                    </>
                ) : (
                    <Button onClick={() => setIsFlipped(true)} className="w-full bg-zinc-100 text-zinc-900 hover:bg-white h-14 text-lg font-bold rounded-xl">
                        Show Answer
                    </Button>
                )}
            </div>
        </div>
    );
}
