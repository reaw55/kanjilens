import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

const KEY_LENGTH = 64;
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Verify a password against a stored hash.
 * Supports our scrypt format and bcrypt hashes imported from Supabase (`$2a$`/`$2b$`),
 * which are flagged for re-hashing on successful login.
 */
export async function verifyPassword(
    password: string,
    stored: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
    if (stored.startsWith("scrypt$")) {
        const [, n, r, p, saltB64, keyB64] = stored.split("$");
        const expected = Buffer.from(keyB64 ?? "", "base64");
        if (!saltB64 || expected.length === 0) return { ok: false, needsRehash: false };
        const params = { N: Number(n), r: Number(r), p: Number(p) };
        const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
            ...params,
            maxmem: 128 * params.N * params.r * 2,
        });
        const ok = actual.length === expected.length && timingSafeEqual(actual, expected);
        const outdated = params.N !== PARAMS.N || params.r !== PARAMS.r || params.p !== PARAMS.p;
        return { ok, needsRehash: ok && outdated };
    }
    if (/^\$2[aby]\$/.test(stored)) {
        const ok = await bcrypt.compare(password, stored);
        return { ok, needsRehash: ok };
    }
    return { ok: false, needsRehash: false };
}

let dummyHash: Promise<string> | null = null;

/** Burn the same CPU time as a real check so response timing doesn't reveal whether an email exists. */
export async function verifyAgainstDummy(password: string): Promise<void> {
    dummyHash ??= hashPassword("kanjilens-timing-equalizer");
    await verifyPassword(password, await dummyHash);
}

export function validatePasswordPolicy(password: string): string | null {
    if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    return null;
}
