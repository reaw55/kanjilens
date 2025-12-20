import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VocabList } from "@/components/vocab-list";
import { BottomNav } from "@/components/bottom-nav";

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
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold headline-metallic">Your Vocabulary</h1>

            </div>

            {/* Client Component handling list & interactions */}
            <VocabList items={vocab || []} />

            {/* Mobile Nav */}
            <BottomNav />
        </div>
    );
}
