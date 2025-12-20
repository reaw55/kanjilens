"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type HuntCelebrationProps = {
    newFindings: string[];
    xpGained: number;
    levelComplete: boolean;
    bonusXP: number;
};

export function HuntCelebration({ newFindings, xpGained, levelComplete, bonusXP }: HuntCelebrationProps) {
    const [mounted, setMounted] = useState(false);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (newFindings.length > 0) {
            setShowModal(true);
        }
    }, [newFindings]);

    if (!mounted || !showModal) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300 relative overflow-hidden">

                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-amber-500/20 blur-3xl rounded-full pointer-events-none" />

                <div className="relative text-center space-y-4">
                    {levelComplete ? (
                        <>
                            <div className="inline-flex p-4 bg-amber-500/20 rounded-full mb-2 ring-1 ring-amber-500/50">
                                <span className="material-symbols-rounded text-6xl text-amber-500 animate-bounce">trophy</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1">Level Complete!</h2>
                                <p className="text-amber-200 text-sm">You found everything!</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="inline-flex p-4 bg-amber-500/20 rounded-full mb-2 ring-1 ring-amber-500/50">
                                <span className="material-symbols-rounded text-6xl text-amber-500 animate-pulse">check_circle</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white mb-1">Found {newFindings.length} Words!</h2>
                                <p className="text-zinc-400 text-sm">Spotted in your recent photos.</p>
                            </div>
                        </>
                    )}

                    <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800 text-left space-y-2">
                        {newFindings.map((word, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-amber-400 font-bold flex items-center gap-2">
                                    <span className="material-symbols-rounded text-base">check</span>
                                    {word}
                                </span>
                                <span className="text-xs text-zinc-500">+50 XP</span>
                            </div>
                        ))}

                        {bonusXP > 0 && (
                            <div className="pt-2 mt-2 border-t border-zinc-800 flex items-center justify-between font-bold text-amber-400">
                                <span>Level Bonus</span>
                                <span>+{bonusXP} XP</span>
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-full text-zinc-300 text-sm font-medium border border-zinc-700">
                            <span>Total Earned:</span>
                            <span className="text-amber-400 font-bold">+{xpGained + bonusXP} XP</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowModal(false)}
                        className="w-full py-3 bg-white text-black font-bold rounded-xl mt-4 hover:bg-zinc-200 transition-colors active:scale-95"
                    >
                        Awesome!
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
