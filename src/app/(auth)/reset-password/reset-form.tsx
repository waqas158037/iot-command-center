"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { resetPasswordAction, type FormState } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4" noValidate>
      {state.error && <AlertBanner variant="danger"><AlertCircle />{state.error}</AlertBanner>}
      {state.success && <AlertBanner variant="success"><CheckCircle2 />{state.success}</AlertBanner>}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" error={state.fieldErrors?.password} help="At least 10 characters with letters and numbers."><Input name="password" type="password" autoComplete="new-password" /></Field>
      <Field id="confirm" label="Confirm password" error={state.fieldErrors?.confirm}><Input name="confirm" type="password" autoComplete="new-password" /></Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Reset password"}</Button>
    </form>
  );
}
