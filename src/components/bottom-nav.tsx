"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const mode = searchParams.get("mode");

    // Determine active tab
    // Home/Map: pathname === "/" && (mode === "map" || !mode || mode === "dashboard")
    // Hunt: pathname === "/hunt"
    // Vocab: pathname === "/vocab"

    // We treat "/" as "Home" (Dashboard) or "Map" depending on mode
    // But for the nav bar items:
    // "Map" -> /?mode=map
    // "Hunt" -> /hunt
    // "Scan" -> /?mode=scan
    // "Vocab" -> /vocab
    // "Home" -> / (Dashboard)

    const isMap = pathname === "/" && mode === "map";
    const isScan = pathname === "/" && mode === "scan";
    const isHunt = pathname.startsWith("/hunt");
    const isVocab = pathname.startsWith("/vocab");
    const isQuiz = pathname.startsWith("/quiz");

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm pointer-events-none">
            <nav className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-2 flex justify-between items-center relative pointer-events-auto">

                {/* Map Tab */}
                <Link
                    href="/?mode=map"
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl transition-all duration-200",
                        isMap ? "text-amber-500 bg-white/5" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <span className={cn("material-symbols-rounded text-2xl", isMap && "fill-icon")}>map</span>
                    <span className="text-[10px] font-medium">Map</span>
                </Link>

                {/* Hunt Tab */}
                <Link
                    href="/hunt"
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl transition-all duration-200",
                        isHunt ? "text-amber-500 bg-white/5" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <span className="material-symbols-rounded text-2xl">location_searching</span>
                    <span className="text-[10px] font-medium">Hunt</span>
                </Link>

                {/* Scan Trigger (Center) */}
                <div className="relative -mt-8 mx-2">
                    <Link
                        href="/?mode=scan"
                        className={cn(
                            "h-16 w-16 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all duration-300 border-4 border-zinc-900",
                            isScan
                                ? "bg-amber-500 text-zinc-900 rotate-0"
                                : "bg-zinc-800 text-white hover:bg-zinc-700 hover:scale-105"
                        )}
                    >
                        <span className="material-symbols-rounded text-3xl">photo_camera</span>
                    </Link>
                </div>

                {/* Vocab Tab */}
                <Link
                    href="/vocab"
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl transition-all duration-200",
                        isVocab ? "text-amber-500 bg-white/5" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <span className="material-symbols-rounded text-2xl">school</span>
                    <span className="text-[10px] font-medium">Vocab</span>
                </Link>

                {/* Quiz Tab */}
                <Link
                    href="/quiz"
                    className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl transition-all duration-200",
                        isQuiz ? "text-amber-500 bg-white/5" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <span className={cn("material-symbols-rounded text-2xl", isQuiz && "fill-icon")}>sticky_note_2</span>
                    <span className="text-[10px] font-medium">Quiz</span>
                </Link>

            </nav>
        </div>
    );
}
