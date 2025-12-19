"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function AuthErrorContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");

    return (
        <div className="text-center space-y-4 max-w-md p-6 bg-zinc-800 rounded-2xl ring-1 ring-white/10">
            <h1 className="text-3xl font-bold text-red-400">Authentication Error</h1>
            <p className="text-zinc-400">
                {error || "Something went wrong during the authentication process."}
            </p>
            <div className="pt-4">
                <Link href="/login">
                    <Button className="w-full h-11 bg-zinc-700 hover:bg-zinc-600">
                        Try Again
                    </Button>
                </Link>
            </div>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <div className="flex h-screen flex-col items-center justify-center bg-zinc-900 text-zinc-50">
            <Suspense fallback={<div className="text-zinc-500">Loading error details...</div>}>
                <AuthErrorContent />
            </Suspense>
        </div>
    );
}
