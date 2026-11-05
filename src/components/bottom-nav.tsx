"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
    { href: "/", label: "Play", icon: "extension", match: (p: string) => p === "/" },
    { href: "/vocab", label: "Words", icon: "menu_book", match: (p: string) => p.startsWith("/vocab") },
    { href: "/account", label: "Account", icon: "person", match: (p: string) => p.startsWith("/account") },
];

export function BottomNav() {
    const pathname = usePathname();
    const isScan = pathname.startsWith("/scan");

    const tab = (t: (typeof TABS)[number]) => {
        const active = t.match(pathname);
        return (
            <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl transition-colors",
                    active ? "text-amber-500 bg-white/5" : "text-zinc-500 hover:text-zinc-300"
                )}
            >
                <span className={cn("material-symbols-rounded text-2xl", active && "fill-icon")} aria-hidden>
                    {t.icon}
                </span>
                <span className="text-[10px] font-medium">{t.label}</span>
            </Link>
        );
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm pointer-events-none">
            <nav
                aria-label="Main"
                className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-2 flex justify-between items-center pointer-events-auto"
            >
                {tab(TABS[0])}
                {tab(TABS[1])}

                <div className="relative -mt-8 mx-2">
                    <Link
                        href="/scan"
                        aria-label="Scan kanji with the camera"
                        aria-current={isScan ? "page" : undefined}
                        className={cn(
                            "h-16 w-16 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all duration-300 border-4 border-zinc-900",
                            isScan ? "bg-amber-500 text-zinc-900" : "bg-zinc-800 text-white hover:bg-zinc-700 hover:scale-105"
                        )}
                    >
                        <span className="material-symbols-rounded text-3xl" aria-hidden>photo_camera</span>
                    </Link>
                </div>

                {tab(TABS[2])}
            </nav>
        </div>
    );
}
