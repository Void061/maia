"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice, TextLink } from "@/components/ui";
import { api, ApiError, type components } from "@/lib/api";
import { afterLogin, rememberPendingEmail } from "@/lib/session";

const CODE_DIGITS = 6;

// Login refusals that have their own screen (see /status/[state]).
const STATE_PAGE: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "/status/unverified",
  PENDING_APPROVAL: "/status/pending",
  SUSPENDED: "/status/suspended",
};

type LoginResult = components["schemas"]["LoginResultDto"];

export default function LoginForm({ onPhone }: { onPhone?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set when the account uses two-step verification: the code is on its way.
  const [challenge, setChallenge] = useState<string | null>(null);

  const enter = () => {
    router.replace(afterLogin());
  };

  const login = useMutation({
    mutationFn: () => api<LoginResult>("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: (result) => {
      if (result.twoFactor && result.challenge) setChallenge(result.challenge);
      else enter();
    },
    onError: (err) => {
      if (err instanceof ApiError && STATE_PAGE[err.code]) {
        rememberPendingEmail(email);
        router.push(STATE_PAGE[err.code]);
      }
    },
  });

  const failed = login.error instanceof ApiError && !STATE_PAGE[login.error.code] ? login.error : null;

  if (challenge) return <CodeStep challenge={challenge} onDone={enter} onRestart={() => setChallenge(null)} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Accedi</h1>
      <p className="mt-3 text-center text-lg text-muted">Usa l&apos;email e la password del tuo account.</p>
      <div className="mt-8 space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />
      </div>
      <p className="mt-3 text-right text-sm text-muted">
        <TextLink href="/forgot-password">Password dimenticata?</TextLink>
      </p>
      {failed && (
        <div className="mt-4">
          <Notice>{failed.message}</Notice>
        </div>
      )}
      <Button type="submit" disabled={login.isPending} className="mt-6 w-full">
        {login.isPending ? "Accesso in corso…" : "Accedi"}
      </Button>
      {onPhone && (
        <Button variant="secondary" onClick={onPhone} className="mt-3 w-full">
          Entra col telefono
        </Button>
      )}
      <p className="mt-8 text-center text-muted">
        Non hai un account? <TextLink href="/signup">Registrati</TextLink>
      </p>
    </form>
  );
}

// Second step of the login: the code that just went out by email.
function CodeStep({ challenge, onDone, onRestart }: { challenge: string; onDone: () => void; onRestart: () => void }) {
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () => api("/auth/login/verify", { method: "POST", body: { challenge, code: code.trim() } }),
    onSuccess: onDone,
  });
  const resend = useMutation({
    mutationFn: () => api("/auth/login/resend", { method: "POST", body: { challenge } }),
  });
  const expired = verify.error instanceof ApiError && verify.error.code === "CODE_EXPIRED";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify.mutate();
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Controlla l&apos;email</h1>
      <p className="mt-3 text-center text-lg text-muted">Ti abbiamo mandato un codice di 6 cifre. Vale 10 minuti.</p>
      <div className="mt-8">
        <Field label="Codice" name="code" autoComplete="one-time-code" value={code} onChange={setCode} required />
      </div>
      {(verify.error || resend.error) && (
        <div className="mt-4">
          <Notice>{(verify.error ?? resend.error)?.message}</Notice>
        </div>
      )}
      {resend.isSuccess && !verify.error && <p className="mt-4 text-center text-muted">Codice nuovo inviato.</p>}
      {expired ? (
        <Button onClick={onRestart} className="mt-6 w-full">
          Ricomincia
        </Button>
      ) : (
        <Button type="submit" disabled={verify.isPending || code.trim().length !== CODE_DIGITS} className="mt-6 w-full">
          {verify.isPending ? "Controllo…" : "Entra"}
        </Button>
      )}
      <Button variant="secondary" onClick={() => resend.mutate()} disabled={resend.isPending} className="mt-3 w-full">
        Invia di nuovo
      </Button>
    </form>
  );
}
