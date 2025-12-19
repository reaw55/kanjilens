
"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import Link from "next/link";

export default function UpdatePasswordPage() {
    const { updatePassword, isLoading, error } = useAuth();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (password !== confirmPassword) {
            setLocalError("Passwords do not match");
            return;
        }

        if (password.length < 6) {
            setLocalError("Password must be at least 6 characters");
            return;
        }

        await updatePassword(password);
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-900 text-zinc-50 relative overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[100px]" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-600/10 blur-[100px]" />

            <div className="w-full max-w-md space-y-8 relative z-10 p-8 rounded-2xl bg-zinc-800/50 ring-1 ring-white/5 backdrop-blur-xl reveal-up">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight headline-metallic">
                        Set New Password
                    </h1>
                    <p className="text-zinc-400 text-sm">
                        Enter your new password below to update your account access.
                    </p>
                </div>

                {(error || localError) && (
                    <div className="p-3 text-sm text-red-500 bg-red-500/10 rounded-lg">
                        {error || localError}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            type="password"
                            placeholder="New Password"
                            className="input-premium"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            disabled={isLoading}
                        />
                        <Input
                            type="password"
                            placeholder="Confirm New Password"
                            className="input-premium"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            disabled={isLoading}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all font-medium"
                        disabled={isLoading}
                    >
                        {isLoading ? "Updating..." : "Update Password"}
                    </Button>
                </form>

                <div className="text-center">
                    <Link href="/login" className="text-xs text-zinc-500 hover:text-amber-500 transition-colors">
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
