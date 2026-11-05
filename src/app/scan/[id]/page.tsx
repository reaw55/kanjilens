import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { isAiEnabled } from "@/lib/openai";
import { KANJI_RE, isUuid } from "@/lib/validation";
import { WordPicker } from "@/components/scan/word-picker";
import type { Detection } from "@/components/scan/image-highlighter";

type StoredOcr = {
    text?: string;
    detections?: { description?: string; boundingPoly?: { vertices?: { x?: number; y?: number }[] } }[];
    page?: { width: number; height: number } | null;
    // Captures imported from the old Supabase deployment kept the full Vision annotation.
    details?: { pages?: { width?: number; height?: number }[] };
};

export default async function ScanResultPage({ params }: { params: Promise<{ id: string }> }) {
    const user = await requireUser();
    const { id } = await params;
    if (!isUuid(id)) notFound();

    const capture = await queryOne<{ id: string; ocr_data: StoredOcr | null; translation: string | null }>(
        "SELECT id, ocr_data, translation FROM captures WHERE id = $1 AND user_id = $2",
        [id, user.id]
    );
    if (!capture) notFound();

    const ocr = capture.ocr_data ?? {};
    const text = ocr.text ?? "";

    // The first detection is the whole text block; the rest are individual words.
    const detections: Detection[] = (ocr.detections ?? [])
        .slice(1)
        .filter((d): d is Detection => typeof d.description === "string" && KANJI_RE.test(d.description))
        .map((d) => ({
            description: d.description,
            boundingPoly: { vertices: (d.boundingPoly?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 })) },
        }));

    const legacyPage = ocr.details?.pages?.[0];
    const ocrDimensions =
        ocr.page ??
        (legacyPage?.width && legacyPage?.height ? { width: legacyPage.width, height: legacyPage.height } : undefined);

    return (
        <WordPicker
            captureId={capture.id}
            imageUrl={`/api/captures/${capture.id}/image`}
            detections={detections}
            ocrDimensions={ocrDimensions}
            initialTranslation={capture.translation}
            isMock={text.startsWith("Mock Text") || text.startsWith("Error/Mock")}
            canTranslate={isAiEnabled()}
        />
    );
}
