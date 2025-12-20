import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { FlashcardDeck } from "@/components/flashcard-deck";
import { BottomNav } from "@/components/bottom-nav";

export default async function FlashcardsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return redirect("/login");

    // Fetch all user vocabulary
    const { data: vocab } = await supabase
        .from("vocabulary_items")
        .select("id, kanji_word, reading_kana, meaning_en")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    return (
        <div className="min-h-screen bg-black flex flex-col pb-24 relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 p-6 flex items-center justify-center">
                <h1 className="text-xl font-bold text-zinc-400 flex items-center gap-2">
                    <span className="material-symbols-rounded text-amber-500">style</span>
                    Flashcard Review
                </h1>
            </div>

            {/* Deck */}
            <main className="flex-1 flex flex-col justify-center px-4 relative z-10">
                <FlashcardDeck items={vocab || []} />
            </main>

            <BottomNav />
        </div>
    );
}
