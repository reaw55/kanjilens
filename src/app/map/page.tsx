
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import Link from "next/link";

export default function MapPage() {
    const Map = useMemo(() => dynamic(
        () => import('@/components/map-view'),
        {
            loading: () => <div className="h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-50">Loading Map...</div>,
            ssr: false
        }
    ), []);

    return (
        <div className="relative h-screen bg-zinc-900">
            <Map />

            {/* Mobile Nav */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
                <nav className="flex items-center gap-1 p-2 rounded-2xl bg-zinc-900/80 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
                    <Link href="/">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-zinc-400">
                            <span className="material-symbols-rounded">home</span>
                        </div>
                    </Link>
                    <Link href="/map">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-amber-400">
                            <span className="material-symbols-rounded">map</span>
                        </div>
                    </Link>
                    <Link href="/vocab">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-zinc-400">
                            <span className="material-symbols-rounded">school</span>
                        </div>
                    </Link>
                </nav>
            </div>

            <Link href="/" className="absolute top-4 right-4 z-[1000] p-3 bg-zinc-900/90 rounded-full text-zinc-100 shadow-lg border border-zinc-700">
                <span className="material-symbols-rounded">close</span>
            </Link>
        </div>
    );
}
