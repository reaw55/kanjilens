import { requireUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { signOut, signOutEverywhere } from "@/actions/auth";
import { BottomNav } from "@/components/bottom-nav";
import { ChangePasswordForm } from "./change-password-form";
import { getLevelProgress, getDisplayStreak } from "@/lib/progress";

export const metadata = { title: "Account · KanjiLens" };

export default async function AccountPage() {
    const user = await requireUser();
    const counts = await queryOne<{ words: number; sessions: number }>(
        `SELECT (SELECT count(*)::int FROM vocabulary_items WHERE user_id = $1) AS words,
                (SELECT count(*)::int FROM sessions WHERE user_id = $1 AND expires_at > now()) AS sessions`,
        [user.id]
    );
    const progress = getLevelProgress(user.xp);

    return (
        <div className="min-h-[100dvh] bg-zinc-900 text-zinc-50 px-4 pt-8 pb-32">
            <div className="max-w-md mx-auto space-y-6">
                <h1 className="text-3xl font-bold headline-metallic">Account</h1>

                <section className="bg-zinc-800/60 rounded-2xl p-5 ring-1 ring-white/5 space-y-4">
                    <div className="text-sm text-zinc-400 break-all">{user.email}</div>
                    <dl className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-zinc-900/70 rounded-xl p-3">
                            <dt className="text-[10px] uppercase tracking-widest text-zinc-500">Level</dt>
                            <dd className="text-2xl font-bold text-amber-400">{progress.level}</dd>
                        </div>
                        <div className="bg-zinc-900/70 rounded-xl p-3">
                            <dt className="text-[10px] uppercase tracking-widest text-zinc-500">Streak</dt>
                            <dd className="text-2xl font-bold text-orange-400">{getDisplayStreak(user)}</dd>
                        </div>
                        <div className="bg-zinc-900/70 rounded-xl p-3">
                            <dt className="text-[10px] uppercase tracking-widest text-zinc-500">Words</dt>
                            <dd className="text-2xl font-bold text-zinc-100">{counts?.words ?? 0}</dd>
                        </div>
                    </dl>
                    <div className="text-xs text-zinc-500">{user.xp.toLocaleString()} XP total</div>
                </section>

                <section className="bg-zinc-800/60 rounded-2xl p-5 ring-1 ring-white/5 space-y-4">
                    <h2 className="font-semibold">Change password</h2>
                    <ChangePasswordForm />
                </section>

                <section className="bg-zinc-800/60 rounded-2xl p-5 ring-1 ring-white/5 space-y-3">
                    <h2 className="font-semibold">Sessions</h2>
                    <p className="text-sm text-zinc-400">
                        Signed in on {counts?.sessions ?? 1} device{counts?.sessions === 1 ? "" : "s"}.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <form action={signOut}>
                            <button className="w-full h-11 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-sm font-semibold transition-colors">
                                Sign out
                            </button>
                        </form>
                        <form action={signOutEverywhere}>
                            <button className="w-full h-11 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 text-sm font-semibold transition-colors">
                                Sign out everywhere
                            </button>
                        </form>
                    </div>
                </section>
            </div>
            <BottomNav />
        </div>
    );
}
