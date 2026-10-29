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
      <h1 className="font-display text-4xl font-semibold">Crea un account</h1>
      <p className="mt-3 max-w-md text-lg text-moon">
        Dopo la registrazione confermi l&apos;email e aspetti che un amministratore abiliti
        l&apos;account.
      </p>
      <div className="mt-8 space-y-5">
        <Field label="Nome" name="name" autoComplete="name" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" />
      </div>
      <Button type="submit" className="mt-8 w-full">
        Crea account
      </Button>
      <p className="mt-8 text-moon">
        Hai già un account?{" "}
        <Link href="/login" className="lamp rounded text-paper underline underline-offset-4">
          Accedi
        </Link>
      </p>
    </form>
  );
}
