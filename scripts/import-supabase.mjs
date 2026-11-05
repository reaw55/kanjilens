#!/usr/bin/env node
/**
 * One-time import from a Supabase project into the self-hosted KanjiLens database.
 *
 *   SUPABASE_DB_URL=postgres://...supabase... \
 *   DATABASE_URL=postgres://kanjilens:...@localhost:5432/kanjilens \
 *   node scripts/import-supabase.mjs [--with-images]
 *
 * Optional:
 *   SUPABASE_SSL_CA=/path/to/supabase-ca.crt  Verify the Supabase TLS certificate with this CA
 *                                              (download it from the Supabase dashboard).
 *   UPLOAD_DIR=./data/uploads                  Where --with-images stores photos (same as the app).
 *
 * Copies users (with their existing passwords), XP/streak and vocabulary. With --with-images it
 * also downloads every capture photo and its OCR data. Safe to re-run: rows that already exist
 * are left alone. Everything is written in a single transaction.
 *
 * The destination schema must exist: start the app once against DATABASE_URL first.
 */
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const WITH_IMAGES = process.argv.includes("--with-images");
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Interval (days) for each level of the old Supabase app's fixed SRS ladder. */
const OLD_LEVEL_INTERVAL_DAYS = [0, 0, 1, 3, 7, 30];
const SOURCES = new Set(["scan", "manual", "starter", "related", "import"]);
const PLACEHOLDERS = new Set(
    [
        "generating...",
        "loading...",
        "processing definition...",
        "generating definition...",
        "processing...",
        "reading",
        "meaning",
        "n/a",
        "...",
        "undefined",
        "null",
    ].map((s) => s.toLowerCase())
);

function fail(message) {
    console.error(`\n✖ ${message}`);
    process.exit(1);
}

async function sourceClientConfig() {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) fail("SUPABASE_DB_URL is not set (Supabase dashboard → Connect → connection string).");
    const caPath = process.env.SUPABASE_SSL_CA;
    if (!caPath) return { connectionString: url };
    // pg lets ssl params in the URL override the explicit `ssl` option, so strip them.
    const parsed = new URL(url);
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl"]) parsed.searchParams.delete(key);
    return {
        connectionString: parsed.toString(),
        ssl: { ca: await readFile(caPath, "utf8"), rejectUnauthorized: true },
    };
}

// ---------------------------------------------------------------------------
// Value cleaning
// ---------------------------------------------------------------------------

function str(value, max = 500) {
    if (typeof value !== "string") return null;
    const text = value.normalize("NFKC").trim();
    if (!text || PLACEHOLDERS.has(text.toLowerCase())) return null;
    return text.slice(0, max);
}

/** The old app saved this canned lesson whenever OpenAI was unavailable. It is not real data. */
function isMockLesson(row) {
    return row.kanji_word !== "日本語" && row.reading_kana === "Nihongo" && row.meaning_en === "Japanese Language";
}

/** Convert the old detailed_data JSON into the new VocabDetails shape (src/lib/types.ts). */
function convertDetails(old, row) {
    if (!old || typeof old !== "object") return null;
    const details = {};

    const onyomi = str(old.readings?.onyomi?.kana) ?? (Array.isArray(old.kanji_breakdown?.[0]?.onyomi) ? str(old.kanji_breakdown[0].onyomi.join("、")) : null);
    const kunyomi = str(old.readings?.kunyomi?.kana) ?? (Array.isArray(old.kanji_breakdown?.[0]?.kunyomi) ? str(old.kanji_breakdown[0].kunyomi.join("、")) : null);
    const radical = str(old.basicInfo?.radical, 20);
    if (onyomi) details.onyomi = onyomi;
    if (kunyomi) details.kunyomi = kunyomi;
    if (radical) details.radical = radical;

    const combos = Array.isArray(old.combinations) ? old.combinations : old.kanji_breakdown?.[0]?.combinations;
    if (Array.isArray(combos)) {
        const cleaned = combos
            .map((c) => ({ word: str(c?.word, 32), reading: str(c?.reading, 80), meaning: str(c?.meaning, 120) }))
            .filter((c) => c.word && c.reading && c.meaning)
            .slice(0, 10);
        if (cleaned.length) details.combinations = cleaned;
    }

    const contextJp = str(row.context_sentence_jp);
    const contextEn = str(row.context_sentence_en);
    const firstLine = Array.isArray(old.dialogue) ? old.dialogue[0] : null;
    const japanese = contextJp ?? str(firstLine?.japanese) ?? str(firstLine?.jp);
    const english = contextEn ?? str(firstLine?.english) ?? str(firstLine?.en);
    if (japanese && english) details.example = { japanese, english };

    return Object.keys(details).length ? details : null;
}

function sniffImage(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return { mime: "image/png", ext: "png" };
    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
        return { mime: "image/webp", ext: "webp" };
    return null;
}

async function download(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("invalid URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`unsupported protocol ${parsed.protocol}`);

    const res = await fetch(parsed, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) throw new Error(`too large (${declared} bytes)`);

    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) throw new Error(`too large (> ${MAX_IMAGE_BYTES} bytes)`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function tableExists(client, name) {
    const { rows } = await client.query("SELECT to_regclass($1) AS t", [name]);
    return rows[0].t !== null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (the self-hosted KanjiLens database).");
    const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "data/uploads");

    const src = new pg.Client(await sourceClientConfig());
    const dst = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await src.connect();
    await dst.connect();

    for (const table of ["public.users", "public.vocabulary_items", "public.captures"]) {
        if (!(await tableExists(dst, table))) {
            fail(`Destination is missing ${table}. Start KanjiLens once against DATABASE_URL so it creates the schema, then re-run.`);
        }
    }

    // ---- Read everything from Supabase --------------------------------------
    console.log("Reading from Supabase…");
    const authUsers = (await src.query("SELECT * FROM auth.users ORDER BY created_at")).rows;
    const profiles = (await tableExists(src, "public.profiles")) ? (await src.query("SELECT * FROM public.profiles")).rows : [];
    const vocab = (await src.query("SELECT * FROM public.vocabulary_items ORDER BY created_at")).rows;
    const captures = WITH_IMAGES && (await tableExists(src, "public.captures"))
        ? (await src.query("SELECT * FROM public.captures ORDER BY created_at")).rows
        : [];
    // Older versions linked words to photos through a junction table.
    const junction = WITH_IMAGES && (await tableExists(src, "public.vocabulary_captures"))
        ? (await src.query("SELECT vocabulary_id, capture_id FROM public.vocabulary_captures")).rows
        : [];
    await src.end();

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const summary = {
        usersImported: 0,
        usersAlreadyPresent: 0,
        usersSkipped: [],
        emailConflicts: [],
        vocabImported: 0,
        vocabAlreadyPresent: 0,
        vocabNeedsInput: 0,
        vocabSkippedNoUser: 0,
        capturesImported: 0,
        capturesAlreadyPresent: 0,
        capturesFailed: [],
        capturesRelinked: 0,
    };
    const writtenFiles = [];

    await dst.query("BEGIN");
    try {
        // ---- Users + profiles ----------------------------------------------
        for (const u of authUsers) {
            const email = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
            if (u.deleted_at) {
                summary.usersSkipped.push(`${email || u.id} (deleted)`);
                continue;
            }
            if (!email || !u.encrypted_password) {
                summary.usersSkipped.push(`${email || u.id} (${email ? "no password, e.g. OAuth-only" : "no email"})`);
                continue;
            }
            const profile = profileById.get(u.id) ?? {};
            const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : null;
            const res = await dst.query(
                `INSERT INTO users (id, email, password_hash, xp, streak, last_active_on, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6::date, $7)
                 ON CONFLICT DO NOTHING`,
                [
                    u.id,
                    email,
                    u.encrypted_password,
                    Math.max(0, Number(profile.xp) || 0),
                    Math.max(0, Number(profile.streak) || 0),
                    lastActive ? lastActive.toISOString().slice(0, 10) : null,
                    u.created_at ?? new Date(),
                ]
            );
            if (res.rowCount === 1) summary.usersImported++;
        }

        // Which source users now exist locally under the same id?
        const { rows: present } = await dst.query("SELECT id, email FROM users WHERE id = ANY($1::uuid[])", [
            authUsers.map((u) => u.id),
        ]);
        const presentIds = new Set(present.map((r) => r.id));
        summary.usersAlreadyPresent = presentIds.size - summary.usersImported;
        for (const u of authUsers) {
            if (presentIds.has(u.id) || !u.email || !u.encrypted_password || u.deleted_at) continue;
            summary.emailConflicts.push(u.email.toLowerCase());
        }

        // ---- Captures (photos) ---------------------------------------------
        const captureIdMap = new Map(); // source capture id -> local capture id
        for (const c of captures) {
            if (!presentIds.has(c.user_id)) continue;
            const existing = await dst.query("SELECT id FROM captures WHERE id = $1", [c.id]);
            if (existing.rowCount) {
                captureIdMap.set(c.id, c.id);
                summary.capturesAlreadyPresent++;
                continue;
            }
            try {
                const bytes = await download(c.image_url);
                const type = sniffImage(bytes);
                if (!type) throw new Error("not a JPEG/PNG/WebP image");
                const hash = createHash("sha256").update(bytes).digest("hex");

                // Same photo uploaded twice by this user: point at the copy we already have.
                const dup = await dst.query("SELECT id FROM captures WHERE user_id = $1 AND image_hash = $2", [c.user_id, hash]);
                if (dup.rowCount) {
                    captureIdMap.set(c.id, dup.rows[0].id);
                    summary.capturesAlreadyPresent++;
                    continue;
                }

                const fileName = `${c.user_id}/${randomUUID()}.${type.ext}`;
                const fullPath = path.join(uploadDir, fileName);
                await mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
                await writeFile(fullPath, bytes, { flag: "wx", mode: 0o600 });
                writtenFiles.push(fullPath);

                await dst.query(
                    `INSERT INTO captures (id, user_id, file_name, mime_type, byte_size, image_hash, ocr_data, translation, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
                    [
                        c.id,
                        c.user_id,
                        fileName,
                        type.mime,
                        bytes.length,
                        hash,
                        c.ocr_data == null ? null : JSON.stringify(c.ocr_data),
                        typeof c.translation === "string" ? c.translation : null,
                        c.created_at ?? new Date(),
                    ]
                );
                captureIdMap.set(c.id, c.id);
                summary.capturesImported++;
            } catch (error) {
                summary.capturesFailed.push(`${c.id}: ${error.message}`);
            }
        }

        const junctionByVocab = new Map();
        for (const j of junction) if (!junctionByVocab.has(j.vocabulary_id)) junctionByVocab.set(j.vocabulary_id, j.capture_id);

        // ---- Vocabulary ----------------------------------------------------
        for (const v of vocab) {
            if (!presentIds.has(v.user_id)) {
                summary.vocabSkippedNoUser++;
                continue;
            }
            const word = typeof v.kanji_word === "string" ? v.kanji_word.normalize("NFKC").trim() : "";
            if (!word) continue;

            const mock = isMockLesson(v);
            const reading = mock ? null : str(v.reading_kana, 80);
            const meaning = mock ? null : str(v.meaning_en, 120);
            const status = reading && meaning ? "ready" : "needs_input";
            const rawSource = typeof v.source === "string" ? v.source : "scan";
            const source = SOURCES.has(rawSource) ? rawSource : "import";
            const details = mock ? null : convertDetails(v.detailed_data, v);
            const sourceCaptureId = v.capture_id ?? junctionByVocab.get(v.id) ?? null;
            const captureId = sourceCaptureId ? captureIdMap.get(sourceCaptureId) ?? null : null;

            const srsLevel = Math.max(0, Math.trunc(Number(v.srs_level) || 0));
            const res = await dst.query(
                `INSERT INTO vocabulary_items
                    (id, user_id, capture_id, kanji_word, reading_kana, meaning_en,
                     context_sentence_jp, context_sentence_en, detailed_data, status, source,
                     srs_level, repetitions, interval_days, next_review_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $12, $13, $14, $15)
                 ON CONFLICT DO NOTHING`,
                [
                    v.id,
                    v.user_id,
                    captureId,
                    word,
                    reading,
                    meaning,
                    mock ? null : str(v.context_sentence_jp),
                    mock ? null : str(v.context_sentence_en),
                    details ? JSON.stringify(details) : null,
                    status,
                    source,
                    srsLevel,
                    // Seed SM-2 from the old Supabase ladder (0, 10 min, 1d, 3d, 7d, 30d);
                    // ease_factor starts at the SM-2 default of 2.5.
                    OLD_LEVEL_INTERVAL_DAYS[Math.min(srsLevel, OLD_LEVEL_INTERVAL_DAYS.length - 1)],
                    v.next_review_at ?? new Date(),
                    v.created_at ?? new Date(),
                ]
            );
            if (res.rowCount === 1) {
                summary.vocabImported++;
                if (status === "needs_input") summary.vocabNeedsInput++;
            } else {
                summary.vocabAlreadyPresent++;
                // A previous run without --with-images left capture_id empty: link it now.
                if (captureId) {
                    const relink = await dst.query(
                        "UPDATE vocabulary_items SET capture_id = $1 WHERE id = $2 AND user_id = $3 AND capture_id IS NULL",
                        [captureId, v.id, v.user_id]
                    );
                    summary.capturesRelinked += relink.rowCount;
                }
            }
        }

        await dst.query("COMMIT");
    } catch (error) {
        await dst.query("ROLLBACK").catch(() => {});
        await Promise.all(writtenFiles.map((f) => unlink(f).catch(() => {})));
        throw error;
    } finally {
        await dst.end();
    }

    // ---- Report ---------------------------------------------------------------
    console.log("\nImport complete");
    console.log(`  Users:      ${summary.usersImported} imported, ${summary.usersAlreadyPresent} already present`);
    if (summary.usersSkipped.length) {
        console.log(`  Skipped ${summary.usersSkipped.length} user(s) that cannot sign in with a password:`);
        for (const s of summary.usersSkipped) console.log(`    - ${s}`);
    }
    if (summary.emailConflicts.length) {
        console.log(`  ${summary.emailConflicts.length} email(s) already belong to a different local account (their words were not imported):`);
        for (const e of summary.emailConflicts) console.log(`    - ${e}`);
    }
    console.log(
        `  Vocabulary: ${summary.vocabImported} imported, ${summary.vocabAlreadyPresent} already present` +
            (summary.vocabNeedsInput ? `, ${summary.vocabNeedsInput} need a reading/meaning (fill them in on /vocab)` : "") +
            (summary.vocabSkippedNoUser ? `, ${summary.vocabSkippedNoUser} skipped (owner not imported)` : "")
    );
    if (WITH_IMAGES) {
        console.log(
            `  Photos:     ${summary.capturesImported} downloaded, ${summary.capturesAlreadyPresent} already present` +
                (summary.capturesRelinked ? `, ${summary.capturesRelinked} word(s) re-linked` : "")
        );
        if (summary.capturesFailed.length) {
            console.log(`  ${summary.capturesFailed.length} photo(s) could not be downloaded:`);
            for (const f of summary.capturesFailed.slice(0, 50)) console.log(`    - ${f}`);
        }
        console.log(`  Photos are stored in ${uploadDir}`);
    } else {
        console.log("  Photos:     not imported (re-run with --with-images to copy scans and their OCR data)");
    }
    console.log("\nUsers sign in with their existing email and password.");
}

main().catch((error) => {
    console.error("\n✖ Import failed, nothing was written:", error.message);
    process.exit(1);
});
