import { ImageAnnotatorClient } from '@google-cloud/vision';

// Helper to get credentials from env
function getCredentials() {
    if (process.env.GOOGLE_VISION_CREDENTIALS_JSON) {
        try {
            return JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS_JSON);
        } catch (e) {
            console.error("Failed to parse GOOGLE_VISION_CREDENTIALS_JSON", e);
        }
    }
    return undefined; // Fallback to ADC or other mechanisms
}

const client = new ImageAnnotatorClient({
    credentials: getCredentials(),
});

export async function detectText(imageBuffer: Buffer) {
    try {
        // FALLBACK: Use Mock Data if no credentials provided
        if (!process.env.GOOGLE_VISION_CREDENTIALS_JSON) {
            console.warn("No Google Vision Credentials found. Using MOCK data.");
            return {
                text: "Mock Text: 日本語の勉強は楽しいです。東京駅に行きたい。",
                detections: [
                    { description: "日本語の勉強は楽しいです。東京駅に行きたい。", boundingPoly: { vertices: [] } },
                    { description: "日本語", boundingPoly: { vertices: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 50 }, { x: 10, y: 50 }] } },
                    { description: "勉強", boundingPoly: { vertices: [{ x: 110, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 50 }, { x: 110, y: 50 }] } },
                    { description: "楽しい", boundingPoly: { vertices: [{ x: 10, y: 60 }, { x: 100, y: 60 }, { x: 100, y: 100 }, { x: 10, y: 100 }] } },
                    { description: "東京", boundingPoly: { vertices: [{ x: 110, y: 60 }, { x: 180, y: 60 }, { x: 180, y: 100 }, { x: 110, y: 100 }] } },
                    { description: "駅", boundingPoly: { vertices: [{ x: 190, y: 60 }, { x: 230, y: 60 }, { x: 230, y: 100 }, { x: 190, y: 100 }] } },
                ]
            };
        }

        const [result] = await client.textDetection({
            image: { content: imageBuffer },
            imageContext: {
                languageHints: ["ja", "en"] // Hint for Japanese and English
            }
        });
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            return { text: "", fullTextAnnotation: null };
        }

        // First element is the entire text block
        const fullText = detections[0].description || "";
        const details = result.fullTextAnnotation;

        // Subsequent elements are individual words/blocks
        // We pass the raw result for advanced tokenization if needed later
        return { text: fullText, detections, details };
    } catch (error) {
        console.error("OCR Error:", error);
        // Return mock on error too for MVP resilience
        return {
            text: "Error/Mock: 東京駅",
            detections: [
                { description: "東京駅", boundingPoly: { vertices: [] } },
                { description: "東京", boundingPoly: { vertices: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 100 }, { x: 50, y: 100 }] } },
                { description: "駅", boundingPoly: { vertices: [{ x: 160, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 100 }, { x: 160, y: 100 }] } }
            ]
        };
    }
}
