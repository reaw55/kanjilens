import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-disk storage for captured photos. Files are never served directly; they are
 * read by the authenticated route at /api/captures/[id]/image after an ownership check.
 */

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

const EXTENSION_FOR: Record<ImageMime, "jpg" | "png" | "webp"> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

// `${userId}/${uuid}.${ext}` — both parts are server-generated UUIDs.
const FILE_NAME_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

function uploadRoot(): string {
    return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));
}

/** Map a stored relative name to an absolute path, refusing anything outside the upload root. */
function resolveStoredPath(fileName: string): string {
    if (!FILE_NAME_RE.test(fileName)) {
        throw new Error("Invalid stored file name");
    }
    const root = uploadRoot();
    const absolute = path.resolve(root, fileName);
    if (!absolute.startsWith(root + path.sep)) {
        throw new Error("Stored file path escapes upload directory");
    }
    return absolute;
}

export function extensionFor(mime: ImageMime): "jpg" | "png" | "webp" {
    return EXTENSION_FOR[mime];
}

/** Write a new file and return its server-generated relative name. Never overwrites. */
export async function saveUpload(userId: string, data: Buffer, ext: "jpg" | "png" | "webp"): Promise<string> {
    const fileName = `${userId}/${randomUUID()}.${ext}`;
    const absolute = resolveStoredPath(fileName);
    await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await writeFile(absolute, data, { flag: "wx", mode: 0o600 });
    return fileName;
}

export async function readUpload(fileName: string): Promise<Buffer> {
    return readFile(resolveStoredPath(fileName));
}

export async function deleteUpload(fileName: string): Promise<void> {
    try {
        await unlink(resolveStoredPath(fileName));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
}

/** Identify the image type from its magic bytes. The client-supplied name/type is never trusted. */
export function sniffImageType(buf: Buffer): ImageMime | null {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        buf.length >= 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) {
        return "image/png";
    }
    if (
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    return null;
}

/**
 * Remove APP1 (EXIF/XMP — includes GPS coordinates) and APP13 (IPTC) segments from a JPEG.
 * Everything from the start-of-scan marker onward is copied verbatim. If the segment
 * structure looks malformed, the input is returned unchanged rather than risk corrupting it.
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

    const kept: Buffer[] = [buf.subarray(0, 2)]; // SOI
    let offset = 2;

    while (offset < buf.length) {
        if (buf[offset] !== 0xff) return buf; // malformed

        // Skip fill bytes (0xFF padding before a marker).
        let markerOffset = offset;
        while (markerOffset < buf.length && buf[markerOffset] === 0xff) markerOffset++;
        if (markerOffset >= buf.length) return buf;
        const marker = buf[markerOffset];
        const segmentStart = offset;

        // Standalone markers without a length field.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            kept.push(buf.subarray(segmentStart, markerOffset + 1));
            offset = markerOffset + 1;
            continue;
        }

        // End of image before any scan data — nothing more to copy.
        if (marker === 0xd9) {
            kept.push(buf.subarray(segmentStart));
            return Buffer.concat(kept);
        }

        if (markerOffset + 3 > buf.length) return buf;
        const length = buf.readUInt16BE(markerOffset + 1);
        if (length < 2) return buf;
        const segmentEnd = markerOffset + 1 + length;
        if (segmentEnd > buf.length) return buf;

        // Start of scan: copy the header and all entropy-coded data / trailing markers as-is.
        if (marker === 0xda) {
            kept.push(buf.subarray(segmentStart));
            return Buffer.concat(kept);
        }

        const isApp1 = marker === 0xe1;
        const isApp13 = marker === 0xed;
        if (!isApp1 && !isApp13) {
            kept.push(buf.subarray(segmentStart, segmentEnd));
        }
        offset = segmentEnd;
    }

    // Ran off the end without finding SOS — don't trust our parse.
    return buf;
}
