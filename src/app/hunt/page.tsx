import { getCurrentHunt } from "@/actions/hunt";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function HuntPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return redirect("/login");

    const result = await getCurrentHunt();

    // Auto-scan recent uploads for missed matches
    // We import dynamically to avoid circular deps if any (though safe here)
    const { scanRecentCapturesForHunt } = await import("@/actions/hunt");
    const scanResult: any = await scanRecentCapturesForHunt();

    // Force UI update by merging locally instead of relying on re-fetch (which might be cached)
    const session = result.session;
    const newFindings = scanResult?.findings || [];
    const targets = session.target_words as string[];

    // Merge and Deduplicate
    const found = Array.from(new Set([...(session.found_words as string[]), ...newFindings]));

    const progress = Math.round((found.length / targets.length) * 100);

    return (
        <div className="min-h-screen bg-zinc-950 text-white pb-24">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 p-4 flex items-center justify-between">
                <Link href="/" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
                    <span className="material-symbols-rounded text-2xl">arrow_back</span>
                </Link>
                <h1 className="font-bold text-lg flex items-center gap-2">
                    <span className="material-symbols-rounded text-amber-500">location_searching</span>
                    Kanji Hunt
                </h1>
                <div className="w-8" /> {/* Spacer */}
            </div>

            <div className="p-6 max-w-md mx-auto">
                {/* Progress Card */}
                <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <span className="material-symbols-rounded text-8xl text-amber-500">flag</span>
                    </div>

                    <div className="relative z-10 w-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Current Mission</h2>
                                <h3 className="text-2xl font-bold text-white">
                                    {session.theme || "Street Signs"}: Mission {session.mission_number || session.level_number || 1}
                                </h3>
                            </div>
                            {progress === 100 && (
                                <div className="bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full animate-bounce">
                                    COMPLETED!
                                </div>
                            )}
                        </div>

                        <div className="flex items-end justify-between mb-2">
                            <span className="text-4xl font-bold text-amber-500">{found.length}<span className="text-lg text-zinc-500">/{targets.length}</span></span>
                            <span className="text-sm font-bold text-zinc-400 mb-1">{progress}% Complete</span>
                        </div>

                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden mb-4">
                            <div
                                className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        {progress === 100 && (
                            <form action={async () => {
                                "use server";
                                const { advanceLevel } = await import("@/actions/hunt");
                                await advanceLevel();
                            }}>
                                <button className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                                    <span>Start Next Mission</span>
                                    <span className="material-symbols-rounded">arrow_forward</span>
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {targets.map((word, i) => {
                        // ROBUSTNESS: Trim both to be safe
                        const isFound = found.some(f => f.trim() === word.trim());
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "aspect-square rounded-2xl flex flex-col items-center justify-center p-4 border transition-all relative overflow-hidden group",
                                    isFound
                                        ? "bg-amber-950/30 border-amber-500/30 shadow-lg shadow-amber-500/10"
                                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                                )}
                            >
                                {isFound && (
                                    <div className="absolute top-2 right-2">
                                        <span className="material-symbols-rounded text-amber-500 text-xl animate-in zoom-in spin-in-180 duration-500">check_circle</span>
                                    </div>
                                )}

                                <div className={cn(
                                    "text-3xl font-bold mb-2 transition-colors",
                                    isFound ? "text-amber-400" : "text-zinc-500 group-hover:text-zinc-300"
                                )}>
                                    {word}
                                </div>

                                <div className={cn(
                                    "text-xs font-medium px-2 py-1 rounded-full",
                                    isFound ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-600"
                                )}>
                                    {isFound ? "FOUND" : "MISSING"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Celebration Modal (Passive Scan Results) */}
            {scanResult?.success && scanResult.findings?.length > 0 && (
                <HuntCelebration
                    newFindings={scanResult.findings}
                    xpGained={scanResult.xpGained || 0}
                    levelComplete={scanResult.levelComplete || false}
                    bonusXP={scanResult.bonusXP || 0}
                />
            )}
        </div>
    );
}

import { HuntCelebration } from "@/components/hunt-celebration";
