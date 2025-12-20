"use client";

import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ConversationData } from "@/actions/conversation";
import { cn } from "@/lib/utils";
import { LAYOUT_CONFIG } from "@/config/layout.config";

type ConversationCardProps = {
    data: ConversationData;
    fullWord?: string; // Full compound word (e.g., 金貨)
    targetKanji?: string;
    onLearnMore?: (char: string) => void;
    onClose: () => void;
};


export function ConversationCard({ data, fullWord, targetKanji, onLearnMore, onClose }: ConversationCardProps) {
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const [isDesktop, setIsDesktop] = useState(false);

    // Random Sprite Selection
    const [sprites, setSprites] = useState<{ guide: number; charA: number; charB: number } | null>(null);

    // Refs for measurements
    const sceneRef = useRef<HTMLDivElement>(null);
    const dialogueRef = useRef<HTMLDivElement>(null);

    // Dynamic Positions for Sprites (Pixels from top of Scene container)
    // State: 
    // - null: Measured, but no bubble found (Use default fallback)
    // - number: Measured, found bubble (Use pinning)
    const [spriteTargets, setSpriteTargets] = useState<{ a: number | null, b: number | null }>({ a: null, b: null });

    const [sceneHeight, setSceneHeight] = useState(0);

    // Measure Layout
    const updateLayout = useCallback(() => {
        if (!sceneRef.current || !dialogueRef.current) return;

        // 1. Get Scene Height (Reference Frame)
        // Check offsetHeight first. If 0, it's hidden/collapsed, abort update.
        const sceneH = sceneRef.current.offsetHeight;
        if (sceneH === 0) {
            console.log("ConversationCard: SceneH is 0, skipping layout");
            return;
        }
        setSceneHeight(sceneH);

        // 2. Get Dialogue Container Offset (relative to scroll parent)
        const dialogueTop = dialogueRef.current.offsetTop;

        // 3. Find Last Bubbles for A and B
        const bubblesA = dialogueRef.current.querySelectorAll('[data-speaker="A"]');
        const bubblesB = dialogueRef.current.querySelectorAll('[data-speaker="B"]');

        console.log(`ConversationCard: Found A:${bubblesA.length}, B:${bubblesB.length} bubbles.`);

        const lastA = bubblesA.length > 0 ? bubblesA[bubblesA.length - 1] as HTMLElement : null;
        const lastB = bubblesB.length > 0 ? bubblesB[bubblesB.length - 1] as HTMLElement : null;

        let targetA: number | null = null;
        let targetB: number | null = null;

        // Calculate Target Y (Distance from Top of Scroll Container to Bubble Bottom)
        // We use offsetTop to get the stable layout position, ignoring animations.
        if (lastA) {
            targetA = dialogueTop + lastA.offsetTop + lastA.offsetHeight;
        }

        if (lastB) {
            targetB = dialogueTop + lastB.offsetTop + lastB.offsetHeight;
        }

        console.log(`[Layout] SceneH:${sceneH} | TargetA:${targetA} (from ${lastA ? 'found' : 'null'}) | TargetB:${targetB} (from ${lastB ? 'found' : 'null'})`);
        setSpriteTargets({ a: targetA, b: targetB });

    }, [data]);

    // Use useLayoutEffect to measure earlier in the render cycle (client-side)
    useLayoutEffect(() => {
        if (!sceneRef.current || !dialogueRef.current) return;

        // Initial measurement
        updateLayout();

        // ResizeObserver for layout shifts
        const resizeObserver = new ResizeObserver(() => {
            updateLayout();
        });
        resizeObserver.observe(sceneRef.current);
        resizeObserver.observe(dialogueRef.current);

        // MutationObserver for child node insertion (CRITICAL for detecting new bubbles)
        const mutationObserver = new MutationObserver(() => {
            updateLayout();
        });
        mutationObserver.observe(dialogueRef.current, { childList: true, subtree: true });

        window.addEventListener('resize', updateLayout);

        window.addEventListener('resize', updateLayout);

        // Polling fallback: Extended to 3s to catch slow animations/transitions
        const interval = setInterval(updateLayout, 200);
        const timer = setTimeout(() => {
            clearInterval(interval);
            console.log("ConversationCard: Layout polling finished.");
        }, 3000);

        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('resize', updateLayout);
            clearInterval(interval);
            clearTimeout(timer);
        };
    }, [updateLayout, data.dialogue.length]); // Re-run when dialogue changes


    // Helper to calculate dynamic bottom position
    const getDynamicBottom = (charConfig: any, targetY: number | null) => {
        // [Pinning Logic]
        // If targetY is defined (number) and config enabled, Pin it.
        if (targetY !== null && charConfig.offsetFromText) {
            return `calc(${sceneHeight}px - ${targetY}px + ${charConfig.offsetFromText})`;
        }

        // Fallback (targetY is null -> No bubble found, OR config disabled)
        return charConfig.bottom;
    };

    useEffect(() => {
        setContainer(document.body);
        const checkLayout = () => setIsDesktop(window.innerWidth >= 768);
        checkLayout();
        window.addEventListener('resize', checkLayout);

        // Randomize Sprites
        const guide = Math.floor(Math.random() * 2) + 1;
        let availablePeople = [1, 2, 3, 4, 5, 6].filter(id => id !== guide);
        const charAIndex = Math.floor(Math.random() * availablePeople.length);
        const charA = availablePeople[charAIndex];
        availablePeople = availablePeople.filter(id => id !== charA);
        const charBIndex = Math.floor(Math.random() * availablePeople.length);
        const charB = availablePeople[charBIndex];
        setSprites({ guide, charA, charB });

        document.body.classList.add('overflow-hidden');
        return () => {
            document.body.classList.remove('overflow-hidden');
            window.removeEventListener('resize', checkLayout);
        };
    }, []);

    const layout: any = isDesktop ? LAYOUT_CONFIG.desktop : LAYOUT_CONFIG.base;

    if (!container) return null;

    return createPortal(
        <>
            <style jsx global>{`
                body.overflow-hidden {
                    overflow: hidden !important;
                    overscroll-behavior: none !important;
                }
                .conversation-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 10000;
                    background-color: rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(24px);
                    display: flex;
                    align-items: center; justify-content: center;
                    padding: 1rem;
                    overscroll-behavior: contain;
                }
            `}</style>
            <div
                className="conversation-overlay animate-in fade-in duration-300"
                onClick={onClose}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
            >
                <div
                    className="relative w-full max-w-2xl h-[85dvh] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header: Fixed */}
                    <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-[50] bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                        <div className="pointer-events-auto">
                            <h2 className="text-4xl font-bold text-white drop-shadow-md">{data.word}</h2>
                            <div className="flex gap-2 items-center text-amber-400 mt-1">
                                <span className="text-lg font-medium">{data.reading}</span>
                                <span className="w-1 h-1 bg-zinc-500 rounded-full" />
                                <span className="text-zinc-300 italic">{data.meaning}</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="pointer-events-auto p-2 bg-black/40 rounded-full hover:bg-black/60 text-white transition-colors backdrop-blur-sm">
                            <span className="material-symbols-rounded text-2xl">close</span>
                        </button>
                    </div>

                    {/* SCENE & DIALOGUE SCROLL CONTAINER */}
                    <div className="absolute inset-0 z-20 overflow-y-auto overflow-x-hidden">

                        {/* 1. SCENE SPACER (Holds Sprites & Guide) */}
                        <div ref={sceneRef} className="relative w-full h-[85dvh] shrink-0 pointer-events-none">

                            {/* === GUIDE / SENSEI (Redesigned) === */}

                            {/* 1. Sensei Sprite (Absolute Independent) */}
                            <div
                                className="absolute z-30 animate-in slide-in-from-right-8 fade-in duration-700 delay-300 pointer-events-none"
                                style={{
                                    top: typeof layout.guide.top === 'number' ? `${layout.guide.top}px` : layout.guide.top,
                                    right: typeof layout.guide.right === 'number' ? `${layout.guide.right}px` : layout.guide.right,
                                    width: layout.guide.size,
                                    height: layout.guide.size
                                }}
                            >
                                <div className="relative w-full h-full translate-y-8">
                                    {sprites && (
                                        <img src={`/sprites/sensei/sensei${sprites.guide}.png`} alt="Sensei" className="w-full h-full object-contain filter drop-shadow-2xl" />
                                    )}
                                </div>
                            </div>

                            {/* 2. Sensei Bubble (Absolute Independent) */}
                            <div
                                className="absolute z-30 pointer-events-auto bg-zinc-900/95 backdrop-blur-xl border border-amber-500/30 p-6 rounded-3xl rounded-br-none text-zinc-100 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-500 delay-500"
                                style={{
                                    top: layout.guideBubble ? (typeof layout.guideBubble.top === 'number' ? `${layout.guideBubble.top}px` : layout.guideBubble.top) : (typeof layout.guide.top === 'number' ? `${layout.guide.top}px` : layout.guide.top),
                                    right: layout.guideBubble ? (typeof layout.guideBubble.right === 'number' ? `${layout.guideBubble.right}px` : layout.guideBubble.right) : 'auto',
                                    left: '8px', // Prevent overflow off left edge
                                    width: layout.guideBubble && layout.guideBubble.width ? (typeof layout.guideBubble.width === 'number' ? `${layout.guideBubble.width}px` : layout.guideBubble.width) : 'auto',
                                    maxWidth: 'calc(100% - 16px)' // Stay within parent bounds
                                }}
                            >
                                {/* Header: Full Word + Reading */}
                                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                                    <div className="bg-zinc-800 px-3 py-2 rounded-lg border border-white/5">
                                        <span className="text-2xl font-bold text-white leading-none">{fullWord || data.word}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-amber-400 font-mono text-sm">{data.reading}</span>
                                        <span className="text-xs text-zinc-500">{data.meaning}</span>
                                    </div>
                                </div>

                                {/* Action: Explore Button (Smaller, Subtle) */}
                                {targetKanji && onLearnMore && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onLearnMore(targetKanji);
                                        }}
                                        className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors opacity-80 hover:opacity-100"
                                    >
                                        <span className="material-symbols-rounded text-sm">add_circle</span>
                                        <span>Learn <span className="font-bold">{targetKanji}</span></span>
                                    </button>
                                )}

                                {/* Tail: Points Right (towards Sensei) */}
                                <div className="absolute top-1/2 -right-3 -mt-3 w-6 h-6 bg-zinc-900 border-r border-t border-amber-500/30 rotate-45 z-10" />
                            </div>

                            {/* === CHARACTERS === */}

                            {/* Character A (Left) */}
                            <div
                                className={cn(
                                    "absolute z-10 transition-all duration-300 ease-out"
                                )}
                                style={{
                                    bottom: getDynamicBottom(layout.charA, spriteTargets.a),
                                    left: layout.charA.left,
                                    width: layout.charA.width,
                                    height: layout.charA.height,
                                    transform: `rotate(${layout.charA.rotation || 0}deg)`
                                }}
                            >
                                <div className="w-full h-full relative flex items-end justify-center">
                                    <div className="absolute bottom-0 w-2/3 h-1/3 bg-amber-500/10 blur-xl rounded-full" />
                                    {sprites && (
                                        <img src={`/sprites/convo-people/Left/${sprites.charA}.png`} alt="Character A" className="w-full h-full object-contain filter drop-shadow-2xl" />
                                    )}
                                </div>
                            </div>

                            {/* Character B (Right) */}
                            <div
                                className={cn(
                                    "absolute z-10 transition-all duration-300 ease-out"
                                )}
                                style={{
                                    bottom: getDynamicBottom(layout.charB, spriteTargets.b),
                                    right: layout.charB.right,
                                    width: layout.charB.width,
                                    height: layout.charB.height,
                                    transform: `rotate(${layout.charB.rotation || 0}deg)`
                                }}
                            >
                                <div className="w-full h-full relative flex items-end justify-center">
                                    <div className="absolute bottom-0 w-2/3 h-1/3 bg-emerald-500/10 blur-xl rounded-full" />
                                    {sprites && (
                                        <img src={`/sprites/convo-people/Right/${sprites.charB}.png`} alt="Character B" className="w-full h-full object-contain filter drop-shadow-2xl" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. DIALOGUE TEXT (Flows after Scene) */}
                        <div
                            ref={dialogueRef}
                            className="relative z-20 flex flex-col gap-6 pointer-events-auto"
                            style={{
                                paddingBottom: layout.dialogue.paddingBottom,
                                marginTop: `calc(${layout.dialogue.paddingTop} - 85dvh)`,
                                paddingLeft: layout.dialogue.paddingX,
                                paddingRight: layout.dialogue.paddingX
                            }}
                        >
                            <div className="flex flex-col items-center justify-center -mt-12 mb-6 opacity-60 animate-bounce">
                                <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Example Conversation</span>
                                <span className="material-symbols-rounded text-xl text-zinc-500 mt-1">keyboard_double_arrow_down</span>
                            </div>

                            {data.dialogue.map((line, i) => {
                                const isLeft = line.speaker === "A";
                                return (
                                    <div key={i}
                                        data-speaker={line.speaker}
                                        className={cn(
                                            "flex w-full items-end gap-4 animate-in slide-in-from-bottom-4 fade-in duration-500",
                                            isLeft ? "justify-start" : "justify-end"
                                        )}
                                        style={{ animationDelay: `${i * 150}ms` }}
                                    >
                                        <div className={cn(
                                            "relative max-w-[85%] p-6 rounded-3xl shadow-2xl border backdrop-blur-md transform transition-transform hover:scale-[1.02] text-center",
                                            isLeft ? "bg-zinc-800/95 border-zinc-700 rounded-bl-sm" : "bg-neutral-100/95 border-white text-zinc-900 rounded-br-sm"
                                        )}>
                                            <p className={cn("text-2xl font-bold mb-2", isLeft ? "text-white" : "text-zinc-900")}>{line.japanese}</p>
                                            <p className={cn("text-xs font-mono mb-3 opacity-60 uppercase tracking-widest", isLeft ? "text-amber-400" : "text-emerald-700")}>{line.romaji}</p>
                                            <p className={cn("text-base leading-relaxed font-medium", isLeft ? "text-zinc-300" : "text-zinc-600")}>{line.english}</p>
                                            <div className={cn(
                                                "absolute -bottom-[1px] w-6 h-6",
                                                isLeft ? "left-0 bg-zinc-800/95 [clip-path:polygon(100%_0,0_100%,100%_100%)]" : "right-0 bg-neutral-100/95 [clip-path:polygon(0_0,0_100%,100%_100%)]"
                                            )} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Spacer */}
                        {/* Spacer to ensure scroll reaches bottom sprite */}
                        <div style={{
                            height: layout.dialogue.paddingBottom,
                            minHeight: '200px'
                        }} className="w-full shrink-0" />



                    </div>
                </div>
            </div>
        </>,
        container
    );
}
