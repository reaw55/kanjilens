"use client";

import { createClient } from "@/utils/supabase/client";
import { type Provider } from "@supabase/supabase-js";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function useAuth() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

    const signInWithGoogle = async () => {
        console.log("Attempting Google Sign-In...");
        setIsLoading(true);
        setError(null);
        try {
            const redirectUrl = `${window.location.origin}/auth/callback`;
            console.log("Redirect URL:", redirectUrl);

            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl,
                },
            });
            if (error) {
                console.error("Supabase OAuth Error:", error);
                throw error;
            }
            console.log("Google Sign-In initiated successfully");
        } catch (err: any) {
            console.error("Sign-In Exception:", err);
            setError(err.message);
            setIsLoading(false);
        }
    };

    const signUp = async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
            alert("Check your email to confirm your account!");
        } catch (err: any) {
            console.error("Sign-Up Exception:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const signIn = async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
            router.push("/");
            router.refresh();
        } catch (err: any) {
            console.error("Sign-In Exception:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    const resetPassword = async (email: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
            });
            if (error) throw error;
            alert("Password reset link sent to your email!");
            return true;
        } catch (err: any) {
            console.error("Reset Password Exception:", err);
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const updatePassword = async (password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            alert("Password updated successfully!");
            router.push("/");
            router.refresh();
            return true;
        } catch (err: any) {
            console.error("Update Password Exception:", err);
            setError(err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    return { signInWithGoogle, signUp, signIn, signOut, resetPassword, updatePassword, isLoading, error };
}
