#!/usr/bin/env node
/**
 * Operator password reset (KanjiLens sends no email).
 *
 *   DATABASE_URL=postgres://... node scripts/reset-password.mjs user@example.com
 *       → generates a random password and prints it once
 *
 *   printf '%s' 'new password' | DATABASE_URL=... node scripts/reset-password.mjs user@example.com --password-stdin
 *       → uses the password from stdin (keeps it out of shell history / process lists)
 *
 * In Docker:  docker compose exec app node scripts/reset-password.mjs user@example.com
 *
 * Signs the user out everywhere. The hash format must match src/lib/auth/password.ts.
 */
import pg from "pg";
import { randomBytes, scrypt } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

function hashPassword(password) {
    const salt = randomBytes(16);
    return new Promise((resolve, reject) => {
        scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (err, key) => {
            if (err) return reject(err);
            resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`);
        });
    });
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
    const args = process.argv.slice(2);
    const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
    if (!email) {
        console.error("Usage: node scripts/reset-password.mjs <email> [--password-stdin]");
        process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is not set.");
        process.exit(1);
    }

    const fromStdin = args.includes("--password-stdin");
    const password = fromStdin ? await readStdin() : randomBytes(12).toString("base64url");
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
        console.error(`Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters.`);
        process.exit(1);
    }

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        await client.query("BEGIN");
        const updated = await client.query(
            "UPDATE users SET password_hash = $1, updated_at = now() WHERE email = $2 RETURNING id",
            [await hashPassword(password), email]
        );
        if (updated.rowCount !== 1) {
            await client.query("ROLLBACK");
            console.error(`No account with email ${email}.`);
            process.exit(1);
        }
        const sessions = await client.query("DELETE FROM sessions WHERE user_id = $1", [updated.rows[0].id]);
        await client.query("COMMIT");

        console.log(`Password reset for ${email}; ${sessions.rowCount} session(s) signed out.`);
        if (!fromStdin) {
            console.log(`Temporary password: ${password}`);
            console.log("Ask the user to change it on the Account page after signing in.");
        }
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error("Reset failed:", error.message);
    process.exit(1);
});
