import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { query } from "@/lib/db";
import type { CaptureSummary } from "@/lib/types";
import { BottomNav } from "@/components/bottom-nav";
import { CameraCapture } from "@/components/camera-capture";
import { DeleteCaptureButton } from "@/components/scan/delete-capture-button";

export const metadata = { title: "Scan · KanjiLens" };

async function listRecentCaptures(userId: string, limit = 10): Promise<CaptureSummary[]> {
    const rows = await query<{ id: string; created_at: Date; text: string | null; word_count: number | null }>(
        `SELECT id,
                created_at,
                ocr_data->>'text' AS text,
                CASE WHEN jsonb_typeof(ocr_data->'detections') = 'array'
                     THEN GREATEST(jsonb_array_length(ocr_data->'detections') - 1, 0)
                     ELSE 0 END AS word_count
           FROM captures
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [userId, limit]
    );
    return rows.map((r) => ({
        id: r.id,
        created_at: r.created_at.toISOString(),
        text_preview: (r.text ?? "").split("\n")[0].trim().slice(0, 60) || "Untitled scan",
        word_count: Number(r.word_count ?? 0),
    }));
}

export default async function ScanPage() {
    const user = await requireUser();
    const captures = await listRecentCaptures(user.id);

    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-zinc-50 pb-32">
            <header className="max-w-md mx-auto px-4 pt-8">
                <h1 className="text-3xl font-bold headline-metallic">Scan</h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Snap a sign, menu or label and pick the kanji you want to review.
                </p>
            </header>

            <CameraCapture />

            <section className="max-w-md mx-auto px-4">
                <div className="bg-zinc-900/90 rounded-3xl p-6 border border-zinc-800 shadow-2xl">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-rounded text-amber-500">history</span>
                        Recent Scans
                    </h2>

                    {captures.length === 0 ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center border-dashed">
                            <p className="text-zinc-600 text-sm">No scans yet. Try the camera!</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {captures.map((capture) => (
                                <li
                                    key={capture.id}
                                    className="flex items-center gap-3 bg-zinc-800/50 p-3 rounded-2xl border border-zinc-700/50 hover:bg-zinc-800 transition-colors"
                                >
                                    <Link href={`/scan/${capture.id}`} className="flex items-center gap-4 flex-1 min-w-0 group">
                                        <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-zinc-950 shrink-0">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated route */}
                                            <img
                                                src={`/api/captures/${capture.id}/image`}
                                                alt=""
                                                loading="lazy"
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-zinc-100 font-bold truncate">{capture.text_preview}</div>
                                            <div className="text-xs text-zinc-500">
                                                {new Date(capture.created_at).toLocaleDateString()} • {capture.word_count} words
                                            </div>
                                        </div>
                                        <span className="material-symbols-rounded text-zinc-500 group-hover:text-amber-500 transition-colors">
                                            arrow_forward
                                        </span>
                                    </Link>
                                    <DeleteCaptureButton captureId={capture.id} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            <BottomNav />
        </div>
    );
}
