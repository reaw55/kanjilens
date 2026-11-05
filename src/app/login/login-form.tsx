"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next, signupOpen }: { next: string; signupOpen: boolean }) {
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [signInState, signInAction, signingIn] = useActionState<FormState, FormData>(signIn, undefined);
    const [signUpState, signUpAction, signingUp] = useActionState<FormState, FormData>(signUp, undefined);

    const isSignUp = mode === "signup";
    const pending = signingIn || signingUp;
    const error = isSignUp ? signUpState?.error : signInState?.error;

    return (
        <div className="w-full max-w-md space-y-8 relative z-10 p-8 rounded-2xl bg-zinc-800/50 ring-1 ring-white/5 backdrop-blur-xl">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold tracking-tight headline-metallic">KanjiLens</h1>
                <p className="text-zinc-400">
                    {isSignUp ? "Create your account" : "Sign in to keep your streak going"}
                </p>
            </div>

            {error && (
                <div role="alert" className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg">
                    {error}
                </div>
            )}

            <form action={isSignUp ? signUpAction : signInAction} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <div className="space-y-2">
                    <label className="sr-only" htmlFor="email">Email</label>
                    <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="Email"
                        className="input-premium h-11"
                        required
                        disabled={pending}
                    />
                    <label className="sr-only" htmlFor="password">Password</label>
                    <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        placeholder="Password"
                        className="input-premium h-11"
                        required
                        minLength={isSignUp ? 8 : undefined}
                        disabled={pending}
                    />
                    {isSignUp && (
                        <>
                            <label className="sr-only" htmlFor="confirmPassword">Confirm password</label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Confirm password"
                                className="input-premium h-11"
                                required
                                minLength={8}
                                disabled={pending}
                            />
                        </>
                    )}
                </div>

                <Button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                    disabled={pending}
                >
                    {pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}
                </Button>
            </form>

            <div className="text-center space-y-3 text-sm">
                {signupOpen ? (
                    <button
                        type="button"
                        onClick={() => setMode(isSignUp ? "signin" : "signup")}
                        className="text-zinc-400 hover:text-amber-500 transition-colors"
                        disabled={pending}
                    >
                        {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
                    </button>
                ) : (
                    <p className="text-zinc-500 text-xs">Sign-up is closed on this server.</p>
                )}
                {!isSignUp && (
                    <p className="text-zinc-600 text-xs">
                        Forgot your password? Ask whoever runs this server to reset it.
                    </p>
                )}
            </div>
        </div>
    );
}
