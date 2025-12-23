"use client";

import { handleSelection } from "@/actions/handle-selection";
import { ImageHighlighter } from "@/components/scan/image-highlighter";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { use, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Allow generic access to params
export default function ScanPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const [capture, setCapture] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [filteredWords, setFilteredWords] = useState<any[]>([]);

    useEffect(() => {
        const supabase = createClient();
        async function fetchCapture() {
            const { data } = await supabase
                .from("captures")
                .select("*")
                .eq("id", id)
                .single();
            if (data) {
                setCapture(data);
                setLoading(false);

                // Lazy Backfill Translation
                if (!data.translation && data.ocr_data?.text) {
                    import("@/actions/upload-capture").then(({ ensureCaptureTranslation }) => {
                        ensureCaptureTranslation(data.id).then(res => {
                            if (res.success && res.translation) {
                                setCapture((prev: any) => ({ ...prev, translation: res.translation }));
                            }
                        });
                    });
                }
            } else {
                setLoading(false);
            }
        }
        fetchCapture();
    }, [id]);

    const ocrData = capture?.ocr_data as any; // Safe access

    // FILTER LOGIC:
    // 1. Must contain at least one Kanji ([\u4e00-\u9faf\u3400-\u4dbf])
    const words = (ocrData?.detections?.slice(1) || []).filter((w: any) => {
        const text = w.description;
        const hasKanji = /[\u4e00-\u9faf\u3400-\u4dbf]/.test(text);
        return hasKanji;
    });

    useEffect(() => {
        if (words && words.length > 0) {
            setFilteredWords(words);
        }
    }, [capture]); // Reset when data loads

    if (loading) return <div className="p-8 text-center text-zinc-500">Loading capture...</div>;
    if (!capture) return <div className="p-8 text-center text-red-400">Capture not found.</div>;


    // Deduplicate words (User Request: "check for duplicate in the word selection too only show one")
    const uniqueWords = Array.from(new Map(filteredWords.map((w: any) => [w.description, w])).values());

    // Extract OCR dimensions to detect rotation
    const ocrPage = ocrData?.details?.pages?.[0];
    const ocrDims = ocrPage ? { width: ocrPage.width, height: ocrPage.height } : undefined;

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-50 pb-20">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 p-4 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <Link href="/" className="pointer-events-auto inline-block p-2 rounded-full bg-black/40 backdrop-blur-md text-zinc-100">
                    <span className="material-symbols-rounded">arrow_back</span>
                </Link>
            </div>

            <div className="relative w-full h-[60vh] bg-zinc-950">
                <ImageHighlighter
                    imageUrl={capture.image_url}
                    thumbnailUrl={capture.thumbnail_url}
                    detections={words} // Pass pre-filtered kanji words to optimize
                    selectedWords={filteredWords}
                    ocrDimensions={ocrDims}
                    onFilter={(filtered) => setFilteredWords(filtered)}
                />

                {/* Overlay for Bounding Boxes - Simplified for MVP */}
                <div className="absolute inset-x-0 bottom-0 pointer-events-none">
                    <div className="absolute bottom-4 left-4 right-4 text-xs text-amber-400 font-mono bg-black/60 p-2 rounded-lg backdrop-blur-sm pointer-events-none flex justify-between items-center">
                        <span>DETECTED {uniqueWords.length} WORDS</span>
                        <span className="text-zinc-400 text-[10px]">Draw to filter</span>
                    </div>
                </div>
            </div>

            {/* Selection Area (BottomSheet-like) */}
            <div className="bg-zinc-900 rounded-t-3xl min-h-[40vh] -mt-6 relative z-10 px-6 py-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
                <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-8" />

                <h2 className="text-2xl font-bold mb-2 headline-metallic">Select Words</h2>

                {/* Context Translation */}
                {(ocrData?.text?.startsWith("Mock Text") || ocrData?.text?.startsWith("Error/Mock")) && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-xl text-red-200 text-xs flex items-center gap-2">
                        <span className="material-symbols-rounded text-lg">warning</span>
                        <div>
                            <strong>Mock Data Detected:</strong> <br />
                            Google Vision credentials missing. Bounding boxes are fake.
                        </div>
                    </div>
                )}

                {capture.translation && (
                    <div className="mb-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 text-zinc-300 text-sm leading-relaxed">
                        <div className="flex items-center gap-2 mb-2 text-amber-500 font-bold text-xs uppercase tracking-wider">
                            <span className="material-symbols-rounded text-sm">translate</span>
                            Context Translation
                        </div>
                        {capture.translation}
                    </div>
                )}

                <p className="text-zinc-400 text-sm mb-6">Tap the words you want to add to your list.</p>

                <form action={handleSelection}>
                    <input type="hidden" name="captureId" value={id} />
                    <input type="hidden" name="fullText" value={ocrData?.text || ""} />

                    <div className="flex flex-wrap gap-2">
                        {uniqueWords.length === 0 && (
                            <div className="text-zinc-500 text-sm italic">No text detected. Try scanning a clearer image.</div>
                        )}

                        {(() => {
                            // TRACKING SET to prevent duplicates across the entire list
                            const seenItems = new Set<string>(uniqueWords.map((w: any) => w.description));

                            return uniqueWords.map((w: any, i: number) => {
                                // SPLIT LOGIC: Extract individual Kanji
                                const wordText = w.description;
                                const candidates = Array.from(new Set(wordText.split("").filter((char: string) => /[\u4e00-\u9faf\u3400-\u4dbf]/.test(char))));

                                // Only show sub-items that haven't been seen yet (as main words or previous sub-items)
                                const uniqueSubItems = candidates.filter(k => !seenItems.has(k as string));

                                // Mark these as seen for future iterations
                                uniqueSubItems.forEach(k => seenItems.add(k as string));

                                return (
                                    <div key={i} className="flex flex-col gap-1">
                                        {/* Main Word */}
                                        <label className="cursor-pointer group">
                                            <input type="checkbox" name="words" value={w.description} className="peer hidden" />
                                            <span className="inline-block px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 transition-all peer-checked:bg-amber-500 peer-checked:text-zinc-900 peer-checked:border-amber-400 peer-checked:font-bold group-hover:bg-zinc-700">
                                                {w.description}
                                            </span>
                                        </label>

                                        {/* Component Kanji (Unique only) */}
                                        {uniqueSubItems.length > 0 && (
                                            <div className="flex gap-2 pl-4 border-l-2 border-zinc-800 ml-2">
                                                {uniqueSubItems.map((k, kIdx) => (
                                                    <label key={`${i}-${kIdx}`} className="cursor-pointer group/sub">
                                                        <input type="checkbox" name="words" value={k as string} className="peer hidden" />
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 text-sm transition-all peer-checked:bg-amber-500/20 peer-checked:text-amber-500 peer-checked:border-amber-500/50 peer-checked:font-bold group-hover/sub:border-zinc-600">
                                                            {k as string}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>

                    <div className="mt-8">
                        <Button type="submit" className="w-full h-12 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-white font-bold text-lg">
                            Start Learning
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
