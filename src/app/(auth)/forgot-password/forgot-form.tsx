"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AlertBanner } from "@/components/ui/alert-banner";
import { forgotPasswordAction, type FormState } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4" noValidate>
      {state.error && <AlertBanner variant="danger"><AlertCircle />{state.error}</AlertBanner>}
      {state.success && <AlertBanner variant="success"><CheckCircle2 />{state.success}</AlertBanner>}
      <Field id="email" label="Email" error={state.fieldErrors?.email}><Input name="email" type="email" autoComplete="email" /></Field>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
