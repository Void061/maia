"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice, TextLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { rememberPendingEmail } from "@/lib/session";

// Login refusals that have their own screen (see /status/[state]).
const STATE_PAGE: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "/status/unverified",
  PENDING_APPROVAL: "/status/pending",
  SUSPENDED: "/status/suspended",
};

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: () => {
      const next = new URLSearchParams(location.search).get("next");
      router.replace(next?.startsWith("/") ? next : "/profiles");
    },
    onError: (err) => {
      if (err instanceof ApiError && STATE_PAGE[err.code]) {
        rememberPendingEmail(email);
        router.push(STATE_PAGE[err.code]);
      }
    },
  });

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
      <p className="mt-8 text-center text-muted">
        Non hai un account? <TextLink href="/signup">Registrati</TextLink>
      </p>
    </form>
  );
}
