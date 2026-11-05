import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type User = {
    id: string;
    email: string;
    xp: number;
    streak: number;
    last_active_on: string | null;
};

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * Decide whether to set the `Secure` cookie flag.
 * COOKIE_SECURE=true|false forces it; the default ("auto") uses HTTPS when the request
 * arrived over HTTPS (directly or via a proxy such as a Cloudflare Tunnel).
 */
async function shouldUseSecureCookies(): Promise<boolean> {
    const setting = (process.env.COOKIE_SECURE ?? "auto").toLowerCase();
    if (setting === "true") return true;
    if (setting === "false") return false;
    const h = await headers();
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) return proto === "https";
    return (h.get("origin") ?? "").startsWith("https://");
}

/** Create a session for `userId` and set the cookie. Call only from Server Actions / Route Handlers. */
export async function createSession(userId: string): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [
        hashToken(token),
        userId,
        expiresAt,
    ]);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: await shouldUseSecureCookies(),
        path: "/",
        expires: expiresAt,
    });
}

/** Delete the current session (server-side) and clear the cookie. */
export async function destroySession(): Promise<void> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
        await query("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
    }
    store.delete(SESSION_COOKIE);
}

/** Revoke every session for a user except the one making this request. */
export async function destroyOtherSessions(userId: string): Promise<void> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [
        userId,
        token ? hashToken(token) : "",
    ]);
}

/** The signed-in user, or null. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token || token.length > 128) return null;
    return queryOne<User>(
        `SELECT u.id, u.email, u.xp, u.streak, to_char(u.last_active_on, 'YYYY-MM-DD') AS last_active_on
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = $1 AND s.expires_at > now()`,
        [hashToken(token)]
    );
});

/** The signed-in user; redirects to /login when there is none. Use in pages and Server Actions. */
export async function requireUser(): Promise<User> {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    return user;
}
