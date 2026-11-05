import { getCurrentUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Serve a capture's photo to its owner only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
        return new Response("Not found", { status: 404 });
    }

    const capture = await queryOne<{ file_name: string; mime_type: string }>(
        "SELECT file_name, mime_type FROM captures WHERE id = $1 AND user_id = $2",
        [id, user.id]
    );
    if (!capture) {
        return new Response("Not found", { status: 404 });
    }

    let data: Buffer;
    try {
        data = await readUpload(capture.file_name);
    } catch {
        return new Response("Not found", { status: 404 });
    }

    return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
            "Content-Type": capture.mime_type,
            "Content-Length": String(data.length),
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=86400",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    });
}
