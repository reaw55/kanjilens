"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Main navigation. The review game is the heart of the app, so "Play" leads;
 * scanning is just one of the ways to collect words and sits alongside the rest.
 */
const TABS = [
    { href: "/", label: "Play", icon: "extension", match: (p: string) => p === "/" },
    { href: "/vocab", label: "Words", icon: "menu_book", match: (p: string) => p.startsWith("/vocab") },
    { href: "/scan", label: "Scan", icon: "photo_camera", match: (p: string) => p.startsWith("/scan") },
    { href: "/account", label: "Account", icon: "person", match: (p: string) => p.startsWith("/account") },
] as const;

export function BottomNav() {
    const pathname = usePathname();

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm pointer-events-none pb-[env(safe-area-inset-bottom)]">
            <nav
                aria-label="Main"
                className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-1.5 grid grid-cols-4 gap-1 pointer-events-auto"
            >
                {TABS.map((t) => {
                    const active = t.match(pathname);
                    return (
                        <Link
                            key={t.href}
                            href={t.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                                "flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl transition-colors",
                                active
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                            )}
                        >
                            <span className={cn("material-symbols-rounded text-2xl", active && "fill-icon")} aria-hidden>
                                {t.icon}
                            </span>
                            <span className={cn("text-[11px]", active ? "font-semibold" : "font-medium")}>{t.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
