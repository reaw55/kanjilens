import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/openai";
import { listVocab } from "@/actions/vocab";
import { VocabList } from "@/components/vocab-list";
import { AddWordForm } from "@/components/add-word-form";
import { StarterDeckButton } from "@/components/vocab/starter-deck-button";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = { title: "Vocabulary · KanjiLens" };

export default async function VocabPage() {
    await requireUser();
    const items = await listVocab();
    const aiEnabled = isAiEnabled();
    const playable = items.filter((i) => i.status === "ready" && i.reading_kana && i.meaning_en).length;

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-50 px-4 pt-6 pb-32">
            <div className="max-w-2xl mx-auto">
                <header className="flex items-end justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-bold headline-metallic">Your Vocabulary</h1>
                        <p className="text-sm text-zinc-400 mt-1">
                            {items.length} word{items.length === 1 ? "" : "s"} · {playable} ready to play
                        </p>
                    </div>
                    {items.length > 0 && <StarterDeckButton compact />}
                </header>

                <AddWordForm aiEnabled={aiEnabled} />

                <VocabList items={items} aiEnabled={aiEnabled} />
            </div>

            <BottomNav />
        </div>
    );
}
