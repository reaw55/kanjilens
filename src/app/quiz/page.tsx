"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getQuizData, submitQuizResult } from "@/actions/quiz";
import Link from "next/link";
import { useRouter } from "next/navigation";

type QuizItem = {
    id: string;
    kanji_word: string;
    reading_kana: string;
    meaning_en: string;
    srs_level: number;
};

export default function QuizPage() {
    const [items, setItems] = useState<QuizItem[]>([]);
    const [distractors, setDistractors] = useState<QuizItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [quizMode, setQuizMode] = useState<'kanji-to-en' | 'en-to-kanji'>('kanji-to-en');
    const [options, setOptions] = useState<QuizItem[]>([]);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [sessionXP, setSessionXP] = useState(0);
    const [finished, setFinished] = useState(false);

    // Load Data
    useEffect(() => {
        async function init() {
            const data = await getQuizData();
            setItems(data.items);
            setDistractors(data.distractors);
            setLoading(false);
        }
        init();
    }, []);

    // Setup new question
    useEffect(() => {
        if (loading || items.length === 0 || currentIndex >= items.length) return;

        const currentItem = items[currentIndex];

        // Randomly decide mode for this card
        const mode = Math.random() > 0.5 ? 'kanji-to-en' : 'en-to-kanji';
        setQuizMode(mode);

        // Generate Options
        const otherOptions = distractors
            .filter(d => d.id !== currentItem.id)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        // If we don't have enough distractors, just use what we have (or duplicate logic if needed)
        // For MVP, if < 3 distractors, this might look weird, but it works.

        const allOptions = [...otherOptions, currentItem].sort(() => 0.5 - Math.random());
        setOptions(allOptions);
        setSelectedOption(null);
        setIsCorrect(null);

    }, [currentIndex, items, distractors, loading]);

    const handleAnswer = async (selectedId: string) => {
        if (selectedOption) return; // Prevent double click

        const currentItem = items[currentIndex];
        const correct = selectedId === currentItem.id;

        setSelectedOption(selectedId);
        setIsCorrect(correct);

        // Submit Result
        const result = await submitQuizResult(currentItem.id, correct);

        if (correct && result.xp) {
            setSessionXP(prev => prev + result.xp);
        }

        // Delay for next question
        setTimeout(() => {
            if (currentIndex + 1 >= items.length) {
                setFinished(true);
            } else {
                setCurrentIndex(prev => prev + 1);
            }
        }, 1500);
    };

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
            <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full mb-4"></div>
            <p className="text-zinc-500 animate-pulse">Preparing your session...</p>
        </div>
    );

    if (items.length === 0) return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 ring-1 ring-zinc-800">
                <span className="material-symbols-rounded text-4xl text-emerald-500">check</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">All Caught Up!</h1>
            <p className="text-zinc-400 mb-8 max-w-xs mx-auto">You have no pending reviews. Go scan more Kanji to build your deck!</p>
            <Link href="/"><Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold">Start Scanning</Button></Link>
        </div>
    );

    if (finished) return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95">
            <div className="w-24 h-24 bg-gradient-to-tr from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-amber-500/20">
                <span className="material-symbols-rounded text-5xl text-black">emoji_events</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Session Complete!</h1>
            <p className="text-zinc-400 mb-1">You reviewed {items.length} words.</p>
            <div className="text-4xl font-black text-amber-400 mb-8">+{sessionXP} XP</div>

            <Link href="/"><Button className="w-full max-w-xs h-12 bg-white text-black font-bold">Back Home</Button></Link>
        </div>
    );

    const currentItem = items[currentIndex];

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col p-6 max-w-md mx-auto relative overflow-hidden">
            {/* Progress Bar */}
            <div className="w-full h-1 bg-zinc-900 rounded-full mb-8 overflow-hidden">
                <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${((currentIndex) / items.length) * 100}%` }}
                ></div>
            </div>

            {/* Stats Header */}
            <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
                    <span className="material-symbols-rounded text-amber-500 text-sm">bolt</span>
                    <span className="text-xs font-bold text-zinc-300">{sessionXP} XP</span>
                </div>
                <div className="text-zinc-500 text-sm font-mono">{currentIndex + 1}/{items.length}</div>
            </div>

            {/* Question Card */}
            <div className="flex-1 flex flex-col items-center justify-center mb-10">
                <div className="text-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        {quizMode === 'kanji-to-en' ? 'What does this mean?' : 'Which Kanji is this?'}
                    </span>
                </div>

                <div className="text-5xl md:text-6xl font-black text-white text-center min-h-[5rem] flex items-center justify-center animate-in fade-in slide-in-from-bottom-4">
                    {quizMode === 'kanji-to-en' ? currentItem.kanji_word : currentItem.meaning_en}
                </div>

                {/* Visual hint only for kanji mode if wanted, simplifying for now */}
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 gap-3 mb-8">
                {options.map((opt) => {
                    const isSelected = selectedOption === opt.id;
                    const isCorrectOption = opt.id === currentItem.id;

                    let stateClass = "bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-300";

                    // Reveal state
                    if (selectedOption) {
                        if (isCorrectOption) {
                            stateClass = "bg-emerald-500/20 border-emerald-500 text-emerald-400";
                        } else if (isSelected && !isCorrectOption) {
                            stateClass = "bg-red-500/20 border-red-500 text-red-400";
                        } else {
                            stateClass = "bg-zinc-900/50 border-zinc-800 text-zinc-600 opacity-50";
                        }
                    }

                    return (
                        <button
                            key={opt.id}
                            disabled={!!selectedOption}
                            onClick={() => handleAnswer(opt.id)}
                            className={`
                                h-16 w-full rounded-2xl border-2 font-bold text-lg transition-all duration-200
                                flex items-center justify-center relative overflow-hidden
                                ${stateClass}
                            `}
                        >
                            <span className="relative z-10 px-4 truncate">
                                {quizMode === 'kanji-to-en' ? opt.meaning_en : opt.kanji_word}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Quit Button */}
            <div className="text-center">
                <Link href="/" className="text-zinc-600 text-xs hover:text-white transition-colors">Quit Session</Link>
            </div>
        </div>
    );
}
