import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const sp = await searchParams;
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/dashboard";
  return (
    <div>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use your IoT Command Center account.</p>
      {sp.reset && <p role="status" className="mt-4 rounded-md border border-success/30 bg-success/8 p-3 text-sm">Your password was changed. Sign in with the new password.</p>}
      {sp.registered && <p role="status" className="mt-4 rounded-md border border-success/30 bg-success/8 p-3 text-sm">Account created. You can sign in now.</p>}
      <LoginForm callbackUrl={callbackUrl} />
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
        {env().ENABLE_REGISTRATION && <Link href="/register" className="text-primary hover:underline">Create account</Link>}
      </div>
    </div>
  );
}
