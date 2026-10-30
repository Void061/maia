"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Field, Notice, TextLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const PASSWORD_MIN = 8;

// Landing page of the link in the password-reset email (?token=...).
export default function ResetPassword() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const reset = useMutation({
    mutationFn: () => api("/auth/reset-password", { method: "POST", body: { token, password } }),
  });

  if (reset.isSuccess) {
    return (
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold">Password cambiata</h1>
        <p className="mt-4 text-lg text-muted">
          Per sicurezza abbiamo chiuso l&apos;accesso su tutti i dispositivi. Accedi con la nuova password.
        </p>
        <ButtonLink href="/login" className="mt-10 w-full">
          Vai al login
        </ButtonLink>
      </div>
    );
  }

  const invalid = !token || (reset.error instanceof ApiError && reset.error.code === "TOKEN_INVALID");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMismatch(password !== confirm);
        if (password === confirm) reset.mutate();
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Scegli una nuova password</h1>
      <div className="mt-8 space-y-4">
        <Field
          label={`Nuova password (almeno ${PASSWORD_MIN} caratteri)`}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          required
          minLength={PASSWORD_MIN}
        />
        <Field
          label="Ripeti la password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          required
          minLength={PASSWORD_MIN}
        />
      </div>
      {mismatch && (
        <div className="mt-4">
          <Notice>Le due password non coincidono.</Notice>
        </div>
      )}
      {invalid ? (
        <div className="mt-4">
          <Notice>
            Il link non è valido o è scaduto (vale 1 ora).{" "}
            <TextLink href="/forgot-password">Chiedine uno nuovo</TextLink>.
          </Notice>
        </div>
      ) : (
        reset.error && (
          <div className="mt-4">
            <Notice>{reset.error.message}</Notice>
          </div>
        )
      )}
      <Button type="submit" disabled={reset.isPending || !token} className="mt-6 w-full">
        {reset.isPending ? "Salvataggio…" : "Salva la nuova password"}
      </Button>
    </form>
  );
}
