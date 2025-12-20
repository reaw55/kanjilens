
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { HomeClient } from "@/components/home-client";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Landing Page for Non-Auth Users
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-900 text-zinc-50 relative overflow-hidden">

        {/* Simple Background */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-600/10 blur-[100px]" />

        <div className="relative z-10 text-center space-y-6 max-w-md">
          <h1 className="text-5xl font-bold tracking-tight headline-metallic mb-2">KanjiLens</h1>
          <p className="text-zinc-400 text-lg">
            Discover and learn Kanji from the real world around you.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link href="/login">
              <Button className="h-12 px-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg shadow-lg shadow-amber-500/20">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Auth User Data Fetching
  let stats = { xp: 0, streak: 0, level: 1 };
  let dueCount = 0;
  let capturesCount = 0;

  // 1. Fetch Profile Stats
  const { data: profile } = await supabase.from("profiles").select("xp, streak, level, last_active_at").eq("id", user.id).single();

  if (profile) {
    stats = profile;

    // STREAK LOGIC
    const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : new Date(0);
    const now = new Date();

    // Normalize to dates (no time)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate());

    // Calculate difference in days
    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let newStreak = stats.streak;
    let shouldUpdate = false;

    if (diffDays === 1) {
      // Login is consecutive day -> Increment
      newStreak += 1;
      shouldUpdate = true;
    } else if (diffDays > 1) {
      // Missed a day -> Reset
      // BUT if this is the very first login (diff big), start at 1
      newStreak = 1;
      shouldUpdate = true;
    } else if (diffDays === 0) {
      // Same day, do nothing usually
      // But if last_active_at was missing (first run), we might update
      if (!profile.last_active_at) shouldUpdate = true;
    }

    if (shouldUpdate) {
      // Update DB
      // Check if column exists by just trying to update it? 
      // We assume 'last_active_at' exists as we requested it.
      await supabase.from("profiles").update({
        streak: newStreak,
        last_active_at: new Date().toISOString()
      }).eq("id", user.id);

      stats.streak = newStreak;
    }
  }

  // 2. Fetch Due Vocabulary Count
  const { count: due } = await supabase
    .from("vocabulary_items")
    .select("*", { count: 'exact', head: true })
    .lte("next_review_at", new Date().toISOString())
    .eq("user_id", user.id);
  dueCount = due || 0;

  // 3. Fetch Captures Count (to decide map vs dashboard)
  const { count: caps } = await supabase
    .from("captures")
    .select("*", { count: 'exact', head: true })
    .eq("user_id", user.id);
  capturesCount = caps || 0;


  // Exponential Leveling Logic Calculation
  const calculateLevel = (xp: number) => Math.floor(0.1 * Math.sqrt(xp)) + 1;
  const getMinXPForLevel = (level: number) => 100 * Math.pow(level - 1, 2);
  const getUserProgress = (xp: number) => {
    const currentLevel = calculateLevel(xp);
    const nextLevel = currentLevel + 1;
    const minXP = getMinXPForLevel(currentLevel);
    const nextXP = getMinXPForLevel(nextLevel);
    const progress = xp - minXP;
    const range = nextXP - minXP;
    const percent = range === 0 ? 0 : (progress / range) * 100;
    return { currentLevel, nextXP, percent };
  };

  const calculatedStats = getUserProgress(stats.xp || 0);

  // Self-Healing
  if (stats.level !== calculatedStats.currentLevel) {
    await supabase.from("profiles").update({ level: calculatedStats.currentLevel }).eq("id", user.id);
    stats.level = calculatedStats.currentLevel;
  }

  const params = await searchParams;
  const initialMode = (params.mode as string) || (capturesCount > 0 ? 'map' : 'dashboard');

  return (
    <HomeClient
      user={user}
      profile={stats}
      stats={calculatedStats}
      dueCount={dueCount}
      capturesCount={capturesCount}
      initialMode={initialMode}
    />
  );
}
