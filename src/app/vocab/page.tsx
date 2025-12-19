
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function VocabPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const { data: vocab } = await supabase
        .from("vocabulary_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-50 p-4 pb-24">
            <h1 className="text-3xl font-bold mb-6 headline-metallic">Your Vocabulary</h1>

            <div className="grid gap-4">
                {vocab?.map((item) => (
                    <div key={item.id} className="bg-zinc-800 rounded-2xl p-5 ring-1 ring-white/5 hover:bg-zinc-700/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-3xl font-bold text-zinc-50">{item.kanji_word}</div>
                            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">Level {item.srs_level}</div>
                        </div>
                        <div className="text-amber-400 text-sm font-medium mb-1">{item.reading_kana}</div>
                        <div className="text-zinc-300 mb-4">{item.meaning_en}</div>

                        <div className="bg-zinc-900/50 p-3 rounded-xl border-l-2 border-amber-500/50">
                            <p className="text-zinc-200 text-sm italic">"{item.context_sentence_jp}"</p>
                            <p className="text-zinc-500 text-xs mt-1">{item.context_sentence_en}</p>
                        </div>
                    </div>
                ))}

                {(!vocab || vocab.length === 0) && (
                    <div className="text-center py-20 bg-zinc-800/20 rounded-3xl border border-zinc-800 border-dashed">
                        <p className="text-zinc-500">No words yet.</p>
                        <Link href="/" className="text-amber-400 font-medium mt-2 inline-block">Start Scanning</Link>
                    </div>
                )}
            </div>

            {/* Mobile Nav */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <nav className="flex items-center gap-1 p-2 rounded-2xl bg-zinc-900/80 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
                    <Link href="/">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-zinc-400">
                            <span className="material-symbols-rounded">home</span>
                        </div>
                    </Link>
                    <Link href="/vocab">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-amber-400">
                            <span className="material-symbols-rounded">school</span>
                        </div>
                    </Link>
                </nav>
            </div>
        </div>
    );
}
