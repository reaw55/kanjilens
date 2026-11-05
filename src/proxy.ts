import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Optimistic route guard: bounce visitors without a session cookie to /login.
 * The real check (session lookup in the database) happens in every page,
 * Server Action and Route Handler via requireUser()/getCurrentUser().
 */
export function proxy(request: NextRequest) {
    if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
}

export const config = {
    matcher: ["/scan/:path*", "/vocab/:path*", "/account/:path*"],
};
