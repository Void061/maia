"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { usePendingEmail } from "@/lib/session";

// "Rimanda l'email": uses the address typed at sign-up/login on this device,
// or asks for it when there is none (e.g. the page was opened directly).
export default function ResendEmail() {
  const stored = usePendingEmail();
  const [typed, setEmail] = useState<string | null>(null);
  const email = typed ?? stored;
  const resend = useMutation({
    mutationFn: () => api("/auth/resend-verification", { method: "POST", body: { email } }),
  });

  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        resend.mutate();
      }}
    >
      <Field label="Email" name="email" type="email" value={email} onChange={setEmail} required />
      {resend.isSuccess && (
        <Notice tone="ok">Fatto: se l&apos;account aspetta la conferma, il link è di nuovo in arrivo.</Notice>
      )}
      {resend.error && <Notice>{resend.error.message}</Notice>}
      <Button type="submit" disabled={resend.isPending}>
        {resend.isPending ? "Invio…" : "Rimanda l'email"}
      </Button>
    </form>
  );
}
