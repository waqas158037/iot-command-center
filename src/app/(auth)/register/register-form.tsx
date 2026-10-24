"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { registerAction, type FormState } from "../actions";

export function RegisterForm({ invite }: { invite?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-6 grid gap-4" noValidate>
      {state.error && <AlertBanner variant="danger"><AlertCircle />{state.error}</AlertBanner>}
      {state.success && <AlertBanner variant="success"><CheckCircle2 />{state.success}</AlertBanner>}
      {invite && <input type="hidden" name="invite" value={invite} />}
      <Field id="name" label="Full name" error={fe.name}><Input name="name" autoComplete="name" /></Field>
      <Field id="email" label="Email" error={fe.email}><Input name="email" type="email" autoComplete="email" /></Field>
      <Field id="password" label="Password" error={fe.password} help="At least 10 characters with letters and numbers."><Input name="password" type="password" autoComplete="new-password" /></Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create account"}</Button>
    </form>
  );
}
