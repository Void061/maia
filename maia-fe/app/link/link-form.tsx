"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

type Info = components["schemas"]["PairingInfoDto"];
const CODE_LENGTH = 6;

// On the phone: confirms the login of a TV. The QR brings the code; without it,
// the code on the TV can be typed here. The phone must already be signed in.
export default function LinkForm() {
  const params = useSearchParams();
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");

  const info = useQuery({
    queryKey: ["pairing", code],
    queryFn: () => api<Info>(`/auth/pair/${encodeURIComponent(code)}`),
    enabled: code.length > 0,
    retry: false,
  });
  const answer = useMutation({
    mutationFn: (approve: boolean) => api(`/auth/pair/${approve ? "approve" : "reject"}`, { method: "POST", body: { code } }),
  });

  if (answer.isSuccess) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">{answer.variables ? "Fatto" : "Accesso rifiutato"}</h1>
        <p className="mt-3 text-lg text-muted">{answer.variables ? "La TV entra tra un attimo. Puoi chiudere questa pagina." : "La TV non è entrata."}</p>
      </div>
    );
  }

  if (!code || info.isError) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setCode(typed.trim());
        }}
      >
        <h1 className="text-center font-display text-3xl font-bold">Accedi sulla TV</h1>
        <p className="mt-3 text-center text-lg text-muted">Scrivi il codice che vedi sullo schermo.</p>
        {info.isError && (
          <div className="mt-4">
            <Notice>{info.error.message}</Notice>
          </div>
        )}
        <div className="mt-6">
          <Field label="Codice" name="code" value={typed} onChange={setTyped} required />
        </div>
        <Button type="submit" disabled={typed.trim().length < CODE_LENGTH} className="mt-6 w-full">
          Continua
        </Button>
      </form>
    );
  }

  return (
    <div>
      <h1 className="text-center font-display text-3xl font-bold">Accedere sulla TV?</h1>
      <p className="mt-3 text-center text-lg text-muted">
        {info.data ? `${info.data.device} chiede di entrare col tuo account.` : "Controllo il codice…"}
      </p>
      <p className="mt-3 text-center text-sm text-muted">Conferma solo se hai davanti lo schermo con questo codice:</p>
      <p className="mt-2 text-center font-mono text-3xl font-bold tracking-[0.2em]">{code.toUpperCase()}</p>
      {answer.error && (
        <div className="mt-4">
          <Notice>{answer.error.message}</Notice>
        </div>
      )}
      <Button onClick={() => answer.mutate(true)} disabled={!info.data || answer.isPending} className="mt-6 w-full">
        Conferma
      </Button>
      <Button variant="secondary" onClick={() => answer.mutate(false)} disabled={!info.data || answer.isPending} className="mt-3 w-full">
        Non sono io
      </Button>
    </div>
  );
}
