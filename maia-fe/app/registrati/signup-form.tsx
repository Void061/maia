"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";

export default function SignupForm() {
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/stato/email");
      }}
    >
      <h1 className="text-center font-display text-4xl font-bold">Crea un account</h1>
      <p className="mt-3 text-center text-lg text-muted">
        Dopo la registrazione confermi l&apos;email e aspetti che un amministratore abiliti
        l&apos;account.
      </p>
      <div className="mt-8 space-y-3">
        <Field label="Nome" name="name" autoComplete="name" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" />
      </div>
      <Button type="submit" className="mt-8 w-full">
        Crea account
      </Button>
      <p className="mt-8 text-center text-muted">
        Hai già un account?{" "}
        <Link href="/login" className="focusable rounded text-label underline underline-offset-4">
          Accedi
        </Link>
      </p>
    </form>
  );
}
