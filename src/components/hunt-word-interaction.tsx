"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { learnHuntWord } from "@/actions/hunt";

type HuntWordInteractionProps = {
    word: string;
    isFound: boolean;
    vocabId: string | undefined;
    children: React.ReactNode;
};

export function HuntWordInteraction({ word, isFound, vocabId, children }: HuntWordInteractionProps) {
    const router = useRouter();
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleClick = () => {
        if (!isFound) return; // Do nothing if missing

        if (vocabId) {
            // Already learned -> Go to page with modal open
            router.push(`/vocab?open=${vocabId}`);
        } else {
            // Found but not learned -> Ask
            setShowModal(true);
        }
    };

    const handleLearn = async () => {
        setLoading(true);
        // This action now performs a server-side redirect
        // We catch strictly to avoid "NEXT_REDIRECT" errors crashing the UI if caught improperly, 
        // though typically Next handles them.
        try {
            // If we are here, it means NO redirect happened (or it returned data?)
            // If redirect happened, we probably won't reach here or it throws?
            // The action ALWAYS redirects on success, which behaves like an "abrupt completion" or error in Next.js client.
            // If we actually get a return value, it might be an error object.
            const res = await learnHuntWord(word);
            if (res && typeof res === 'object' && 'error' in res) {
                console.error("Learn Error:", (res as any).error);
            }
        } catch (e) {
            // Ignore redirects or other errors
        }
        setLoading(false);
    };

    return (
        <>
            <div onClick={handleClick} className="cursor-pointer contents">
                {children}
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden">
                        {/* Golden Glow Background */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

                        <div className="relative text-center space-y-4">
                            <div className="inline-flex p-3 bg-amber-500/10 rounded-full mb-2 ring-1 ring-amber-500/30">
                                <span className="material-symbols-rounded text-4xl text-amber-500">school</span>
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-white">Learn "{word}"?</h3>
                                <p className="text-zinc-400 text-sm mt-1">
                                    You found this word but haven't added it to your collection yet.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl hover:bg-zinc-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLearn}
                                    disabled={loading}
                                    className="py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <span className="animate-spin material-symbols-rounded">progress_activity</span>
                                    ) : (
                                        <>
                                            <span>Learn It</span>
                                            <span className="material-symbols-rounded text-sm">arrow_forward</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
