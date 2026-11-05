import "server-only";
import type { ImageAnnotatorClient } from "@google-cloud/vision";

export type OcrVertex = { x?: number | null; y?: number | null };
export type OcrDetection = {
    description?: string | null;
    boundingPoly?: { vertices?: OcrVertex[] | null } | null;
};
export type OcrResult = {
    text: string;
    detections?: OcrDetection[];
    details?: unknown;
};

/** Prefix used for placeholder data so the UI can warn that OCR isn't configured. */
export const MOCK_TEXT_PREFIX = "Mock Text";

let client: ImageAnnotatorClient | null = null;

function hasCredentials(): boolean {
    return Boolean(process.env.GOOGLE_VISION_CREDENTIALS_JSON);
}

async function getClient(): Promise<ImageAnnotatorClient> {
    if (!client) {
        const credentials = JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS_JSON as string);
        const { ImageAnnotatorClient } = await import("@google-cloud/vision");
        client = new ImageAnnotatorClient({ credentials });
    }
    return client;
}

function mockResult(): OcrResult {
    return {
        text: `${MOCK_TEXT_PREFIX}: 日本語の勉強は楽しいです。東京駅に行きたい。`,
        detections: [
            { description: "日本語の勉強は楽しいです。東京駅に行きたい。", boundingPoly: { vertices: [] } },
            { description: "日本語", boundingPoly: { vertices: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 50 }, { x: 10, y: 50 }] } },
            { description: "勉強", boundingPoly: { vertices: [{ x: 110, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 50 }, { x: 110, y: 50 }] } },
            { description: "楽しい", boundingPoly: { vertices: [{ x: 10, y: 60 }, { x: 100, y: 60 }, { x: 100, y: 100 }, { x: 10, y: 100 }] } },
            { description: "東京", boundingPoly: { vertices: [{ x: 110, y: 60 }, { x: 180, y: 60 }, { x: 180, y: 100 }, { x: 110, y: 100 }] } },
            { description: "駅", boundingPoly: { vertices: [{ x: 190, y: 60 }, { x: 230, y: 60 }, { x: 230, y: 100 }, { x: 190, y: 100 }] } },
        ],
    };
}

/**
 * Detect text with Google Cloud Vision. Returns placeholder data only when no
 * credentials are configured; real API failures are reported as `{ error }`.
 */
export async function detectText(imageBuffer: Buffer): Promise<OcrResult | { error: string }> {
    if (!hasCredentials()) {
        console.warn("GOOGLE_VISION_CREDENTIALS_JSON is not set; returning placeholder OCR data.");
        return mockResult();
    }

    try {
        const vision = await getClient();
        const [result] = await vision.textDetection({
            image: { content: imageBuffer },
            imageContext: { languageHints: ["ja", "en"] },
        });
        const detections = (result.textAnnotations ?? []) as OcrDetection[];
        if (detections.length === 0) {
            return { text: "", detections: [] };
        }
        return {
            text: detections[0].description ?? "",
            detections,
            details: result.fullTextAnnotation ?? null,
        };
    } catch (error) {
        console.error("OCR error:", error);
        return { error: "Text recognition failed. Please try again." };
    }
}
