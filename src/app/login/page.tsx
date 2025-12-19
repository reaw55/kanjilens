
"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function LoginPage() {
    const { signIn, signUp, isLoading, error } = useAuth();
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSignUp) {
            signUp(email, password);
        } else {
            signIn(email, password);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-900 text-zinc-50 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[100px]" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-600/10 blur-[100px]" />

            <div className="w-full max-w-md space-y-8 relative z-10 p-8 rounded-2xl bg-zinc-800/50 ring-1 ring-white/5 backdrop-blur-xl reveal-up">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-bold tracking-tight headline-metallic">
                        KanjiLens
                    </h1>
                    <p className="text-zinc-400">
                        {isSignUp ? "Create an account to get started" : "Sign in to sync your progress"}
                    </p>
                </div>

                {error && (
                    <div className="p-3 text-sm text-red-500 bg-red-500/10 rounded-lg">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            type="email"
                            placeholder="Email"
                            className="input-premium"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                        <Input
                            type="password"
                            placeholder="Password"
                            className="input-premium"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
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
                        {isLoading
                            ? "Processing..."
                            : isSignUp
                                ? "Create Account"
                                : "Sign In"}
                    </Button>
                </form>

                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-sm text-zinc-400 hover:text-amber-500 transition-colors"
                        disabled={isLoading}
                    >
                        {isSignUp
                            ? "Already have an account? Sign In"
                            : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
}
