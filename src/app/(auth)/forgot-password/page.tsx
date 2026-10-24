import Link from "next/link";
import { smtpConfigured } from "@/lib/env";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  const configured = smtpConfigured();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Reset password</h1>
      {configured ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a link that is valid for 30 minutes.</p>
          <ForgotForm />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Email delivery is not configured on this server, so self-service password reset is unavailable. A platform administrator can reset your password with <code className="rounded bg-muted px-1">npm run admin:reset-password</code>.
        </p>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Back to sign in</Link>
    </div>
  );
}
