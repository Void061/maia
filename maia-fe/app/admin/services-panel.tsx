"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

export type Service = components["schemas"]["AdminServiceDto"];
type Sync = components["schemas"]["SyncInfoDto"];
type SyncSettings = {
  mode: Sync["mode"];
  at: string;
  everyHours: number | null;
};

// Same choices as the backend (divisors of 24: the checks fall at the same hours every day).
const CHECK_HOURS = [1, 2, 3, 4, 6, 8, 12];
const RUN_STATUS: Record<string, string> = {
  running: "in corso",
  done: "completata",
  aborted: "annullata (elenco incompleto)",
  failed: "non riuscita",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// On/off switch per outside service (RaiPlay, TMDB…). Off = MAIA sends that
// service no request at all, within seconds; queued titles wait, nothing is lost.
export default function ServicesPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<Service[]>("/admin/services"),
    refetchInterval: 10_000,
    enabled,
  });
  const flip = useMutation({
    mutationFn: (s: { id: string; enabled: boolean }) =>
      api(`/admin/services/${s.id}`, {
        method: "POST",
        body: { enabled: s.enabled },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });

  return (
    <section className="mt-6">
      <p className="text-muted">
        Spegnendo un servizio MAIA smette subito di contattarlo. I titoli in
        coda aspettano e ripartono quando lo riaccendi.
      </p>
      {list.error && (
        <div className="mt-4">
          <Notice>{list.error.message}</Notice>
        </div>
      )}
      {flip.error && (
        <div className="mt-4">
          <Notice>{flip.error.message}</Notice>
        </div>
      )}
      <ul className="mt-4 grid gap-3">
        {list.data?.map((s) => {
          const pending = flip.isPending && flip.variables?.id === s.id;
          const on = pending ? flip.variables.enabled : s.enabled;
          const detail = !s.enabled
            ? `Spento${s.switchedAt ? ` il ${when(s.switchedAt)}` : ""}${s.switchedBy ? ` da ${s.switchedBy}` : ""}`
            : s.status === "DOWN" && s.pausedUntil
              ? `In pausa automatica fino alle ${when(s.pausedUntil)} per errori${s.lastError ? `: ${s.lastError}` : ""}`
              : s.lastSuccessAt
                ? `Ultima risposta ${when(s.lastSuccessAt)}`
                : "Nessuna risposta ancora";
          return (
            <li
              key={s.id}
              className={`rounded-3xl bg-surface p-4 sm:p-5 ${on ? "" : "ring-2 ring-[#ff6b6b]/60"}`}
            >
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{s.name}</p>
                  <p className="text-sm text-faint">{s.role}</p>
                  <p
                    className={`mt-1 text-sm ${!s.enabled ? "text-[#ffb4b4]" : s.status === "DOWN" ? "text-[#ffd98a]" : "text-muted"}`}
                  >
                    {detail}
                    {s.queued > 0 && ` · ${s.queued} titoli in coda`}
                  </p>
                </div>
                {/* The state in words too: the switch alone is easy to misread. */}
                <span
                  aria-hidden
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold ${on ? "bg-[#18301f] text-[#7ee2a0]" : "bg-[#3a1d1d] text-[#ffb4b4]"}`}
                >
                  {on ? "Attivo" : "Spento"}
                </span>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={`${s.name}: ${on ? "attivo, premi per spegnere" : "spento, premi per riaccendere"}`}
                  disabled={pending}
                  onClick={() => flip.mutate({ id: s.id, enabled: !s.enabled })}
                  className={`focusable relative h-9 w-16 shrink-0 rounded-full border-2 transition-colors disabled:opacity-60 ${
                    on
                      ? "border-[#30d158] bg-[#30d158]"
                      : "border-white/35 bg-transparent"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 size-7 rounded-full shadow transition-transform ${on ? "translate-x-7 bg-white" : "bg-white/60"}`}
                  />
                </button>
              </div>
              {s.sync && (
                <SyncSection
                  id={s.id}
                  name={s.name}
                  sync={s.sync}
                  serviceOn={s.enabled}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// How a catalog source updates: automatic (a full pass every day at a time,
// plus lighter checks every few hours) or manual (only with "Aggiorna ora").
function SyncSection({
  id,
  name,
  sync,
  serviceOn,
}: {
  id: string;
  name: string;
  sync: Sync;
  serviceOn: boolean;
}) {
  const qc = useQueryClient();
  const saved: SyncSettings = {
    mode: sync.mode,
    at: sync.at,
    everyHours: sync.everyHours ?? null,
  };
  const [draft, setDraft] = useState<SyncSettings | null>(null);
  const value = draft ?? saved;
  const changed =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const [confirm, setConfirm] = useState(false);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["admin", "services"] });

  const save = useMutation({
    mutationFn: (body: SyncSettings) =>
      api(`/admin/services/${id}/sync`, { method: "PATCH", body }),
    onSuccess: async () => {
      await refresh();
      setDraft(null);
    },
  });
  const runNow = useMutation({
    mutationFn: () => api(`/admin/services/${id}/sync-now`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(false);
      return refresh();
    },
  });
  const edit = (patch: Partial<SyncSettings>) =>
    setDraft({ ...value, ...patch });

  const run = sync.lastRun;
  const lastRun = run
    ? `Ultima passata completa: ${when(run.startedAt)}, ${RUN_STATUS[run.status] ?? run.status}${run.found ? ` (${run.found} titoli trovati)` : ""}`
    : "Nessuna passata completa ancora";

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Aggiornamento</p>
        <div
          role="group"
          aria-label={`Aggiornamento di ${name}`}
          className="flex gap-1 rounded-full bg-white/[0.06] p-1"
        >
          {(
            [
              ["AUTO", "Automatico"],
              ["MANUAL", "Manuale"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => edit({ mode })}
              aria-pressed={value.mode === mode}
              className="focusable pill-focus h-9 rounded-full px-4 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {value.mode === "AUTO" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-faint">
              Passata completa ogni giorno alle
            </span>
            <input
              type="time"
              value={value.at}
              onChange={(e) => e.target.value && edit({ at: e.target.value })}
              className="focusable mt-1 block h-11 w-full rounded-xl bg-white/[0.08] px-3 text-base [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="text-sm text-faint">Controllo delle novità</span>
            <select
              value={value.everyHours ?? ""}
              onChange={(e) =>
                edit({
                  everyHours: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="focusable mt-1 block h-11 w-full rounded-xl bg-white/[0.08] px-3 text-base [color-scheme:dark]"
            >
              <option value="">Solo con la passata giornaliera</option>
              {CHECK_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h === 1 ? "Ogni ora" : `Ogni ${h} ore`}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Nessun aggiornamento programmato: il catalogo si aggiorna solo quando
          premi “Aggiorna ora”. I video scaduti si spengono comunque.
        </p>
      )}

      {changed && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => save.mutate(value)}
            disabled={save.isPending}
            className="focusable h-10 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50"
          >
            Salva
          </button>
          <button
            onClick={() => setDraft(null)}
            className="focusable pill-focus h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium"
          >
            Annulla
          </button>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">
        {lastRun}
        {sync.lastCheckAt && ` · ultimo controllo ${when(sync.lastCheckAt)}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sync.running ? (
          <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-sm text-muted">
            Aggiornamento in corso…
          </span>
        ) : confirm ? (
          <>
            <button
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending}
              className="focusable h-10 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50"
            >
              Sì, aggiorna ora
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="focusable pill-focus h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium"
            >
              Annulla
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            disabled={!serviceOn}
            className="focusable pill-focus h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium disabled:opacity-50"
          >
            Aggiorna ora
          </button>
        )}
        {!serviceOn && !sync.running && (
          <span className="text-sm text-faint">
            Riaccendi il servizio per aggiornarlo.
          </span>
        )}
      </div>
      {confirm && (
        <p className="mt-2 text-sm text-muted">
          Rilegge l&apos;elenco completo di {name} e controlla le novità:
          qualche centinaio di richieste, al solito ritmo di una al secondo.
        </p>
      )}
      {(save.error || runNow.error) && (
        <div className="mt-3">
          <Notice>{(save.error ?? runNow.error)!.message}</Notice>
        </div>
      )}
    </div>
  );
}
