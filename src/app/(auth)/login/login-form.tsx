"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { loginAction, type FormState } from "../actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4" noValidate>
      {state.error && <AlertBanner variant="danger"><AlertCircle />{state.error}</AlertBanner>}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Field id="email" label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field id="password" label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" disabled={pending} className="mt-2 w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
