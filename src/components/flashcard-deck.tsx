"use client";

import { useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

type VocabItem = {
    id: string;
    kanji_word: string;
    reading_kana: string;
    meaning_en: string;
};

type FlashcardDeckProps = {
    items: VocabItem[];
};

export function FlashcardDeck({ items }: FlashcardDeckProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    // Derived subset for deck stacking
    // We only render current + next few cards
    const visibleCards = items.slice(currentIndex, currentIndex + 2);
    const hasMore = currentIndex < items.length;

    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-30, 30]);
    const opacity = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5]);

    const handleDragEnd = (event: any, info: any) => {
        const threshold = 100;
        if (Math.abs(info.offset.x) > threshold) {
            // Swiped!
            setIsFlipped(false);
            setCurrentIndex(prev => prev + 1);
        }
    };

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                <span className="material-symbols-rounded text-6xl mb-4">style</span>
                <p>No vocabulary to study yet!</p>
            </div>
        );
    }

    if (!hasMore) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center">
                <span className="material-symbols-rounded text-6xl text-amber-500 mb-4 animate-bounce">check_circle</span>
                <h2 className="text-2xl font-bold text-white mb-2">All Done!</h2>
                <p className="text-zinc-400 mb-6">You've reviewed all your cards.</p>
                <button
                    onClick={() => setCurrentIndex(0)}
                    className="px-6 py-3 bg-zinc-800 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                >
                    Restart Review
                </button>
            </div>
        );
    }

    // Current Card Data
    const currentCard = items[currentIndex];

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] relative w-full max-w-sm mx-auto perspective-1000">
            {/* Progress Info */}
            <div className="absolute top-0 w-full flex justify-center mb-4">
                <span className="bg-zinc-800/80 backdrop-blur px-3 py-1 rounded-full text-xs font-mono text-zinc-400">
                    {currentIndex + 1} / {items.length}
                </span>
            </div>

            <div className="relative w-full h-96 flex items-center justify-center">
                <AnimatePresence>
                    {visibleCards.map((card, index) => {
                        const isCurrent = index === 0;
                        if (!isCurrent) return null; // Simplified: Only render top card + placeholder behind if complex

                        return (
                            <motion.div
                                key={card.id}
                                style={{ x, rotate, opacity, zIndex: 10 }}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                onDragEnd={handleDragEnd}
                                onClick={() => setIsFlipped(!isFlipped)}
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ x: x.get() < 0 ? -200 : 200, opacity: 0, transition: { duration: 0.2 } }}
                                className="absolute w-full h-full cursor-pointer touch-none preserve-3d"
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <div className={cn(
                                    "w-full h-full bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 text-center backface-hidden transition-all duration-500 ease-in-out transform",
                                    isFlipped ? "rotate-y-180" : ""
                                )}>
                                    {/* FRONT (Kanji) */}
                                    {!isFlipped && (
                                        <>
                                            <div className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">KANJI</div>
                                            <div className="flex-1 flex items-center justify-center">
                                                <h2 className="text-8xl font-black text-white">{card.kanji_word}</h2>
                                            </div>
                                            <div className="text-zinc-600 text-sm mt-4">Tap to flip</div>
                                        </>
                                    )}

                                    {/* BACK (Meaning) - Need to handle flipping via CSS or conditional render? 
                                       Actually for 3D flip, we usually need distinct Front/Back faces.
                                       Let's do conditional render for simplicity first, or proper 3D if comfortable.
                                       Conditional is safer for "quick implementation".
                                    */}
                                    {isFlipped && (
                                        <div className="animate-in fade-in zoom-in duration-300 w-full h-full flex flex-col items-center justify-center rotate-y-180-reset">
                                            <div className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-4">MEANING</div>
                                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                                <h3 className="text-3xl font-bold text-white">{card.reading_kana}</h3>
                                                <p className="text-xl text-zinc-300">{card.meaning_en}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Placeholder Card Behind */}
                {items[currentIndex + 1] && (
                    <div className="absolute w-full h-full bg-zinc-900/50 border border-zinc-800 rounded-3xl scale-95 -z-10 translate-y-4" />
                )}
            </div>

            <div className="mt-8 flex gap-4">
                <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} className="p-4 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                    <span className="material-symbols-rounded">undo</span>
                </button>
                <div className="flex-1 text-center text-zinc-500 text-sm flex items-center justify-center">
                    <span className="material-symbols-rounded mr-1 text-lg">swipe</span>
                    Swipe to discard
                </div>
            </div>
        </div>
    );
}

// Utility to merge classes
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
