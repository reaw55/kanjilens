"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteCapture } from "@/actions/capture";

export function DeleteCaptureButton({ captureId }: { captureId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            aria-label="Delete scan"
            disabled={isPending}
            onClick={() => {
                if (!window.confirm("Delete this scan and its photo? Words you added stay in your deck.")) return;
                startTransition(async () => {
                    const res = await deleteCapture(captureId);
                    if ("error" in res) {
                        window.alert(res.error);
                        return;
                    }
                    router.refresh();
                });
            }}
            className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
            <span className={`material-symbols-rounded text-xl ${isPending ? "animate-spin" : ""}`}>
                {isPending ? "progress_activity" : "delete"}
            </span>
        </button>
    );
}
