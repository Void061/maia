"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, Notice, TextLink } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const send = useMutation({
    mutationFn: () => api("/auth/forgot-password", { method: "POST", body: { email } }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Password dimenticata</h1>
      <p className="mt-3 text-center text-lg text-muted">
        Scrivi l&apos;email del tuo account: ti mandiamo un link per sceglierne una nuova.
      </p>
      <div className="mt-8">
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
      </div>
      {send.isSuccess && (
        <div className="mt-4">
          <Notice tone="ok">Se l&apos;email è registrata, il link è in arrivo. Vale 1 ora.</Notice>
        </div>
      )}
      {send.error && (
        <div className="mt-4">
          <Notice>{send.error.message}</Notice>
        </div>
      )}
      <Button type="submit" disabled={send.isPending} className="mt-6 w-full">
        {send.isPending ? "Invio…" : "Mandami il link"}
      </Button>
      <p className="mt-8 text-center text-muted">
        <TextLink href="/login">Torna al login</TextLink>
      </p>
    </form>
  );
}
