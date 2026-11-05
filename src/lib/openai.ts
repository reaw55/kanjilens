import "server-only";
import OpenAI from "openai";

let client: OpenAI | null | undefined;

/** Shared OpenAI client, or null when OPENAI_API_KEY is not configured. */
export function getOpenAI(): OpenAI | null {
    if (client === undefined) {
        client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    }
    return client;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano-2025-08-07";

export function isAiEnabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
}
