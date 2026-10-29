"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice, TextLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { rememberPendingEmail } from "@/lib/session";

const PASSWORD_MIN = 8;

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signup = useMutation({
    mutationFn: () => api("/auth/register", { method: "POST", body: { name, email, password } }),
    onSuccess: () => {
      rememberPendingEmail(email);
      router.push("/stato/email");
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        signup.mutate();
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Crea un account</h1>
      <p className="mt-3 text-center text-lg text-muted">
        Dopo la registrazione confermi l&apos;email e aspetti che un amministratore abiliti l&apos;account.
      </p>
      <div className="mt-8 space-y-4">
        <Field label="Nome" name="name" autoComplete="name" value={name} onChange={setName} required maxLength={60} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
        <Field
          label={`Password (almeno ${PASSWORD_MIN} caratteri)`}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          required
          minLength={PASSWORD_MIN}
        />
      </div>
      {signup.error && (
        <div className="mt-4">
          <Notice>
            {signup.error instanceof ApiError && signup.error.code === "EMAIL_TAKEN" ? (
              <>
                Esiste già un account con questa email. <TextLink href="/login">Accedi</TextLink> oppure{" "}
                <TextLink href="/password-dimenticata">reimposta la password</TextLink>.
              </>
            ) : (
              signup.error.message
            )}
          </Notice>
        </div>
      )}
      <Button type="submit" disabled={signup.isPending} className="mt-6 w-full">
        {signup.isPending ? "Creazione in corso…" : "Crea account"}
      </Button>
      <p className="mt-8 text-center text-muted">
        Hai già un account? <TextLink href="/login">Accedi</TextLink>
      </p>
    </form>
  );
}
