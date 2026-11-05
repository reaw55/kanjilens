import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
    hashPassword,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    validatePasswordPolicy,
    verifyPassword,
} from "@/lib/auth/password";

test("scrypt hash round-trips and uses the expected format", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.match(hash, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.deepEqual(await verifyPassword("correct horse battery staple", hash), { ok: true, needsRehash: false });
});

test("wrong password is rejected", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.deepEqual(await verifyPassword("Correct horse battery staple", hash), { ok: false, needsRehash: false });
});

test("two hashes of the same password differ (random salt)", async () => {
    assert.notEqual(await hashPassword("same-password"), await hashPassword("same-password"));
});

test("bcrypt hashes imported from Supabase verify and are flagged for rehash", async () => {
    const b = bcrypt.hashSync("legacy-password", 4); // $2b$
    const a = b.replace(/^\$2b\$/, "$2a$"); // Supabase/GoTrue uses $2a$
    assert.deepEqual(await verifyPassword("legacy-password", b), { ok: true, needsRehash: true });
    assert.deepEqual(await verifyPassword("legacy-password", a), { ok: true, needsRehash: true });
    assert.deepEqual(await verifyPassword("nope", b), { ok: false, needsRehash: false });
});

test("unknown or malformed hash formats never verify", async () => {
    assert.equal((await verifyPassword("x", "")).ok, false);
    assert.equal((await verifyPassword("x", "plaintext")).ok, false);
    assert.equal((await verifyPassword("x", "scrypt$32768$8$1$$")).ok, false);
});

test("password policy enforces length bounds", () => {
    assert.notEqual(validatePasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1)), null);
    assert.equal(validatePasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH)), null);
    assert.equal(validatePasswordPolicy("a".repeat(PASSWORD_MAX_LENGTH)), null);
    assert.notEqual(validatePasswordPolicy("a".repeat(PASSWORD_MAX_LENGTH + 1)), null);
});
