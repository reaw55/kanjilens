import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { getDisplayStreak } from "@/lib/progress";
import { MatchGame } from "@/components/match-game";

type CountsRow = {
  ready_count: number;
  due_count: number;
  pending_count: number;
  needs_input_count: number;
  total_count: number;
};

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-zinc-900 text-zinc-50 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-600/10 blur-[100px]" />
        <div className="relative z-10 text-center space-y-6 max-w-md">
          <h1 className="text-5xl font-bold tracking-tight headline-metallic">KanjiLens</h1>
          <p className="text-zinc-400 text-lg">
            Review kanji by dragging each reading and meaning onto the right character. Collect words from
            signs with your camera, or start with a starter deck.
          </p>
          <div className="flex gap-4 justify-center pt-2">
            <Link
              href="/login"
              className="h-12 px-8 inline-flex items-center rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-lg shadow-lg shadow-amber-500/20"
            >
              Get started
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const counts = await queryOne<CountsRow>(
    `SELECT
        count(*) FILTER (WHERE playable)::int                               AS ready_count,
        count(*) FILTER (WHERE playable AND next_review_at <= now())::int   AS due_count,
        count(*) FILTER (WHERE status = 'pending')::int                     AS pending_count,
        count(*) FILTER (WHERE status = 'needs_input')::int                 AS needs_input_count,
        count(*)::int                                                       AS total_count
       FROM (
         SELECT status, next_review_at,
                status = 'ready'
                  AND coalesce(btrim(reading_kana), '') <> ''
                  AND coalesce(btrim(meaning_en), '') <> '' AS playable
           FROM vocabulary_items
          WHERE user_id = $1
       ) v`,
    [user.id]
  );

  return (
    <MatchGame
      stats={{
        xp: user.xp,
        streak: getDisplayStreak(user),
        dueCount: counts?.due_count ?? 0,
        readyCount: counts?.ready_count ?? 0,
        pendingCount: counts?.pending_count ?? 0,
        needsInputCount: counts?.needs_input_count ?? 0,
        totalCount: counts?.total_count ?? 0,
      }}
    />
  );
}
