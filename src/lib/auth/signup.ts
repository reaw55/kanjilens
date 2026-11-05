import "server-only";
import { queryOne } from "@/lib/db";

/**
 * Sign-up is closed unless ALLOW_SIGNUP=true, except that the very first account can
 * always be created so a fresh install can be bootstrapped by its owner.
 */
export async function isSignupOpen(): Promise<boolean> {
    if ((process.env.ALLOW_SIGNUP ?? "").toLowerCase() === "true") return true;
    const row = await queryOne<{ has_users: boolean }>("SELECT EXISTS (SELECT 1 FROM users) AS has_users");
    return !row?.has_users;
}
