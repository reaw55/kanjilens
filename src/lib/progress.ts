/** Level curve: level n starts at 100·(n−1)² XP. */
export function getLevelProgress(xp: number) {
    const level = Math.floor(0.1 * Math.sqrt(Math.max(0, xp))) + 1;
    const minXp = 100 * (level - 1) ** 2;
    const nextXp = 100 * level ** 2;
    const percent = Math.min(100, Math.max(0, ((xp - minXp) / (nextXp - minXp)) * 100));
    return { level, minXp, nextXp, percent };
}

/** A streak only counts if the user studied today or yesterday (dates are server-local, YYYY-MM-DD). */
export function getDisplayStreak(user: { streak: number; last_active_on: string | null }, today = new Date()): number {
    if (!user.last_active_on) return 0;
    const last = new Date(`${user.last_active_on}T00:00:00Z`).getTime();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const days = Math.round((todayUtc - last) / 86_400_000);
    return days <= 1 ? user.streak : 0;
}
