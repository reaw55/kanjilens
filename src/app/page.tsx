
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CameraCapture } from "@/components/camera-capture";
import { RecentCapturesList } from "@/components/recent-captures";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch Stats if user exists
  let stats = { xp: 0, streak: 0, level: 1 };
  let dueCount = 0;

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("xp, streak, level").eq("id", user.id).single();
    if (profile) stats = profile;

    const { count } = await supabase
      .from("vocabulary_items")
      .select("*", { count: 'exact', head: true })
      .lte("next_review_at", new Date().toISOString())
      .eq("user_id", user.id);

    dueCount = count || 0;
  }

  return (
    <main className="min-h-screen pb-32 pt-8 px-4 bg-zinc-900 text-zinc-50 overflow-x-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 max-w-md mx-auto">
        <h1 className="text-2xl font-bold headline-metallic">KanjiLens</h1>
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-800 rounded-full px-3 py-1 border border-zinc-700">
              <span className="material-symbols-rounded text-amber-500 text-sm">bolt</span>
              <span className="text-xs font-bold font-mono text-zinc-300">{stats.streak}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-zinc-900 font-bold text-xs">
              {user.email?.[0].toUpperCase()}
            </div>
          </div>
        ) : (
          <Link href="/login"><Button variant="secondary" className="h-8 rounded-lg text-xs">Log In</Button></Link>
        )}
      </div>

      {/* Main Action: Camera */}
      <section className="mb-8 relative z-10">
        <CameraCapture />
      </section>

      {/* Dashboard Links */}
      {user && (
        <section className="max-w-md mx-auto grid grid-cols-2 gap-4 mb-8">
          {/* Review Card */}
          <Link href="/quiz" className="block group">
            <div className="bg-zinc-800 rounded-2xl p-5 border border-zinc-700/50 hover:border-amber-500/50 transition-all relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-rounded text-6xl">school</span>
              </div>

              <div className="relative z-10">
                <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Review</div>
                <div className="text-3xl font-bold text-zinc-100 flex items-baseline gap-1">
                  {dueCount} <span className="text-sm font-normal text-zinc-500">due</span>
                </div>
              </div>

              {dueCount > 0 && (
                <div className="absolute top-4 right-4 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
              )}
            </div>
          </Link>

          {/* Map Card */}
          <Link href="/map" className="block group">
            <div className="bg-zinc-800 rounded-2xl p-5 border border-zinc-700/50 hover:border-emerald-500/50 transition-all relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-rounded text-6xl">map</span>
              </div>

              <div className="relative z-10">
                <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Map</div>
                <div className="text-xl font-bold text-zinc-100 mt-1">
                  Explore
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Recent Activity */}
      {user && (
        <section className="max-w-md mx-auto mb-20">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-zinc-400 font-medium">Recent Discoveries</h3>
            <Link href="/map" className="text-xs text-amber-500 hover:text-amber-400">View All</Link>
          </div>

          <div className="space-y-3">
            <RecentCapturesList userId={user.id} />
          </div>
        </section>
      )}

      {/* Mobile Nav Island */}
      {user && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <nav className="nav-island">
            <Link href="/" className="h-10 w-10 flex items-center justify-center rounded-xl bg-zinc-800 text-amber-400 shadow-inner">
              <span className="material-symbols-rounded">home</span>
            </Link>
            <Link href="/map" className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-zinc-400 transition-colors">
              <span className="material-symbols-rounded">map</span>
            </Link>
            <Link href="/vocab" className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-zinc-400 transition-colors">
              <span className="material-symbols-rounded">book_2</span>
            </Link>
            <Link href="/quiz" className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-zinc-400 transition-colors">
              <span className="material-symbols-rounded md-icon">school</span>
            </Link>
            <div className="w-[1px] h-6 bg-zinc-700 mx-1 self-center"></div>
            <div className="h-10 w-10 flex items-center justify-center rounded-xl text-zinc-500">
              <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden relative">
                {/* User Avatar Placeholder */}
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-300">
                  {user.email?.[0].toUpperCase()}
                </div>
              </div>
            </div>
          </nav>
        </div>
      )}
    </main>
  );
}
