import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isSignupOpen } from "@/lib/auth/signup";
import { safeRedirectPath } from "@/lib/validation";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · KanjiLens" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
    const params = await searchParams;
    const next = safeRedirectPath(Array.isArray(params.next) ? params.next[0] : params.next);

    if (await getCurrentUser()) redirect(next);

    const signupOpen = await isSignupOpen();

    return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center p-4 bg-zinc-900 text-zinc-50 relative overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-600/10 blur-[100px]" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-zinc-600/10 blur-[100px]" />
            <LoginForm next={next} signupOpen={signupOpen} />
        </div>
    );
}
