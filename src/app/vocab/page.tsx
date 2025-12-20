
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VocabList } from "@/components/vocab-list";

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

            {/* Client Component handling list & interactions */}
            <VocabList items={vocab || []} />

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
