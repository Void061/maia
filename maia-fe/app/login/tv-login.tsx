"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

type Pairing = components["schemas"]["PairingStartDto"];
type Status = components["schemas"]["PairingStatusDto"];

const ASK_EVERY_MS = 2000;

// Login on a TV: nothing to type with the remote. The TV shows a QR and a code,
// a phone already signed in confirms them on /link, and the TV gets its session.
export default function TvLogin({ onPassword }: { onPassword: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      const next = await api<Pairing>("/auth/pair/start", { method: "POST" });
      setQr(await QRCode.toDataURL(`${location.origin}/link?code=${next.code}`, { margin: 2, width: 480 }));
      setPairing(next);
    } catch {
      setNotice("Non riesco a preparare il codice. Accedi con email e password.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(start);
    // This screen replaces the form the page opened with: the remote starts here.
    document.querySelector<HTMLElement>(".tv-login button")?.focus();
    return () => clearTimeout(first);
  }, [start]);

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      const { status } = await api<Status>("/auth/pair/poll", { method: "POST", body: { token: pairing.token } }).catch(() => ({ status: "pending" }));
      if (status === "approved") {
        clearInterval(timer);
        location.replace("/profiles");
      } else if (status === "rejected") {
        setNotice("Accesso rifiutato dal telefono.");
        setPairing(null);
        void start();
      } else if (status === "expired") {
        // Five minutes on screen: a fresh code, without asking.
        setPairing(null);
        void start();
      }
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [pairing, start]);

  return (
    <div className="tv-login">
      <div className="tv-login-qr">
        {/* A data URL made here, nothing for next/image to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr} alt="QR code per accedere col telefono" /> : <span className="block size-full animate-pulse bg-white/20" />}
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold">Accedi col telefono</h1>
        <p className="mt-3 text-muted">Inquadra il QR col telefono e conferma. Non serve scrivere nulla qui.</p>
        <p className="mt-6 text-sm text-muted">Oppure apri {location.host}/link e scrivi</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em]">{pairing?.code ?? "······"}</p>
        {notice && (
          <div className="mt-4">
            <Notice>{notice}</Notice>
          </div>
        )}
        <Button variant="secondary" onClick={onPassword} className="mt-6">
          Usa email e password
        </Button>
      </div>
    </div>
  );
}
