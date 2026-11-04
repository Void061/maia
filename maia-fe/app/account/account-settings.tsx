"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/avatar";
import { BackIcon } from "@/components/icons";
import Logo from "@/components/logo";
import { Button, Field, Notice } from "@/components/ui";
import { ME, useLogout, useMe } from "@/lib/account";
import { api, type components } from "@/lib/api";
import { isTv } from "@/lib/tv-device";

const PASSWORD_MIN = 8;
const SESSIONS = ["me", "sessions"];
// Used this recently, a device counts as in use.
const IN_USE_MS = 10 * 60_000;

type Session = components["schemas"]["SessionDto"];

// Account settings: name, email (read-only for now), password, profiles,
// connected devices, sign out.
export default function AccountSettings() {
  const router = useRouter();
  const { data: me } = useMe();
  const logout = useLogout();
  // On a TV: a menu on the left, one section at a time on the right.
  const [tv, setTv] = useState(false);
  useEffect(() => setTv(isTv()), []);
  const [voice, setVoice] = useState("data");
  const shows = (key: string) => !tv || voice === key;
  const voices = [
    { key: "data", label: "Dati dell'account" },
    { key: "password", label: "Password" },
    { key: "profiles", label: "Profili" },
    { key: "devices", label: "Dispositivi connessi" },
    ...(me?.role === "ADMIN" ? [{ key: "admin", label: "Amministrazione" }] : []),
    { key: "logout", label: "Esci" },
  ];

  return (
    <main className="tv-side-page night min-h-dvh px-4 pb-20 pt-8 sm:px-10">
      <div className="tv-side mx-auto max-w-2xl">
        <div className="tv-side-head">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              aria-label="Indietro"
              className="tv-none focusable pill-focus grid size-11 place-items-center rounded-full"
            >
              <BackIcon />
            </button>
            <Logo size="sm" />
            <span className="tv-none size-11" />
          </div>
          <h1 className="mt-8 font-display text-4xl font-bold">Account</h1>
        </div>

        {tv && me && (
          <div role="tablist" aria-label="Sezioni" data-tv-side>
            {voices.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={voice === v.key}
                onClick={() => setVoice(v.key)}
                onFocus={() => setVoice(v.key)}
                className="focusable flex"
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {!me ? (
          <p className="mt-8 text-muted" role="status">
            Caricamento…
          </p>
        ) : (
          <div data-tv-pane className="mt-8 grid content-start gap-6">
            {shows("data") && (
            <Section title="Dati dell'account">
              <NameForm name={me.name} />
              <div className="mt-4">
                <Field label="Email" name="email" value={me.email} readOnly />
              </div>
            </Section>
            )}

            {shows("password") && (
            <Section title="Password">
              <PasswordForm />
            </Section>
            )}

            {shows("profiles") && (
            <Section title="Profili">
              <ul className="flex flex-wrap gap-4">
                {me.profiles.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-full bg-raised py-1.5 pl-1.5 pr-4">
                    <Avatar profile={p} size={36} />
                    <span className="font-medium">{p.name}</span>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" onClick={() => router.push("/profiles")} className="mt-5">
                Gestisci profili
              </Button>
            </Section>
            )}

            {shows("devices") && (
            <Section title="Dispositivi connessi">
              <Sessions />
            </Section>
            )}

            {me.role === "ADMIN" && shows("admin") && (
              <Section title="Amministrazione">
                <p className="text-muted">Approva i nuovi account, sospendili o rendili amministratori.</p>
                <Button variant="secondary" onClick={() => router.push("/admin")} className="mt-5">
                  Apri il pannello admin
                </Button>
              </Section>
            )}

            {shows("logout") && (
            <Button variant="danger" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {logout.isPending ? "Uscita…" : "Esci da MAIA"}
            </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-5 sm:p-7">
      <h2 className="mb-5 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

const lastUsed = (s: Session) => {
  const at = new Date(s.lastUsedAt);
  if (Date.now() - at.getTime() < IN_USE_MS) return "In uso ora";
  const when = at.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `Ultimo uso ${when}`;
};

// Every device signed in to this account; any other one can be disconnected
// from here. A disconnected device goes back to the login at its next request.
function Sessions() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: SESSIONS, queryFn: () => api<Session[]>("/me/sessions") });
  const close = useMutation({
    mutationFn: (id: string | null) => api(id ? `/me/sessions/${id}` : "/me/sessions", { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: SESSIONS }),
  });
  const sessions = list.data ?? [];
  const others = sessions.filter((s) => !s.current).length;

  if (list.isPending) {
    return (
      <p className="text-muted" role="status">
        Caricamento…
      </p>
    );
  }
  if (list.isError) return <Notice>{list.error.message}</Notice>;
  return (
    <>
      <ul className="grid gap-3">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-raised px-4 py-3">
            <span className="min-w-0">
              <span className="block font-medium">
                {s.device}
                {s.current && <span className="ml-2 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Questo dispositivo</span>}
              </span>
              <span className="block text-sm text-muted">{lastUsed(s)}</span>
            </span>
            {!s.current && (
              <Button variant="secondary" onClick={() => close.mutate(s.id)} disabled={close.isPending}>
                Disconnetti
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others > 1 && (
        <Button variant="danger" onClick={() => close.mutate(null)} disabled={close.isPending} className="mt-5">
          Disconnetti tutti gli altri
        </Button>
      )}
      {close.error && (
        <div className="mt-4">
          <Notice>{close.error.message}</Notice>
        </div>
      )}
    </>
  );
}

function NameForm({ name: initial }: { name: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial);
  const save = useMutation({
    mutationFn: () => api("/me", { method: "PATCH", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Field label="Nome" name="name" autoComplete="name" value={name} onChange={setName} required maxLength={60} />
      </div>
      <Button type="submit" variant="secondary" disabled={save.isPending || name.trim() === initial}>
        {save.isSuccess && name.trim() === initial ? "Salvato" : "Salva"}
      </Button>
      {save.error && <Notice>{save.error.message}</Notice>}
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api("/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
      className="grid gap-4"
    >
      <Field
        label="Password attuale"
        name="current"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
        required
      />
      <Field
        label={`Nuova password (almeno ${PASSWORD_MIN} caratteri)`}
        name="new"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        required
        minLength={PASSWORD_MIN}
      />
      {change.isSuccess && <Notice tone="ok">Password cambiata. Gli altri dispositivi dovranno accedere di nuovo.</Notice>}
      {change.error && <Notice>{change.error.message}</Notice>}
      <Button type="submit" variant="secondary" disabled={change.isPending}>
        {change.isPending ? "Salvataggio…" : "Cambia password"}
      </Button>
    </form>
  );
}
