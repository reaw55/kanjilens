"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type FormState } from "@/actions/auth";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
    const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (state?.success) formRef.current?.reset();
    }, [state]);

    return (
        <form ref={formRef} action={action} className="space-y-3">
            {state?.error && (
                <div role="alert" className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg">{state.error}</div>
            )}
            {state?.success && (
                <div role="status" className="p-3 text-sm text-emerald-300 bg-emerald-500/10 rounded-lg">{state.success}</div>
            )}
            <label className="sr-only" htmlFor="currentPassword">Current password</label>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password"
                placeholder="Current password" className="input-premium h-11" required disabled={pending} />
            <label className="sr-only" htmlFor="newPassword">New password</label>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password"
                placeholder="New password (8+ characters)" className="input-premium h-11" required minLength={8} disabled={pending} />
            <label className="sr-only" htmlFor="confirmPassword">Confirm new password</label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
                placeholder="Confirm new password" className="input-premium h-11" required minLength={8} disabled={pending} />
            <button
                type="submit"
                disabled={pending}
                className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold disabled:opacity-60 transition-colors"
            >
                {pending ? "Updating…" : "Update password"}
            </button>
        </form>
    );
}
