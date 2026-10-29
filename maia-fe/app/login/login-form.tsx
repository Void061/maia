"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field } from "@/components/ui";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code">("password");

  if (mode === "code") {
    return (
      <div>
        <h1 className="font-display text-4xl font-semibold">Accedi con il telefono</h1>
        <p className="mt-3 max-w-sm text-lg text-moon">
          Inquadra il codice con il telefono su cui hai già fatto l&apos;accesso, oppure apri
          maia.casa/collega e scrivi il codice.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-8">
          <FakeQr />
          <div>
            <p className="text-sm text-moon">Codice</p>
            <p className="font-display text-5xl font-bold tracking-[0.2em] text-lamp">K7Q-4ZN</p>
            <p className="mt-2 text-sm text-moon">Scade tra 9 minuti</p>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          {/* Prototype shortcut: pretend the phone confirmed. */}
          <Button onClick={() => router.push("/profili")}>Simula conferma dal telefono</Button>
          <Button variant="ghost" onClick={() => setMode("password")}>
            Usa email e password
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/profili");
      }}
    >
      <h1 className="font-display text-4xl font-semibold">Accedi a MAIA</h1>
      <p className="mt-3 text-lg text-moon">Usa l&apos;email e la password del tuo account.</p>
      <div className="mt-8 space-y-5">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <Button type="submit">
          Accedi
        </Button>
        <Button variant="ghost" onClick={() => setMode("code")}>
          Accedi con il telefono
        </Button>
      </div>
      <p className="mt-8 text-moon">
        Non hai un account?{" "}
        <Link href="/registrati" className="lamp rounded text-paper underline underline-offset-4">
          Registrati
        </Link>
      </p>
      <PrototypeLinks />
    </form>
  );
}

function PrototypeLinks() {
  return (
    <div className="mt-12 border-t border-line pt-5 text-sm text-moon">
      <p>Prototipo: vedi le schermate per gli account non ancora attivi</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        <Link className="lamp rounded underline underline-offset-4" href="/stato/email">
          Email da confermare
        </Link>
        <Link className="lamp rounded underline underline-offset-4" href="/stato/approvazione">
          In attesa di approvazione
        </Link>
        <Link className="lamp rounded underline underline-offset-4" href="/stato/sospeso">
          Account sospeso
        </Link>
      </div>
    </div>
  );
}

// Decorative stand-in for the real QR code.
function FakeQr() {
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21;
    const y = Math.floor(i / 21);
    const finder = (cx: number, cy: number) =>
      x >= cx && x < cx + 7 && y >= cy && y < cy + 7 &&
      (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (finder(0, 0) || finder(14, 0) || finder(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false;
    return ((x * 7 + y * 13 + x * y) % 5) < 2;
  });
  return (
    <div className="grid size-44 grid-cols-[repeat(21,1fr)] rounded-xl bg-paper p-3" aria-label="Codice QR">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-ink" : ""} />
      ))}
    </div>
  );
}
