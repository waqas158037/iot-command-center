import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <div>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {token ? <ResetForm token={token} /> : <p className="mt-2 text-sm text-muted-foreground">This page needs the link from your reset email.</p>}
      <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Back to sign in</Link>
    </div>
  );
}
