"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "@/components/avatar";
import Logo from "@/components/logo";
import { ProfileForm } from "@/components/profile-editor";
import { Button } from "@/components/ui";
import { useMe } from "@/lib/account";
import type { Profile } from "@/lib/api";
import { selectProfile } from "@/lib/session";

// First-run guide for an account without profiles: what profiles are, create
// the first one (required), then optionally add others before starting.
export default function Welcome() {
  const router = useRouter();
  const { data: me } = useMe();
  const [step, setStep] = useState<"intro" | "create" | "done">("intro");
  const [created, setCreated] = useState<Profile | null>(null);
  const firstName = me?.name.split(" ")[0] ?? "";
  const steps = ["intro", "create", "done"] as const;

  return (
    <main className="night flex min-h-dvh flex-col items-center px-6 py-10">
      <div className="flex w-full max-w-md items-center justify-between">
        <Logo size="sm" />
        <ol className="flex gap-2" aria-label="Avanzamento">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={s === step ? "step" : undefined}
              className={`h-1.5 w-8 rounded-full ${steps.indexOf(step) >= i ? "bg-white" : "bg-white/25"}`}
            >
              <span className="sr-only">Passo {i + 1} di 3</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex w-full max-w-md flex-1 flex-col justify-center py-10">
        {step === "intro" && (
          <div>
            <h1 className="font-display text-4xl font-bold sm:text-5xl">
              {firstName ? `Ciao ${firstName}, ti diamo il benvenuto in MAIA` : "Ti diamo il benvenuto in MAIA"}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Il tuo account può avere fino a 5 profili: uno per ogni persona di casa. Ogni profilo ha la sua lista
              <span className="text-label"> Continua a guardare</span> e i suoi preferiti, su tutti i dispositivi.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted">Per iniziare crea il tuo profilo.</p>
            <Button onClick={() => setStep("create")} className="mt-10 w-full">
              Crea il primo profilo
            </Button>
          </div>
        )}

        {step === "create" && (
          <div>
            <h1 className="text-center font-display text-3xl font-bold">Il tuo profilo</h1>
            <p className="mt-3 text-center text-muted">Scegli un nome e un colore. Puoi cambiarli quando vuoi.</p>
            <div className="mt-8">
              <ProfileForm
                defaultName={firstName}
                submitLabel="Continua"
                onDone={(p) => {
                  if (!p) return;
                  setCreated(p);
                  selectProfile(p.id);
                  setStep("done");
                }}
              />
            </div>
          </div>
        )}

        {step === "done" && created && (
          <div className="text-center">
            <div className="flex justify-center">
              <Avatar profile={created} size={128} />
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold">Tutto pronto, {created.name}</h1>
            <p className="mt-4 text-lg text-muted">
              Vuoi aggiungere subito i profili delle altre persone di casa? Puoi farlo anche più tardi da
              &ldquo;Chi sta guardando?&rdquo;.
            </p>
            <div className="mt-10 flex flex-col gap-3">
              <Button onClick={() => router.replace("/tv")}>Inizia a guardare</Button>
              <Button variant="secondary" onClick={() => router.replace("/profili")}>
                Aggiungi altri profili
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
