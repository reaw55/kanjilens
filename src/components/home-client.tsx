"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { CameraCapture } from "@/components/camera-capture";
import { RecentCapturesList } from "@/components/recent-captures";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { signOut } from "@/actions/auth";

// Dynamically import MapView to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/map-view"), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-zinc-950 animate-pulse" />
});

import { BottomNav } from "./bottom-nav";

type HomeClientProps = {
    user: any;
    profile: any;
    stats: {
        currentLevel: number;
        nextXP: number;
        percent: number;
    };
    dueCount: number;
    capturesCount: number;
    initialMode: string;
};

type ViewMode = 'map' | 'scan' | 'dashboard';

export function HomeClient({ user, profile, stats, dueCount, capturesCount, initialMode }: HomeClientProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(initialMode as ViewMode);

    // Sync with prop updates (navigation from BottomNav)
    useEffect(() => {
        if (initialMode) {
            setViewMode(initialMode as ViewMode);
        }
    }, [initialMode]);

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-zinc-950 text-zinc-50">
            {/* 1. Underlying Map Layer (Always mounted to preserve state) */}
            <div className={cn(
                "absolute inset-0 z-0 transition-opacity duration-500",
                viewMode === 'map' ? "opacity-100" : "opacity-20 pointer-events-none"
            )}>
                <MapView />
            </div>

            {/* 2. Top Bar (Floating Profile Stats) */}
            <div className="absolute top-0 left-0 right-0 z-40 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="max-w-md mx-auto flex justify-between items-start pointer-events-auto">
                    {/* Level/XP Pill */}
                    <div className="bg-zinc-900/80 backdrop-blur-md rounded-2xl p-3 border border-zinc-800 shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-zinc-950 ring-2 ring-zinc-900">
                                {stats.currentLevel}
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-zinc-900 rounded-full px-1.5 py-0.5 border border-zinc-800">
                                <span className="text-[8px] font-bold text-amber-500">LVL</span>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                                <span>{(profile?.xp || 0).toLocaleString()} XP</span>
                            </div>
                            {/* Mini Progress Bar */}
                            <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                <div
                                    className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                                    style={{ width: `${stats.percent}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Streak Badge */}
                    <div className="flex gap-2">
                        <div className="bg-zinc-900/80 backdrop-blur-md rounded-xl p-2 border border-zinc-800 shadow-xl flex flex-col items-center min-w-[3rem]">
                            <span className="material-symbols-rounded text-orange-500 text-xl">local_fire_department</span>
                            <span className="text-xs font-bold text-white">{profile?.streak || 0}</span>
                        </div>
                        <form action={signOut}>
                            <button className="bg-zinc-900/80 backdrop-blur-md rounded-xl p-2 border border-zinc-800 shadow-xl flex flex-col items-center justify-center h-full min-w-[3rem] hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-red-400">
                                <span className="material-symbols-rounded text-xl">logout</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* 3. Main Content Area (Overlay) */}
            <main className="absolute inset-0 z-10 flex flex-col pt-24 pb-32 overflow-y-auto overflow-x-hidden no-scrollbar pointer-events-none">

                {/* SCAN MODE */}
                <div className={cn(
                    "flex-1 flex flex-col items-center justify-center transition-all duration-300 pointer-events-auto",
                    viewMode === 'scan' ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none hidden"
                )}>
                    <CameraCapture />
                </div>

                {/* DASHBOARD MODE */}
                <div className={cn(
                    "flex-1 px-4 transition-all duration-300 space-y-6 max-w-md mx-auto w-full pointer-events-auto",
                    viewMode === 'dashboard' ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none hidden"
                )}>
                    {/* Review Card */}
                    <div className="grid grid-cols-2 gap-4">
                        <Link href="/quiz" className="block group col-span-2">
                            <div className="bg-zinc-900/90 backdrop-blur-xl rounded-3xl p-6 border border-zinc-800 shadow-2xl relative overflow-hidden h-full">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <span className="material-symbols-rounded text-6xl">school</span>
                                </div>
                                <div className="relative z-10">
                                    <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Study Due</div>
                                    <div className="text-4xl font-bold text-white flex items-baseline gap-2">
                                        {dueCount} <span className="text-sm font-medium text-zinc-500">cards</span>
                                    </div>
                                    {dueCount > 0 ? (
                                        <div className="mt-4 inline-flex items-center gap-2 text-amber-500 text-sm font-bold">
                                            <span>Start Session</span>
                                            <span className="material-symbols-rounded text-base">arrow_forward</span>
                                        </div>
                                    ) : (
                                        <div className="mt-4 inline-flex items-center gap-2 text-zinc-500 text-sm font-bold">
                                            <span>All Caught Up</span>
                                            <span className="material-symbols-rounded text-base">check</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>

                        {/* Vocab List Card */}
                        <Link href="/vocab" className="block group col-span-2">
                            <div className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl p-4 border border-zinc-800 shadow-xl flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                                        <span className="material-symbols-rounded text-blue-500 text-2xl">menu_book</span>
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">Vocabulary List</div>
                                        <div className="text-xs text-zinc-400">View all collected Kanji</div>
                                    </div>
                                </div>
                                <span className="material-symbols-rounded text-zinc-600">chevron_right</span>
                            </div>
                        </Link>

                        {/* Kanji Hunt Card */}
                        <Link href="/hunt" className="block group col-span-2">
                            <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 backdrop-blur-xl rounded-2xl p-4 border border-amber-500/20 shadow-xl flex items-center justify-between hover:bg-amber-900/10 transition-colors relative overflow-hidden">
                                <div className="absolute inset-0 bg-amber-500/5 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                                        <span className="material-symbols-rounded text-amber-500 text-2xl">location_searching</span>
                                    </div>
                                    <div>
                                        <div className="font-bold text-amber-100">Kanji Hunt</div>
                                        <div className="text-xs text-amber-500/80">Find words in the real world</div>
                                    </div>
                                </div>
                                <span className="material-symbols-rounded text-amber-700/80">chevron_right</span>
                            </div>
                        </Link>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-zinc-900/90 backdrop-blur-xl rounded-3xl p-6 border border-zinc-800 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-amber-500">history</span>
                            Recent Scans
                        </h3>
                        <RecentCapturesList userId={user.id} />
                    </div>
                </div>

                {/* MAP MODE (Content is handled by the background MapView, just controls overlay visibility) */}
                {viewMode === 'map' && (
                    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-800 text-xs text-zinc-400">
                        {capturesCount} locations discovered
                    </div>
                )}

            </main>

            {/* 4. Bottom Navigation Bar */}
            <BottomNav />
        </div>
    );
}
