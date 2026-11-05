"use client";

import { useState, useTransition } from "react";
import { addStarterDeck } from "@/actions/vocab";
import { cn } from "@/lib/utils";

export function StarterDeckButton({ compact = false }: { compact?: boolean }) {
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);

    const onClick = () => {
        setMessage(null);
        startTransition(async () => {
            const res = await addStarterDeck();
            setMessage(res.ok ? (res.message ?? null) : res.error);
        });
    };

    return (
        <div className={cn("flex flex-col gap-2", compact ? "items-end" : "items-center")}>
            <button
                type="button"
                onClick={onClick}
                disabled={isPending}
                className={cn(
                    "inline-flex items-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-60",
                    compact
                        ? "px-3 py-2 text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                        : "px-5 py-3 text-sm bg-amber-500 text-zinc-900 hover:bg-amber-400 shadow-lg shadow-amber-500/20"
                )}
            >
                <span className={cn("material-symbols-rounded text-base", isPending && "animate-spin")}>
                    {isPending ? "progress_activity" : "playlist_add"}
                </span>
                {compact ? "Starter deck" : "Add the N5 starter deck"}
            </button>
            {message && (
                <p role="status" className="text-xs text-zinc-400">
                    {message}
                </p>
            )}
        </div>
    );
}
