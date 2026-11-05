import "server-only";
import { headers } from "next/headers";

/**
 * Small in-memory sliding-window rate limiter. Good enough for a single self-hosted
 * instance; state resets on restart and is not shared between replicas.
 */
type Bucket = { hits: number[] };

declare global {
    var __kanjilensRateLimits: Map<string, Bucket> | undefined;
}

const buckets = (globalThis.__kanjilensRateLimits ??= new Map<string, Bucket>());
let lastSweep = Date.now();

function sweep(now: number) {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
        // Drop buckets idle for more than a day.
        if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 86_400_000) {
            buckets.delete(key);
        }
    }
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
    const now = Date.now();
    sweep(now);
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= limit) {
        buckets.set(key, bucket);
        return { ok: false, retryAfterMs: windowMs - (now - bucket.hits[0]) };
    }
    bucket.hits.push(now);
    buckets.set(key, bucket);
    return { ok: true, retryAfterMs: 0 };
}

/** Clear a key (e.g. after a successful login). */
export function resetRateLimit(key: string) {
    buckets.delete(key);
}

/**
 * Best-effort client IP. Only meaningful behind a reverse proxy that sets these headers;
 * callers should also key limits on something the client can't rotate (email, user id).
 */
export async function getClientIp(): Promise<string> {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || h.get("x-real-ip") || "unknown";
}

export function formatRetry(ms: number): string {
    const minutes = Math.ceil(ms / 60_000);
    return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
