import Link from "next/link";
import { env } from "@/lib/env";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;
  if (!env().ENABLE_REGISTRATION && !invite) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Registration disabled</h1>
        <p className="mt-2 text-sm text-muted-foreground">Accounts are created by invitation. Ask a platform administrator to invite you.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold">{invite ? "Accept invitation" : "Create account"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{invite ? "Use the email address the invitation was sent to." : "New accounts start with read-only access."}</p>
      <RegisterForm invite={invite} />
      <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Already have an account? Sign in</Link>
    </div>
  );
}
