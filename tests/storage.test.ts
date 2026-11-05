import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let storage: typeof import("@/lib/storage");

before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "kanjilens-storage-"));
    process.env.UPLOAD_DIR = dir;
    storage = await import("@/lib/storage");
});
after(async () => {
    await rm(dir, { recursive: true, force: true });
});

const seg = (marker: number, payload: Buffer) => {
    const head = Buffer.alloc(4);
    head[0] = 0xff;
    head[1] = marker;
    head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
};

/** SOI, APP0 (JFIF), APP1 (Exif with fake GPS), APP13, DQT, SOS + scan data, EOI. */
function buildJpeg() {
    return Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
        seg(0xe1, Buffer.from("Exif\0\0GPS-LAT-35.6762-LNG-139.6503", "binary")),
        seg(0xed, Buffer.from("Photoshop 3.0\0IPTC-secret", "binary")),
        seg(0xdb, Buffer.alloc(65, 1)),
        seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
        Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
        Buffer.from([0xff, 0xd9]),
    ]);
}

test("sniffImageType identifies images by magic bytes only", () => {
    assert.equal(storage.sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(storage.sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(storage.sniffImageType(Buffer.from("RIFF\x10\0\0\0WEBPVP8 ", "binary")), "image/webp");
    assert.equal(storage.sniffImageType(Buffer.from("<html><script>alert(1)</script>")), null);
    assert.equal(storage.sniffImageType(Buffer.from("GIF89a")), null);
    assert.equal(storage.sniffImageType(Buffer.alloc(0)), null);
});

test("stripJpegMetadata drops APP1 (Exif/GPS) and APP13 (IPTC), keeps the rest", () => {
    const input = buildJpeg();
    const out = storage.stripJpegMetadata(input);
    assert.ok(!out.includes(Buffer.from("Exif")));
    assert.ok(!out.includes(Buffer.from("GPS-LAT")));
    assert.ok(!out.includes(Buffer.from("IPTC-secret")));
    assert.ok(out.includes(Buffer.from("JFIF")));
    // Scan data and EOI are copied verbatim.
    assert.deepEqual(out.subarray(-7), input.subarray(-7));
    assert.equal(storage.sniffImageType(out), "image/jpeg");
});

test("stripJpegMetadata returns malformed input unchanged", () => {
    const truncated = buildJpeg().subarray(0, 30);
    assert.equal(storage.stripJpegMetadata(truncated), truncated);
    const garbage = Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02]);
    assert.equal(storage.stripJpegMetadata(garbage), garbage);
    const notJpeg = Buffer.from("not a jpeg");
    assert.equal(storage.stripJpegMetadata(notJpeg), notJpeg);
});

test("saveUpload / readUpload / deleteUpload round-trip inside UPLOAD_DIR", async () => {
    const userId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const name = await storage.saveUpload(userId, Buffer.from("hello"), "jpg");
    assert.match(name, new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`));
    assert.equal((await storage.readUpload(name)).toString(), "hello");
    await storage.deleteUpload(name);
    await storage.deleteUpload(name); // idempotent
    await assert.rejects(storage.readUpload(name));
});

test("readUpload refuses path traversal and unexpected names", async () => {
    // A file outside the upload dir that an attacker would like to read.
    await mkdir(path.join(dir, "..", path.basename(dir) + "-outside"), { recursive: true });
    await writeFile(path.join(dir, "secret.txt"), "secret");
    for (const name of [
        "../etc/passwd",
        "/etc/passwd",
        "secret.txt",
        "3f2504e0-4f89-11d3-9a0c-0305e82c3301/../../secret.jpg",
        "3f2504e0-4f89-11d3-9a0c-0305e82c3301/3f2504e0-4f89-11d3-9a0c-0305e82c3301.html",
        "------------------------------------/------------------------------------.jpg/..",
    ]) {
        await assert.rejects(storage.readUpload(name), /Invalid stored file name|escapes/, name);
    }
    await rm(path.join(dir, "..", path.basename(dir) + "-outside"), { recursive: true, force: true });
});
