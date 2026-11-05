"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { startRound, submitRound, type RoundCard, type RoundMode, type SubmitRoundResult } from "@/actions/review";
import { addStarterDeck, processPendingVocab } from "@/actions/vocab";
import { BottomNav } from "@/components/bottom-nav";
import { getLevelProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export type GameStats = {
    xp: number;
    streak: number;
    dueCount: number;
    readyCount: number;
    pendingCount: number;
    needsInputCount: number;
    totalCount: number;
    weakCount: number;
};

type Kind = "reading" | "meaning";
type Tile = { key: string; kind: Kind; text: string };
type SlotId = string; // `${cardId}:${kind}`
type Feedback = { ok: boolean; n: number };

type Phase =
    | { name: "idle" }
    | { name: "loading" }
    | { name: "playing"; roundId: string; cards: RoundCard[] }
    | { name: "submitting"; cards: RoundCard[] }
    | { name: "done"; cards: RoundCard[]; result: Extract<SubmitRoundResult, { ok: true }>; mistakes: Record<string, number> }
    | { name: "error"; message: string };

const slotId = (cardId: string, kind: Kind): SlotId => `${cardId}:${kind}`;

function shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildTray(cards: RoundCard[]): Tile[] {
    const readings = shuffle(cards.map((c, i) => ({ key: `r${i}`, kind: "reading" as const, text: c.reading })));
    const meanings = shuffle(cards.map((c, i) => ({ key: `m${i}`, kind: "meaning" as const, text: c.meaning })));
    return [...readings, ...meanings];
}

/** Viewport point from a mouse, pointer or touch event. */
function eventPoint(e: MouseEvent | TouchEvent | PointerEvent): { x: number; y: number } | null {
    if ("changedTouches" in e && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    if ("clientX" in e) return { x: e.clientX, y: e.clientY };
    return null;
}

/** The drop slot under a viewport point, if any. */
function slotAtPoint(p: { x: number; y: number } | null): SlotId | null {
    if (!p) return null;
    for (const el of document.elementsFromPoint(p.x, p.y)) {
        const id = (el as HTMLElement).dataset?.slot;
        if (id) return id;
    }
    return null;
}

function kanjiSize(word: string) {
    if (word.length <= 2) return "text-3xl";
    if (word.length === 3) return "text-2xl";
    return "text-xl";
}

export function MatchGame({ stats }: { stats: GameStats }) {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>({ name: "idle" });

    // Round state
    const [tray, setTray] = useState<Tile[]>([]);
    const [placed, setPlaced] = useState<Record<SlotId, string>>({});
    const [mistakes, setMistakes] = useState<Record<string, number>>({});
    const [selected, setSelected] = useState<string | null>(null);
    const [hoverSlot, setHoverSlot] = useState<SlotId | null>(null);
    const [feedback, setFeedback] = useState<Record<SlotId, Feedback>>({});
    const [announcement, setAnnouncement] = useState("");
    const [combo, setCombo] = useState(0);
    const [mode, setMode] = useState<RoundMode>("review");

    const [starterPending, startStarter] = useTransition();
    const [starterMessage, setStarterMessage] = useState<string | null>(null);

    // Words added from a scan are filled in by the AI in the background; nudge it along.
    const nudged = useRef(false);
    useEffect(() => {
        if (stats.pendingCount > 0 && !nudged.current) {
            nudged.current = true;
            processPendingVocab()
                .then(() => router.refresh())
                .catch(() => {});
        }
    }, [stats.pendingCount, router]);

    const progress = getLevelProgress(stats.xp);
    const canPlay = stats.readyCount >= 2;

    async function beginRound(nextMode: RoundMode = mode) {
        setMode(nextMode);
        setPhase({ name: "loading" });
        try {
            const res = await startRound(nextMode);
            if (!res.ok) {
                setPhase({
                    name: "error",
                    message:
                        res.reason === "rate_limited"
                            ? "That's a lot of rounds! Take a short break and try again."
                            : "You need at least 2 words with a reading and meaning to play.",
                });
                return;
            }
            setTray(buildTray(res.cards));
            setPlaced({});
            setMistakes({});
            setSelected(null);
            setFeedback({});
            setCombo(0);
            setAnnouncement(`New round: ${res.cards.length} kanji. Match each reading and meaning.`);
            setPhase({ name: "playing", roundId: res.roundId, cards: res.cards });
        } catch {
            setPhase({ name: "error", message: "Couldn't start a round. Check your connection and try again." });
        }
    }

    async function finishRound(roundId: string, cards: RoundCard[], finalMistakes: Record<string, number>) {
        setPhase({ name: "submitting", cards });
        try {
            const result = await submitRound(
                roundId,
                cards.map((c) => ({ id: c.id, mistakes: finalMistakes[c.id] ?? 0 }))
            );
            if (!result.ok) {
                setPhase({ name: "error", message: result.error });
                return;
            }
            setAnnouncement(`Round complete. You earned ${result.xpGained} XP.`);
            setPhase({ name: "done", cards, result, mistakes: finalMistakes });
        } catch {
            setPhase({ name: "error", message: "Couldn't save your round. Your progress for it was not recorded." });
        }
    }

    function flash(slot: SlotId, ok: boolean) {
        setFeedback((prev) => ({ ...prev, [slot]: { ok, n: (prev[slot]?.n ?? 0) + 1 } }));
    }

    function attemptPlace(tile: Tile, slot: SlotId) {
        if (phase.name !== "playing") return;
        const [cardId, kind] = slot.split(":") as [string, Kind];
        const card = phase.cards.find((c) => c.id === cardId);
        if (!card || placed[slot]) return;
        setSelected(null);

        if (tile.kind !== kind) {
            flash(slot, false);
            setAnnouncement(`That tile is a ${tile.kind}. Drop it on a ${tile.kind} slot.`);
            return;
        }

        const expected = kind === "reading" ? card.reading : card.meaning;
        if (tile.text !== expected) {
            const nextMistakes = { ...mistakes, [card.id]: (mistakes[card.id] ?? 0) + 1 };
            setMistakes(nextMistakes);
            setCombo(0);
            flash(slot, false);
            setAnnouncement(`Not quite. ${tile.text} doesn't go with ${card.kanji}.`);
            return;
        }

        const nextPlaced = { ...placed, [slot]: tile.text };
        setPlaced(nextPlaced);
        setTray((prev) => prev.filter((t) => t.key !== tile.key));
        flash(slot, true);
        const nextCombo = combo + 1;
        setCombo(nextCombo);
        setAnnouncement(`Correct! ${card.kanji}: ${tile.text}.${nextCombo >= 2 ? ` ${nextCombo} in a row!` : ""}`);

        if (Object.keys(nextPlaced).length === phase.cards.length * 2) {
            // Small pause so the last tile visibly lands before the results screen.
            const { roundId, cards } = phase;
            setTimeout(() => finishRound(roundId, cards, mistakes), 450);
        }
    }

    function onSlotActivate(slot: SlotId) {
        const tile = tray.find((t) => t.key === selected);
        if (!tile) {
            setAnnouncement("Pick a reading or meaning tile first, then choose where it goes.");
            return;
        }
        attemptPlace(tile, slot);
    }

    function addStarter() {
        setStarterMessage(null);
        startStarter(async () => {
            const res = await addStarterDeck();
            setStarterMessage(res.ok ? (res.message ?? "Starter deck added.") : res.error);
            router.refresh();
        });
    }

    // ---------- Playing ----------
    if (phase.name === "playing" || phase.name === "submitting") {
        const cards = phase.cards;
        const selectedTile = tray.find((t) => t.key === selected) ?? null;
        const filled = Object.keys(placed).length;
        const totalMistakes = Object.values(mistakes).reduce((a, b) => a + b, 0);

        return (
            <div className="min-h-[100dvh] flex flex-col bg-zinc-950 text-zinc-50">
                <p className="sr-only" aria-live="polite">{announcement}</p>

                {/* Header */}
                <header className="max-w-md w-full mx-auto px-4 pt-5 pb-3 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setPhase({ name: "idle" })}
                        className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
                        aria-label="Quit round"
                    >
                        <span className="material-symbols-rounded" aria-hidden>close</span>
                    </button>
                    <div className="flex-1">
                        <div className="h-2 bg-zinc-900 rounded-full overflow-hidden" role="progressbar"
                            aria-valuemin={0} aria-valuemax={cards.length * 2} aria-valuenow={filled} aria-label="Round progress">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                                style={{ width: `${(filled / (cards.length * 2)) * 100}%` }} />
                        </div>
                    </div>
                    {combo >= 2 && (
                        <motion.div
                            key={combo}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300"
                            aria-hidden
                        >
                            ×{combo} combo
                        </motion.div>
                    )}
                    <div className={cn("text-xs font-mono px-2 py-1 rounded-full border",
                        totalMistakes ? "border-red-500/30 text-red-300 bg-red-500/10" : "border-zinc-800 text-zinc-500")}>
                        {totalMistakes} miss{totalMistakes === 1 ? "" : "es"}
                    </div>
                </header>

                {/* Board */}
                <main className="flex-1 max-w-md w-full mx-auto px-4 pb-4">
                    <ol className="space-y-2.5">
                        {cards.map((card) => {
                            const complete = placed[slotId(card.id, "reading")] && placed[slotId(card.id, "meaning")];
                            return (
                                <li
                                    key={card.id}
                                    className={cn(
                                        "grid grid-cols-[auto_1fr_1.3fr] gap-2 p-2 rounded-2xl border transition-colors",
                                        complete ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/60"
                                    )}
                                >
                                    <div
                                        lang="ja"
                                        className={cn(
                                            "min-w-[3.5rem] px-2 rounded-xl bg-zinc-950 flex items-center justify-center font-bold",
                                            kanjiSize(card.kanji),
                                            complete ? "text-emerald-300" : "text-white"
                                        )}
                                    >
                                        {card.kanji}
                                    </div>
                                    {(["reading", "meaning"] as const).map((kind) => {
                                        const id = slotId(card.id, kind);
                                        return (
                                            <DropSlot
                                                key={id}
                                                id={id}
                                                kind={kind}
                                                kanji={card.kanji}
                                                value={placed[id]}
                                                hovered={hoverSlot === id}
                                                armed={!!selectedTile && selectedTile.kind === kind && !placed[id]}
                                                feedback={feedback[id]}
                                                onActivate={() => onSlotActivate(id)}
                                            />
                                        );
                                    })}
                                </li>
                            );
                        })}
                    </ol>
                </main>

                {/* Tray */}
                <section
                    aria-label="Tiles"
                    className="sticky bottom-0 z-40 border-t border-white/10 bg-zinc-900/95 backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
                >
                    <div className="max-w-md mx-auto px-4 pt-3 space-y-3">
                        {phase.name === "submitting" ? (
                            <div className="py-6 text-center text-zinc-400 text-sm flex items-center justify-center gap-2">
                                <span className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                Saving your round…
                            </div>
                        ) : (
                            <>
                                {(["reading", "meaning"] as const).map((kind) => {
                                    const tiles = tray.filter((t) => t.kind === kind);
                                    if (tiles.length === 0) return null;
                                    return (
                                        <div key={kind}>
                                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                                                {kind === "reading" ? "Readings" : "Meanings"}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {tiles.map((tile) => (
                                                    <DraggableTile
                                                        key={tile.key}
                                                        tile={tile}
                                                        selected={selected === tile.key}
                                                        onPick={() => setSelected(selected === tile.key ? null : tile.key)}
                                                        onHover={setHoverSlot}
                                                        onDrop={(slot) => attemptPlace(tile, slot)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                <p className="text-[11px] text-zinc-500 text-center pb-1">
                                    Drag tiles onto their kanji — or tap a tile, then tap a slot.
                                </p>
                            </>
                        )}
                    </div>
                </section>
            </div>
        );
    }

    // ---------- Results ----------
    if (phase.name === "done") {
        const { result, cards } = phase;
        const perfect = result.perfectBonus > 0;
        const byId = new Map(result.results.map((r) => [r.id, r]));
        return (
            <div className="min-h-[100dvh] bg-zinc-950 text-zinc-50 px-4 pt-10 pb-36">
                <p className="sr-only" aria-live="polite">{announcement}</p>
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md mx-auto space-y-6"
                >
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/20">
                            <span className="material-symbols-rounded text-4xl text-zinc-950" aria-hidden>
                                {perfect ? "emoji_events" : "task_alt"}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold">{perfect ? "Perfect round!" : "Round complete"}</h1>
                        <div className="text-4xl font-black text-amber-400">+{result.xpGained} XP</div>
                        <div className="text-sm text-zinc-400 flex items-center justify-center gap-3">
                            {perfect && <span>includes +{result.perfectBonus} perfect bonus</span>}
                            <span className="inline-flex items-center gap-1 text-orange-400">
                                <span className="material-symbols-rounded text-base" aria-hidden>local_fire_department</span>
                                {result.streak} day streak
                            </span>
                        </div>
                    </div>

                    <ul className="space-y-2">
                        {cards.map((card) => {
                            const r = byId.get(card.id);
                            const correct = r?.correct ?? false;
                            return (
                                <li key={card.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                                    <div lang="ja" className="text-2xl font-bold min-w-[3rem] text-center">{card.kanji}</div>
                                    <div className="flex-1 min-w-0">
                                        <div lang="ja" className="text-amber-400 text-sm truncate">{card.reading}</div>
                                        <div className="text-zinc-300 text-sm truncate">{card.meaning}</div>
                                    </div>
                                    <div className="text-right">
                                        <span className={cn("material-symbols-rounded", correct ? "text-emerald-400" : "text-red-400")} aria-hidden>
                                            {correct ? "check_circle" : "replay"}
                                        </span>
                                        <div className="text-[10px] text-zinc-500">
                                            {correct ? `Lv ${r?.level ?? 0}` : `${phase.mistakes[card.id] ?? 0} miss`}
                                        </div>
                                        <span className="sr-only">{correct ? "Correct first try" : "Missed; will come back soon"}</span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setPhase({ name: "idle" })}
                            className="h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-semibold transition-colors"
                        >
                            Done
                        </button>
                        <button
                            type="button"
                            onClick={() => beginRound()}
                            className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors"
                        >
                            Next round
                        </button>
                    </div>
                </motion.div>
                <BottomNav />
            </div>
        );
    }

    // ---------- Hub (idle / loading / error) ----------
    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-zinc-50 px-4 pt-6 pb-36 relative overflow-hidden">
            <div className="absolute top-[-15%] right-[-20%] w-[420px] h-[420px] rounded-full bg-amber-600/10 blur-[100px] pointer-events-none" />
            <div className="max-w-md mx-auto space-y-5 relative">
                {/* Stats bar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-zinc-900/80 rounded-2xl p-2.5 pr-4 border border-zinc-800">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-zinc-950">
                            {progress.level}
                        </div>
                        <div>
                            <div className="text-xs text-zinc-400">{stats.xp.toLocaleString()} XP</div>
                            <div className="w-24 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress.percent}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 bg-zinc-900/80 rounded-2xl px-3 py-2 border border-zinc-800" title="Day streak">
                        <span className="material-symbols-rounded text-orange-500" aria-hidden>local_fire_department</span>
                        <span className="font-bold">{stats.streak}</span>
                        <span className="sr-only">day streak</span>
                    </div>
                </div>

                {/* Hero */}
                <section className="bg-zinc-900/90 rounded-3xl p-6 border border-zinc-800 shadow-2xl space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold">Match the kanji</h1>
                        <p className="text-zinc-400 text-sm mt-1">
                            Drag each reading and meaning onto the right kanji. First-try matches move up your review schedule.
                        </p>
                    </div>

                    <DemoRow />

                    <div className="flex items-end justify-between">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Due now</div>
                            <div className="text-4xl font-bold">
                                {stats.dueCount}
                                <span className="text-base text-zinc-500 font-medium"> / {stats.readyCount} words</span>
                            </div>
                        </div>
                    </div>

                    {phase.name === "error" && (
                        <div role="alert" className="p-3 text-sm text-red-300 bg-red-500/10 rounded-xl">{phase.message}</div>
                    )}

                    {canPlay ? (
                        <button
                            type="button"
                            onClick={() => beginRound()}
                            disabled={phase.name === "loading"}
                            className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-colors disabled:opacity-60"
                        >
                            {phase.name === "loading" ? (
                                <span className="h-5 w-5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <span className="material-symbols-rounded" aria-hidden>play_arrow</span>
                            )}
                            {stats.dueCount > 0 ? "Start review" : "Practice anyway"}
                        </button>
                    ) : null}
                    {canPlay && stats.weakCount >= 2 && (
                        <button
                            type="button"
                            onClick={() => beginRound("weak")}
                            disabled={phase.name === "loading"}
                            className="w-full h-12 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-red-500/20 text-zinc-100 font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                        >
                            <span className="material-symbols-rounded text-red-300" aria-hidden>target</span>
                            Practice weak words
                            <span className="text-xs text-zinc-400 font-normal">({stats.weakCount})</span>
                        </button>
                    )}
                    {!canPlay && (
                        <div className="space-y-3">
                            <p className="text-sm text-zinc-300">
                                You need at least 2 words with a reading and meaning. Start with a starter deck, or add your own.
                            </p>
                            <button
                                type="button"
                                onClick={addStarter}
                                disabled={starterPending}
                                className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold disabled:opacity-60 transition-colors"
                            >
                                {starterPending ? "Adding…" : "Add JLPT N5 starter deck"}
                            </button>
                            <div className="grid grid-cols-2 gap-3">
                                <Link href="/scan" className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold flex items-center justify-center gap-1.5">
                                    <span className="material-symbols-rounded text-lg" aria-hidden>photo_camera</span> Scan
                                </Link>
                                <Link href="/vocab" className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold flex items-center justify-center gap-1.5">
                                    <span className="material-symbols-rounded text-lg" aria-hidden>add</span> Add word
                                </Link>
                            </div>
                        </div>
                    )}
                    {starterMessage && <p role="status" className="text-sm text-emerald-300">{starterMessage}</p>}
                </section>

                {(stats.pendingCount > 0 || stats.needsInputCount > 0) && (
                    <section className="space-y-2">
                        {stats.pendingCount > 0 && (
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-sm text-zinc-300">
                                <span className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                {stats.pendingCount} new word{stats.pendingCount === 1 ? " is" : "s are"} being prepared
                            </div>
                        )}
                        {stats.needsInputCount > 0 && (
                            <Link href="/vocab" className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/80 border border-amber-500/20 text-sm text-amber-200 hover:bg-zinc-900">
                                <span className="material-symbols-rounded text-amber-500" aria-hidden>edit_note</span>
                                <span className="flex-1">
                                    {stats.needsInputCount} word{stats.needsInputCount === 1 ? " needs" : "s need"} a reading and meaning before you can play {stats.needsInputCount === 1 ? "it" : "them"}
                                </span>
                                <span className="material-symbols-rounded text-zinc-500" aria-hidden>chevron_right</span>
                            </Link>
                        )}
                    </section>
                )}
            </div>
            <BottomNav />
        </div>
    );
}

function DropSlot({
    id,
    kind,
    kanji,
    value,
    hovered,
    armed,
    feedback,
    onActivate,
}: {
    id: SlotId;
    kind: Kind;
    kanji: string;
    value: string | undefined;
    hovered: boolean;
    armed: boolean;
    feedback: Feedback | undefined;
    onActivate: () => void;
}) {
    const filled = value !== undefined;
    return (
        <button
            type="button"
            data-slot={filled ? undefined : id}
            onClick={onActivate}
            disabled={filled}
            aria-label={filled ? `${kanji} ${kind}: ${value}` : `${kind} slot for ${kanji}`}
            className={cn(
                "relative min-h-[3.5rem] rounded-xl border-2 text-left transition-colors",
                filled
                    ? "border-transparent bg-zinc-950/60"
                    : hovered
                      ? "border-amber-400 bg-amber-500/15"
                      : armed
                        ? "border-amber-500/60 border-dashed bg-amber-500/5"
                        : "border-zinc-700 border-dashed bg-zinc-950/40 hover:border-zinc-500"
            )}
        >
            <div
                key={feedback?.n ?? 0}
                className={cn(
                    "h-full w-full px-2.5 py-1.5 flex flex-col justify-center rounded-[10px]",
                    feedback && (feedback.ok ? "kl-pop" : "kl-shake")
                )}
            >
                {filled ? (
                    <span
                        lang={kind === "reading" ? "ja" : undefined}
                        className={cn("text-sm font-semibold leading-tight line-clamp-2", kind === "reading" ? "text-amber-300" : "text-sky-200")}
                    >
                        {value}
                    </span>
                ) : (
                    <span className="text-[10px] uppercase tracking-widest text-zinc-600">{kind}</span>
                )}
            </div>
        </button>
    );
}

function DraggableTile({
    tile,
    selected,
    onPick,
    onHover,
    onDrop,
}: {
    tile: Tile;
    selected: boolean;
    onPick: () => void;
    onHover: (slot: SlotId | null) => void;
    onDrop: (slot: SlotId) => void;
}) {
    const dragged = useRef(false);
    const lastHover = useRef<SlotId | null>(null);

    const setHover = (slot: SlotId | null) => {
        if (lastHover.current !== slot) {
            lastHover.current = slot;
            onHover(slot);
        }
    };

    return (
        <motion.button
            type="button"
            drag
            dragSnapToOrigin
            dragMomentum={false}
            whileDrag={{ scale: 1.08, zIndex: 60 }}
            onPointerDown={() => {
                dragged.current = false;
            }}
            onDragStart={() => {
                dragged.current = true;
            }}
            onDrag={(e) => setHover(slotAtPoint(eventPoint(e)))}
            onDragEnd={(e) => {
                const slot = slotAtPoint(eventPoint(e));
                setHover(null);
                if (slot) onDrop(slot);
            }}
            onClick={() => {
                if (!dragged.current) onPick();
            }}
            aria-pressed={selected}
            aria-label={`${tile.kind}: ${tile.text}`}
            lang={tile.kind === "reading" ? "ja" : undefined}
            className={cn(
                "relative touch-none select-none cursor-grab active:cursor-grabbing max-w-full px-3.5 py-2 rounded-xl border text-sm font-semibold shadow-lg",
                tile.kind === "reading"
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                    : "bg-sky-500/10 border-sky-500/40 text-sky-100",
                selected && "ring-2 ring-white/80 ring-offset-2 ring-offset-zinc-900"
            )}
        >
            {tile.text}
        </motion.button>
    );
}

/** Static illustration of the mechanic for the hub card. */
function DemoRow() {
    return (
        <div className="grid grid-cols-[auto_1fr_1.3fr] gap-2 p-2 rounded-2xl border border-zinc-800 bg-zinc-950/50" aria-hidden>
            <div lang="ja" className="min-w-[3.5rem] px-2 rounded-xl bg-zinc-900 flex items-center justify-center text-3xl font-bold">水</div>
            <div className="min-h-[3.5rem] rounded-xl bg-zinc-900/80 px-2.5 flex items-center text-sm font-semibold text-amber-300">みず</div>
            <div className="min-h-[3.5rem] rounded-xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 px-2.5 flex items-center justify-center">
                <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/40 text-sky-100 text-xs font-semibold -rotate-6 shadow-lg">water</span>
            </div>
        </div>
    );
}
