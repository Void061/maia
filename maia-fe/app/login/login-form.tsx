"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice, TextLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { rememberPendingEmail } from "@/lib/session";

// Login refusals that have their own screen (see /stato/[stato]).
const STATE_PAGE: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "/stato/email",
  PENDING_APPROVAL: "/stato/approvazione",
  SUSPENDED: "/stato/sospeso",
};

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: () => {
      const next = new URLSearchParams(location.search).get("next");
      router.replace(next?.startsWith("/") ? next : "/profili");
    },
    onError: (err) => {
      if (err instanceof ApiError && STATE_PAGE[err.code]) {
        rememberPendingEmail(email);
        router.push(STATE_PAGE[err.code]);
      }
    },
  });

  if (mode === "code") {
    return (
      <div>
        <h1 className="text-center font-display text-4xl font-bold">Accedi con il telefono</h1>
        <p className="mt-3 text-center text-lg text-muted">
          Inquadra il codice con il telefono su cui hai già fatto l&apos;accesso, oppure apri maia.casa/collega e
          scrivi il codice.
        </p>
        <div className="mt-8 flex flex-col items-center gap-6">
          <FakeQr />
          <div className="text-center">
            <p className="text-sm text-muted">Codice</p>
            <p className="font-display text-5xl font-bold tracking-[0.2em]">K7Q-4ZN</p>
          </div>
        </div>
        <div className="mt-8">
          <Notice tone="ok">L&apos;accesso con il telefono arriva presto: per ora usa email e password.</Notice>
        </div>
        <Button variant="secondary" onClick={() => setMode("password")} className="mt-6 w-full">
          Usa email e password
        </Button>
      </div>
    );
  }

  const failed = login.error instanceof ApiError && !STATE_PAGE[login.error.code] ? login.error : null;

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
        <TextLink href="/password-dimenticata">Password dimenticata?</TextLink>
      </p>
      {failed && (
        <div className="mt-4">
          <Notice>{failed.message}</Notice>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3">
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? "Accesso in corso…" : "Accedi"}
        </Button>
        <Button variant="secondary" onClick={() => setMode("code")}>
          Accedi con il telefono
        </Button>
      </div>
      <p className="mt-8 text-center text-muted">
        Non hai un account? <TextLink href="/registrati">Registrati</TextLink>
      </p>
    </form>
  );
}

// Decorative stand-in for the real QR code.
function FakeQr() {
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21;
    const y = Math.floor(i / 21);
    const finder = (cx: number, cy: number) =>
      x >= cx &&
      x < cx + 7 &&
      y >= cy &&
      y < cy + 7 &&
      (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (finder(0, 0) || finder(14, 0) || finder(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false;
    return (x * 7 + y * 13 + x * y) % 5 < 2;
  });
  return (
    <div className="grid size-48 grid-cols-[repeat(21,1fr)] rounded-2xl bg-white p-3" aria-label="Codice QR">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-black" : ""} />
      ))}
    </div>
  );
}
