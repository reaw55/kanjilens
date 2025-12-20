"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import React from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { ConversationCard } from "./conversation-card";
import type { ConversationData } from "@/actions/conversation";

// Types corresponding to our JSON structure
type DetailedData = {
    basicInfo?: {
        meaning: string;
        radical: string;
    };
    readings?: {
        onyomi?: { kana: string; note: string };
        kunyomi?: { kana: string; note: string };
    };
    combinations?: {
        word: string;
        reading: string;
        meaning: string;
        targetKanji: string;
    }[];
    dialogue?: {
        speaker: string;
        japanese: string;
        english: string;
    }[];

    // Legacy support for older structure if any
    kanji_breakdown?: any[];
};

type VocabDetailModalProps = {
    vocab: any;
    existingWords?: Set<string>;
    onJumpTo?: (word: string) => void;
    onClose: () => void;
    associatedCaptureText?: string | null;
};

export function VocabDetailModal({ vocab, existingWords, onJumpTo, onClose, associatedCaptureText }: VocabDetailModalProps) {
    const router = useRouter();

    if (!vocab) return null;

    // LOCAL STATE for Realtime Updates
    const [internalVocab, setInternalVocab] = React.useState(vocab);

    // Conversation Feature State
    const [conversationCache, setConversationCache] = React.useState<Record<string, ConversationData>>({});
    const [activeConversation, setActiveConversation] = React.useState<ConversationData | null>(null);
    const [activeTargetKanji, setActiveTargetKanji] = React.useState<string | undefined>(undefined);
    const [activeFullWord, setActiveFullWord] = React.useState<string | undefined>(undefined);
    const [loadingConversation, setLoadingConversation] = React.useState<string | null>(null);

    // Learn Confirmation State
    const [pendingLearnChar, setPendingLearnChar] = React.useState<string | null>(null);
    const [isLearning, setIsLearning] = React.useState(false);

    // Sync init if prop changes significantly
    React.useEffect(() => {
        // If ID changed OR (we are missing data AND the new prop has data)
        // This ensures that if router.refresh() happens in parent and passes down fresh data, we update.
        if (
            vocab.id !== internalVocab.id ||
            (!internalVocab.detailed_data && vocab.detailed_data)
        ) {
            console.log("Syncing internal vocab from props:", vocab);
            setInternalVocab(vocab);
        }
    }, [vocab, internalVocab.id, internalVocab.detailed_data]);

    // Realtime Subscription for pending items
    React.useEffect(() => {
        if (!internalVocab.detailed_data || internalVocab.status === 'learning') {
            const supabase = createClient();
            console.log(`Setting up Realtime for ID: ${internalVocab.id}`);

            const channel = supabase
                .channel(`vocab-${internalVocab.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'vocabulary_items',
                        filter: `id=eq.${internalVocab.id}`
                    },
                    async (payload) => {
                        console.log("Realtime Update Signal Received:", payload);

                        // FETCH FRESH DATA immediately to avoid payload size limits/issues
                        const { data: freshData, error } = await supabase
                            .from("vocabulary_items")
                            .select("*")
                            .eq("id", internalVocab.id)
                            .single();

                        if (freshData && !error) {
                            console.log("Refetched fresh data:", freshData);
                            setInternalVocab(freshData);
                        } else {
                            console.error("Failed to refetch data:", error);
                        }
                    }
                )
                .subscribe((status) => {
                    console.log(`Realtime Subscription Status for ${internalVocab.id}:`, status);
                });

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [internalVocab.id, internalVocab.detailed_data, internalVocab.status]);


    // Normalize Data (Handle both new rich structure and legacy/fallback)
    const detailed = (internalVocab.detailed_data as DetailedData) || {};

    // Helper to get Combinations
    // Support both new `combinations` root key and old `kanji_breakdown[].combinations`
    const combinations = detailed.combinations || (detailed.kanji_breakdown?.[0]?.combinations) || [];

    // Helper to get Readings
    const onyomi = detailed.readings?.onyomi ||
        (detailed.kanji_breakdown?.[0]?.onyomi ? { kana: detailed.kanji_breakdown[0].onyomi.join('/'), note: "" } : null);
    const kunyomi = detailed.readings?.kunyomi ||
        (detailed.kanji_breakdown?.[0]?.kunyomi ? { kana: detailed.kanji_breakdown[0].kunyomi.join('/'), note: "" } : null);

    // Portal Safety
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
        setContainer(document.body);

        // Lock Body Scroll
        document.body.classList.add('overflow-hidden');
        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, []);

    if (!container) return null;

    return createPortal(
        <>
            <style jsx global>{`
                body.overflow-hidden {
                    overflow: hidden !important;
                    overscroll-behavior: none !important;
                }
            `}</style>
            <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{ overscrollBehavior: 'contain' }}
            >
                <div
                    className="bg-zinc-950 w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-zinc-800 shadow-2xl relative scrollbar-hide"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-50 p-2 bg-zinc-900/80 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-rounded text-xl">close</span>
                    </button>

                    <div className="p-6 pb-20">

                        {/* 1. HERO HEADER */}
                        <div className="flex flex-col items-center justify-center mb-8 mt-4">
                            <div className="relative group w-full flex justify-center">
                                <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full opacity-50" />
                                <div className={cn(
                                    "bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/5 transition-all duration-300",
                                    vocab.kanji_word.length > 1
                                        ? "w-auto px-12 py-8 min-w-[120px]"
                                        : "w-32 h-32"
                                )}>
                                    <h1 className={cn(
                                        "font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent text-center leading-tight",
                                        vocab.kanji_word.length > 1 ? "text-4xl" : "text-6xl"
                                    )}>
                                        {internalVocab.kanji_word}
                                    </h1>
                                </div>
                            </div>
                            <p className="mt-4 text-xl font-medium text-amber-500 tracking-wide">{internalVocab.reading_kana}</p>
                            <p className="text-zinc-400 font-light mt-1">{internalVocab.meaning_en}</p>

                            {/* Basic Info Pill - Radical removed as requested */}
                            {/* 
                        {detailed.basicInfo && (
                            <div className="flex gap-2 mt-3">
                                <span className="px-2 py-1 bg-zinc-900 rounded-md text-[10px] text-zinc-500 border border-zinc-800">
                                    Radical: {detailed.basicInfo.radical}
                                </span>
                            </div>
                        )}
                        */}
                        </div>

                        {/* 2. READINGS */}
                        {(onyomi || kunyomi) && (
                            <section className="mb-8">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Readings</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                        <div className="text-[10px] text-amber-500/80 mb-1 font-mono uppercase">Onyomi</div>
                                        <div className="font-medium text-zinc-200">{onyomi?.kana || "—"}</div>
                                        <div className="text-[10px] text-zinc-500 mt-1">{onyomi?.note}</div>
                                    </div>
                                    <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                        <div className="text-[10px] text-emerald-500/80 mb-1 font-mono uppercase">Kunyomi</div>
                                        <div className="font-medium text-zinc-200">{kunyomi?.kana || "—"}</div>
                                        <div className="text-[10px] text-zinc-500 mt-1">{kunyomi?.note}</div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* 3. COMBINATIONS */}
                        {combinations.length > 0 && (
                            <section className="mb-8">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Common Words</h3>
                                <div className="space-y-2">
                                    {combinations.map((combo: any, i: number) => {
                                        // User request: "generate conversation page that compound word only"
                                        const targetWord = combo.word;

                                        return (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer group hover:border-amber-500/30"
                                                onClick={async () => {
                                                    // HELPER: Detect "Other" Kanji (e.g. for "金色" inside "金" card -> detect "色")
                                                    const detectTarget = (word: string) => {
                                                        const mainKanji = vocab.kanji_word || vocab.kanji;
                                                        if (!mainKanji) return word; // No main kanji? just use word

                                                        // Remove the main kanji from the compound
                                                        const remainder = word.replace(mainKanji, '');

                                                        // Regex to find ANY single Kanji in the remainder
                                                        // This handles "花火" (Firework) -> "花" (Flower) when viewing "火"
                                                        const match = remainder.match(/[\u4e00-\u9faf\u3400-\u4dbf]/);

                                                        if (match) return match[0];

                                                        // Fallback: If no other kanji found, use the combo's declared target or main kanji
                                                        return combo.targetKanji || mainKanji;
                                                    };

                                                    const smartTarget = detectTarget(targetWord);

                                                    // 1. Check Cache
                                                    if (conversationCache[targetWord]) {
                                                        setActiveConversation(conversationCache[targetWord]);
                                                        // Set the detected "Other" Kanji
                                                        setActiveTargetKanji(smartTarget);
                                                        setActiveFullWord(targetWord);
                                                        return;
                                                    }

                                                    // 2. Not in cache? Batch Fetch ALL!
                                                    setLoadingConversation(targetWord);

                                                    try {
                                                        // Collect all target words from the list
                                                        const allTargets = combinations.map((c: any) => c.word).filter(Boolean);

                                                        // Import & Call Server Action
                                                        const { generateConversationsForWords } = await import("@/actions/conversation");
                                                        const results = await generateConversationsForWords(allTargets);

                                                        // Update Cache
                                                        setConversationCache(prev => ({ ...prev, ...results }));

                                                        // Open the one we clicked
                                                        if (results[targetWord]) {
                                                            setActiveConversation(results[targetWord]);
                                                            setActiveTargetKanji(smartTarget);
                                                            setActiveFullWord(targetWord);
                                                        } else {
                                                            alert("Could not generate conversation for this word.");
                                                        }
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert("Failed to generate conversation.");
                                                    } finally {
                                                        setLoadingConversation(null);
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="font-bold text-white group-hover:text-amber-400 transition-colors">{combo.word}</span>
                                                        <span className="text-xs text-zinc-400">{combo.reading}</span>
                                                        {loadingConversation === targetWord && (
                                                            <span className="text-[10px] text-amber-500 animate-pulse flex items-center gap-1">
                                                                <span className="material-symbols-rounded text-xs animate-spin">sync</span>
                                                                Generating...
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-zinc-500">{combo.meaning}</div>
                                                </div>

                                                {/* Original "Add to List" Logic kept for secondary action if needed, or just make the whole row the generator? 
                                                User request: "when press the text box of the word" -> Whole row click.
                                                We can keep the "Add" button as a separate button on the right side if needed, 
                                                but for now let's prioritize the Conversation Feature on the row click.
                                            */}

                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-rounded text-zinc-600 group-hover:text-zinc-400 transition-colors text-lg">chat_bubble_outline</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* 4. DIALOGUE */}
                        <section>
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Conversation</h3>
                            {detailed.dialogue ? (
                                <div className="space-y-3">
                                    {detailed.dialogue.map((line, i) => (
                                        <div key={i} className={cn("flex gap-3", line.speaker === "B" ? "flex-row-reverse" : "")}>
                                            <div className={cn(
                                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-2",
                                                line.speaker === "A" ? "bg-amber-500 text-zinc-900" : "bg-zinc-700 text-zinc-300"
                                            )}>
                                                {line.speaker}
                                            </div>
                                            <div className={cn(
                                                "p-3 rounded-2xl max-w-[85%] text-sm",
                                                line.speaker === "A"
                                                    ? "bg-zinc-800/80 rounded-tl-none text-zinc-200"
                                                    : "bg-zinc-900 rounded-tr-none text-zinc-400 border border-zinc-800"
                                            )}>
                                                <p className="font-medium mb-1">{line.japanese}</p>
                                                <p className="text-xs opacity-70">{line.english}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                                    <p className="font-medium text-zinc-200 mb-1">{internalVocab.context_sentence_jp}</p>
                                    <p className="text-xs text-zinc-500">{internalVocab.context_sentence_en}</p>
                                </div>
                            )}
                        </section>

                        {/* 5. ACTIONS */}
                        <div className="mt-8 pt-8 border-t border-zinc-800 flex justify-center">
                            <Button
                                variant="destructive"
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm("Are you sure you want to delete this word?")) return;

                                    await import("@/actions/learn").then(mod => mod.deleteVocabulary(internalVocab.id));
                                    window.location.reload(); // Force hard reload to update list immediately
                                }}
                            >
                                <span className="material-symbols-rounded mr-2 text-lg">delete</span>
                                Remove Word
                            </Button>
                        </div>

                    </div>
                </div>

                {/* Conversation Overlay */}
                {activeConversation && (
                    <ConversationCard
                        data={activeConversation}
                        fullWord={activeFullWord}
                        targetKanji={activeTargetKanji}
                        onLearnMore={async (char: string) => {
                            if (window.confirm(`Learn ${char}? We'll create a custom lesson.`)) {
                                try {
                                    const { saveVocabulary } = await import("@/actions/learn");
                                    const seedLesson = {
                                        kanji: char,
                                        reading: "",
                                        meaning: "",
                                        context_usage: { sentence: "", english: "" }
                                    };

                                    const res = await saveVocabulary(seedLesson, null, "related");
                                    if (res.success || res.merged) {
                                        setActiveConversation(null);
                                        onClose();
                                        router.push('/vocab');
                                        router.refresh();
                                    } else {
                                        alert("Failed to add.");
                                    }
                                } catch (e) {
                                    console.error(e);
                                    alert("Error adding word.");
                                }
                            }
                        }}
                        onClose={() => setActiveConversation(null)}
                    />
                )}
            </div>
        </>,
        container
    );
}
