import { notFound } from "next/navigation";
import { Suspense } from "react";
import AuthFrame from "@/components/auth-frame";
import { ButtonLink } from "@/components/ui";
import ResendEmail from "./resend-email";

// One screen per account state that blocks access (see the account
// lifecycle: PENDING_EMAIL → PENDING_APPROVAL → ACTIVE / SUSPENDED).
const states = {
  email: {
    title: "Conferma la tua email",
    body: "Ti abbiamo mandato un link per confermare l'indirizzo. Aprilo dalla tua casella: dopo la conferma, l'account passa all'approvazione di un amministratore.",
    resend: true,
  },
  approvazione: {
    title: "Account in attesa di approvazione",
    body: "L'email è confermata. Un amministratore deve ancora abilitare l'account: quando è attivo puoi accedere.",
    resend: false,
  },
  sospeso: {
    title: "Account non abilitato",
    body: "Questo account al momento non può entrare in MAIA. Per riattivarlo contatta l'amministratore.",
    resend: false,
  },
} as const;

export function generateStaticParams() {
  return Object.keys(states).map((stato) => ({ stato }));
}

export default function StatePage({ params }: PageProps<"/stato/[stato]">) {
  return (
    <AuthFrame>
      {/* URL data stays behind Suspense so the frame is part of the instant shell. */}
      <Suspense fallback={null}>
        <StateContent params={params} />
      </Suspense>
    </AuthFrame>
  );
}

async function StateContent({
  params,
}: {
  params: Promise<{ stato: string }>;
}) {
  const { stato } = await params;
  const state = states[stato as keyof typeof states];
  if (!state) notFound();

  return (
    <div className="text-center">
      <h1 className="font-display text-4xl font-bold">{state.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">{state.body}</p>
      <div className="mt-10 flex flex-col gap-3">
        {state.resend && <ResendEmail />}
        <ButtonLink href="/login" variant="secondary">
          Torna al login
        </ButtonLink>
      </div>
    </div>
  );
}
