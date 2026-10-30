"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ButtonLink, Notice } from "@/components/ui";
import { api } from "@/lib/api";

// Landing page of the link in the confirmation email (?token=...).
export default function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const verify = useMutation({
    mutationFn: () => api<{ status: string }>("/auth/verify-email", { method: "POST", body: { token } }),
  });
  const { mutate } = verify;
  // The token is single-use: confirm exactly once, even if the effect runs
  // twice (React dev mode) — a second call would fail and hide the success.
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    mutate();
  }, [token, mutate]);

  if (!token || verify.isError) {
    return (
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold">Link non valido</h1>
        <p className="mt-4 text-lg text-muted">
          Il link di conferma non è valido o è scaduto (vale 48 ore). Accedi con email e password: se l&apos;email
          non è ancora confermata potrai farti mandare un link nuovo.
        </p>
        <ButtonLink href="/login" className="mt-10 w-full">
          Vai al login
        </ButtonLink>
      </div>
    );
  }

  if (!verify.isSuccess) {
    return (
      <p className="text-center text-lg text-muted" role="status">
        Conferma in corso…
      </p>
    );
  }

  const active = verify.data.status === "ACTIVE";
  return (
    <div className="text-center">
      <h1 className="font-display text-4xl font-bold">Email confermata</h1>
      <div className="mt-6">
        <Notice tone="ok">
          {active
            ? "Il tuo account è già attivo: puoi accedere."
            : "Ora un amministratore deve abilitare l'account. Quando è attivo puoi accedere con email e password."}
        </Notice>
      </div>
      <ButtonLink href="/login" className="mt-10 w-full">
        Vai al login
      </ButtonLink>
    </div>
  );
}
