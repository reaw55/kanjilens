"use server";

import { redirect } from "next/navigation";
import { query, queryOne, withTransaction } from "@/lib/db";
import {
    hashPassword,
    validatePasswordPolicy,
    verifyAgainstDummy,
    verifyPassword,
} from "@/lib/auth/password";
import { createSession, destroyOtherSessions, destroySession, requireUser } from "@/lib/auth/session";
import { formatRetry, getClientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/validation";

export type FormState = { error?: string; success?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function readEmail(formData: FormData): string | null {
    const raw = formData.get("email");
    if (typeof raw !== "string") return null;
    const email = raw.trim().toLowerCase();
    return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function readPassword(formData: FormData, field = "password"): string {
    const raw = formData.get(field);
    return typeof raw === "string" ? raw : "";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
    const email = readEmail(formData);
    const password = readPassword(formData);
    if (!email || !password) return { error: "Enter your email and password." };

    const ip = await getClientIp();
    const byIp = rateLimit(`login:ip:${ip}`, 30, FIFTEEN_MINUTES);
    const byEmail = rateLimit(`login:email:${email}`, 10, FIFTEEN_MINUTES);
    if (!byIp.ok || !byEmail.ok) {
        const wait = Math.max(byIp.retryAfterMs, byEmail.retryAfterMs);
        return { error: `Too many sign-in attempts. Try again in ${formatRetry(wait)}.` };
    }

    const user = await queryOne<{ id: string; password_hash: string }>(
        "SELECT id, password_hash FROM users WHERE email = $1",
        [email]
    );
    if (!user) {
        await verifyAgainstDummy(password);
        return { error: "Invalid email or password." };
    }

    const { ok, needsRehash } = await verifyPassword(password, user.password_hash);
    if (!ok) return { error: "Invalid email or password." };

    if (needsRehash) {
        await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
            await hashPassword(password),
            user.id,
        ]);
    }

    resetRateLimit(`login:email:${email}`);
    await createSession(user.id);
    redirect(safeRedirectPath(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
    const email = readEmail(formData);
    const password = readPassword(formData);
    if (!email) return { error: "Enter a valid email address." };
    const policyError = validatePasswordPolicy(password);
    if (policyError) return { error: policyError };
    if (password !== readPassword(formData, "confirmPassword")) return { error: "Passwords do not match." };

    const ip = await getClientIp();
    const limit = rateLimit(`signup:ip:${ip}`, 5, ONE_HOUR);
    if (!limit.ok) return { error: `Too many sign-up attempts. Try again in ${formatRetry(limit.retryAfterMs)}.` };

    const passwordHash = await hashPassword(password);
    const allowAnyone = (process.env.ALLOW_SIGNUP ?? "").toLowerCase() === "true";

    const result = await withTransaction(async (client) => {
        // Serialize sign-ups so two "first account" requests can't both slip through.
        await client.query("SELECT pg_advisory_xact_lock(4206943)");
        if (!allowAnyone) {
            const { rows } = await client.query<{ has_users: boolean }>(
                "SELECT EXISTS (SELECT 1 FROM users) AS has_users"
            );
            if (rows[0]?.has_users) return { closed: true as const };
        }
        const { rows } = await client.query<{ id: string }>(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
            [email, passwordHash]
        );
        return { id: rows[0]?.id ?? null };
    });

    if ("closed" in result) return { error: "Sign-up is closed on this server. Ask the admin for an account." };
    if (!result.id) return { error: "Could not create an account with that email." };

    await createSession(result.id);
    redirect("/");
}

export async function signOut(): Promise<void> {
    await destroySession();
    redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
    const user = await requireUser();
    const limit = rateLimit(`change-password:${user.id}`, 10, FIFTEEN_MINUTES);
    if (!limit.ok) return { error: `Too many attempts. Try again in ${formatRetry(limit.retryAfterMs)}.` };

    const current = readPassword(formData, "currentPassword");
    const next = readPassword(formData, "newPassword");
    const policyError = validatePasswordPolicy(next);
    if (policyError) return { error: policyError };
    if (next !== readPassword(formData, "confirmPassword")) return { error: "New passwords do not match." };

    const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
    if (!row || !(await verifyPassword(current, row.password_hash)).ok) {
        return { error: "Current password is incorrect." };
    }

    await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
        await hashPassword(next),
        user.id,
    ]);
    await destroyOtherSessions(user.id);
    return { success: "Password updated. Other devices have been signed out." };
}

export async function signOutEverywhere(): Promise<void> {
    const user = await requireUser();
    await query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await destroySession();
    redirect("/login");
}
