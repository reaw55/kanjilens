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
    if (result.error || !result.session) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
                <p className="text-red-500">Failed to load hunt session.</p>
                <Link href="/" className="mt-4 text-zinc-400 underline">Back to Home</Link>
            </div>
        );
    }

    const session = result.session;
    const targets = session.target_words as string[];
    const found = session.found_words as string[];
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

                    <div className="relative z-10">
                        <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">Current Mission</h2>
                        <h3 className="text-2xl font-bold text-white mb-4">Street Signs: Level 1</h3>

                        <div className="flex items-end justify-between mb-2">
                            <span className="text-4xl font-bold text-amber-500">{found.length}<span className="text-lg text-zinc-500">/{targets.length}</span></span>
                            <span className="text-sm font-bold text-zinc-400 mb-1">{progress}% Complete</span>
                        </div>

                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {targets.map((word, i) => {
                        const isFound = found.includes(word);
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "aspect-square rounded-2xl flex flex-col items-center justify-center p-4 border transition-all relative overflow-hidden group",
                                    isFound
                                        ? "bg-emerald-950/30 border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                                )}
                            >
                                {isFound && (
                                    <div className="absolute top-2 right-2">
                                        <span className="material-symbols-rounded text-emerald-500 text-xl animate-in zoom-in spin-in-180 duration-500">check_circle</span>
                                    </div>
                                )}

                                <div className={cn(
                                    "text-3xl font-bold mb-2 transition-colors",
                                    isFound ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
                                )}>
                                    {word}
                                </div>

                                <div className={cn(
                                    "text-xs font-medium px-2 py-1 rounded-full",
                                    isFound ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                                )}>
                                    {isFound ? "FOUND" : "MISSING"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
