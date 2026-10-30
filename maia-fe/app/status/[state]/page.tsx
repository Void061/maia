import { notFound } from "next/navigation";
import { Suspense } from "react";
import AuthFrame from "@/components/auth-frame";
import { ButtonLink } from "@/components/ui";
import ResendEmail from "./resend-email";

// One screen per account state that blocks access (see the account
// lifecycle: PENDING_EMAIL → PENDING_APPROVAL → ACTIVE / SUSPENDED).
const states = {
  unverified: {
    title: "Conferma la tua email",
    body: "Ti abbiamo mandato un link per confermare l'indirizzo. Aprilo dalla tua casella: dopo la conferma, l'account passa all'approvazione di un amministratore.",
    resend: true,
  },
  pending: {
    title: "Account in attesa di approvazione",
    body: "L'email è confermata. Un amministratore deve ancora abilitare l'account: quando è attivo puoi accedere.",
    resend: false,
  },
  suspended: {
    title: "Account non abilitato",
    body: "Questo account al momento non può entrare in MAIA. Per riattivarlo contatta l'amministratore.",
    resend: false,
  },
} as const;

export function generateStaticParams() {
  return Object.keys(states).map((state) => ({ state }));
}

export default function StatePage({ params }: PageProps<"/status/[state]">) {
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
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const screen = states[state as keyof typeof states];
  if (!screen) notFound();

  return (
    <div className="text-center">
      <h1 className="font-display text-4xl font-bold">{screen.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">{screen.body}</p>
      <div className="mt-10 flex flex-col gap-3">
        {screen.resend && <ResendEmail />}
        <ButtonLink href="/login" variant="secondary">
          Torna al login
        </ButtonLink>
      </div>
    </div>
  );
}
