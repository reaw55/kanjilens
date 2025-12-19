"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function RecentCapturesList({ userId }: { userId: string }) {
    const [captures, setCaptures] = useState<any[] | null>(null);

    useEffect(() => {
        const supabase = createClient();
        async function fetchCaptures() {
            const { data } = await supabase
                .from("captures")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(3);
            setCaptures(data);
        }
        fetchCaptures();
    }, [userId]);

    if (captures === null) return (
        <div className="space-y-3 animate-pulse">
            <div className="h-16 bg-zinc-800 rounded-2xl"></div>
            <div className="h-16 bg-zinc-800 rounded-2xl"></div>
        </div>
    );

    if (captures.length === 0) {
        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center border-dashed">
                <p className="text-zinc-600 text-sm">No scans yet. Try the camera!</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {captures.map((capture) => (
                <Link href={`/scan/${capture.id}`} key={capture.id} className="block group">
                    <div className="flex items-center gap-4 bg-zinc-800/50 p-3 rounded-2xl border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
                        <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-zinc-950 shrink-0">
                            <img src={capture.image_url} alt="Scan" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-zinc-100 font-bold truncate">
                                {(capture.ocr_data as any)?.text || "Untitled Scan"}
                            </div>
                            <div className="text-xs text-zinc-500">
                                {new Date(capture.created_at).toLocaleDateString()} • {(capture.ocr_data as any)?.detections?.length || 0} words
                            </div>
                        </div>
                        <span className="material-symbols-rounded text-zinc-500 group-hover:text-amber-500 transition-colors">arrow_forward</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}
