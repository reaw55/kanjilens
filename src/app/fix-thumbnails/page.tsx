"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { getAdminMissingThumbnails, updateAdminThumbnail } from "@/actions/admin-backfill";

// Helper to generate thumbnail (Duplicated from CameraCapture for isolation)
async function generateThumbnail(specificUrl: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "Anonymous"; // Crucial for CORS
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(null);
                return;
            }

            // Max dimension 256px
            const MAX_SIZE = 256;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                resolve(blob);
            }, "image/jpeg", 0.7);
        };
        img.onerror = (e) => resolve(null); // Resolve null on error to skip
        img.src = specificUrl;
    });
}

export default function FixThumbnailsPage() {
    const [status, setStatus] = useState<"idle" | "scanning" | "processing" | "done">("idle");
    const [captures, setCaptures] = useState<any[]>([]);
    const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 });
    const [log, setLog] = useState<string[]>([]);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserEmail(user.email || "User");
            if (user) setUserEmail(user.email || "User");
            else addLog("Info: You are running as Guest. Admin Actions will still work for all users.");
        });
    }, []);

    const addLog = (msg: string) => setLog(prev => [msg, ...prev].slice(0, 50));

    async function scanMissing() {
        setStatus("scanning");
        addLog("Scanning ALL users for missing thumbnails (Admin Mode)...");

        const { data, error } = await getAdminMissingThumbnails();

        if (error) {
            addLog(`Error: ${error}`);
            setStatus("idle");
            return;
        }

        setCaptures(data || []);
        addLog(`Found ${data?.length || 0} captures needing thumbnails.`);
        setStatus("idle");
    }

    async function startBackfill() {
        if (captures.length === 0) return;

        setStatus("processing");
        setProgress({ current: 0, total: captures.length, success: 0, fail: 0 });

        for (let i = 0; i < captures.length; i++) {
            const cap = captures[i];
            setProgress(prev => ({ ...prev, current: i + 1 }));
            addLog(`Processing ${i + 1}/${captures.length}: ${cap.id.slice(0, 8)}...`);

            try {
                // 1. Generate Blob from URL
                const thumbBlob = await generateThumbnail(cap.image_url);

                if (!thumbBlob) {
                    addLog(`Failed to generate thumbnail for ${cap.id}`);
                    setProgress(prev => ({ ...prev, fail: prev.fail + 1 }));
                    continue;
                }

                // 2. Upload (Admin)
                const formData = new FormData();
                formData.append("thumbnail", thumbBlob);

                const res = await updateAdminThumbnail(cap.id, cap.user_id, formData);

                if (res.success) {
                    // addLog(`Success! URL: ${res.url}`);
                    setProgress(prev => ({ ...prev, success: prev.success + 1 }));
                } else {
                    addLog(`Upload Failed: ${res.error}`);
                    setProgress(prev => ({ ...prev, fail: prev.fail + 1 }));
                }

            } catch (e) {
                console.error(e);
                addLog(`Crash on ${cap.id}`);
                setProgress(prev => ({ ...prev, fail: prev.fail + 1 }));
            }

            // Small delay to prevent browser freeze / rate limit
            await new Promise(r => setTimeout(r, 100));
        }

        setStatus("done");
        addLog("Backfill Completed!");
    }

    return (
        <main className="min-h-screen bg-zinc-950 text-white p-8 max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-amber-500">Thumbnail Backfill Tool</h1>
                <div className={`text-xs px-3 py-1 rounded-full border ${userEmail ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-red-500/10 border-red-500 text-red-500'}`}>
                    {userEmail ? `Logged in as: ${userEmail}` : "Not Logged In"}
                </div>
            </div>

            <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold">Status: {status.toUpperCase()}</h2>
                        <p className="text-zinc-400 text-sm">Found {captures.length} missing thumbnails</p>
                    </div>
                    <div className="space-x-4">
                        <Button
                            onClick={scanMissing}
                            disabled={status === "processing"}
                            variant="outline"
                        >
                            Scan Missing
                        </Button>
                        <Button
                            onClick={startBackfill}
                            disabled={status === "processing" || captures.length === 0}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Start Backfill
                        </Button>
                    </div>
                </div>

                {/* Progress Bar */}
                {(status === "processing" || status === "done") && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-zinc-400">
                            <span>Progress: {progress.current} / {progress.total}</span>
                            <span>Success: {progress.success} | Fail: {progress.fail}</span>
                        </div>
                        <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Logs */}
                <div className="bg-black p-4 rounded-lg font-mono text-xs h-64 overflow-y-auto border border-zinc-800 text-zinc-300">
                    {log.map((l, i) => (
                        <div key={i} className="border-b border-zinc-900 py-1">{l}</div>
                    ))}
                    {log.length === 0 && <span className="text-zinc-600">Logs will appear here...</span>}
                </div>
            </div>
        </main>
    );
}
