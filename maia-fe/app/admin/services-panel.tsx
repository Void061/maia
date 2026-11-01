"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

export type Service = components["schemas"]["AdminServiceDto"];
type Sync = components["schemas"]["SyncInfoDto"];
type Activity = components["schemas"]["ActivityDto"];
type ActivityEvent = components["schemas"]["ActivityEventDto"];
type ActivityFilter = "changes" | "all" | "errors";
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
              {s.baseUrl && (
                <AddressSection
                  id={s.id}
                  name={s.name}
                  current={s.baseUrl}
                  fallback={s.defaultBaseUrl ?? null}
                />
              )}
              {s.sync && (
                <SyncSection
                  id={s.id}
                  name={s.name}
                  sync={s.sync}
                  serviceOn={s.enabled}
                />
              )}
              {s.sync && <ActivitySection id={s.id} name={s.name} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The address a catalog source is read from (e.g. the home server's IP). The
// links already saved move to the new address; nothing is re-read.
function AddressSection({
  id,
  name,
  current,
  fallback,
}: {
  id: string;
  name: string;
  current: string;
  fallback: string | null;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(current);
  const save = useMutation({
    mutationFn: (baseUrl: string | null) =>
      api<{ baseUrl: string; moved: number }>(`/admin/services/${id}/base-url`, {
        method: "PATCH",
        body: { baseUrl },
      }),
    onSuccess: (res) => {
      setDraft(res.baseUrl);
      return qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });
  const changed = draft.trim() !== current;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <label className="block">
        <span className="font-semibold">Indirizzo</span>
        <input
          type="url"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Indirizzo di ${name}`}
          className="focusable mt-2 block h-11 w-full rounded-xl bg-white/[0.08] px-3 font-mono text-base [color-scheme:dark]"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {changed && (
          <>
            <button
              onClick={() => save.mutate(draft.trim())}
              disabled={save.isPending || !draft.trim()}
              className="focusable h-10 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50"
            >
              Salva
            </button>
            <button
              onClick={() => setDraft(current)}
              className="focusable pill-focus h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium"
            >
              Annulla
            </button>
          </>
        )}
        {!changed && fallback && current !== fallback && (
          <button
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
            className="focusable pill-focus h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium disabled:opacity-50"
          >
            Torna a {fallback}
          </button>
        )}
        <span className="text-sm text-faint">
          {save.data
            ? `Salvato${save.data.moved ? `: ${save.data.moved} link spostati sul nuovo indirizzo` : ""}.`
            : "Cambiandolo, i video e le immagini già nel catalogo passano al nuovo indirizzo."}
        </span>
      </div>
      {save.error && (
        <div className="mt-3">
          <Notice>{save.error.message}</Notice>
        </div>
      )}
    </div>
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
            Passata completa in coda o in corso: dettagli in Attività
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

const FILTERS: [ActivityFilter, string][] = [
  ["changes", "Modifiche"],
  ["all", "Tutto"],
  ["errors", "Solo errori"],
];

const TITLE_KINDS: Record<string, { label: string; tone: string }> = {
  created: { label: "Nuovo", tone: "bg-[#18301f] text-[#7ee2a0]" },
  updated: { label: "Aggiornato", tone: "bg-[#1b2740] text-[#9cc2ff]" },
  unchanged: { label: "Invariato", tone: "bg-white/[0.08] text-faint" },
  missing: { label: "Non più sul servizio", tone: "bg-[#3a311a] text-[#ffd98a]" },
  failed: { label: "Errore", tone: "bg-[#3a1d1d] text-[#ffb4b4]" },
};

const PASS_TONE: Record<string, string> = {
  "pass-queued": "text-muted",
  "pass-start": "text-muted",
  "pass-done": "text-[#7ee2a0]",
  "pass-aborted": "text-[#ffd98a]",
  "pass-failed": "text-[#ffb4b4]",
  check: "text-muted",
};

const SWITCHED_OFF = "service switched off";

// Today: just the time, to the second; older: day and time.
const stamp = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("it-IT")
    : when(iso);
};

// A full pass, a check or how it ended, in words.
function passText(e: ActivityEvent) {
  const what = e.message?.startsWith("fill")
    ? "Riempimento completo"
    : "Passata completa";
  switch (e.kind) {
    case "pass-queued":
      return `“Aggiorna ora” premuto${e.message ? ` da ${e.message}` : ""}: passata completa in coda`;
    case "pass-start":
      return `${what} iniziata: lettura dell’elenco del servizio`;
    case "pass-done":
      return `${what} finita${e.found != null ? `: ${e.found} titoli trovati` : ""}, ${e.queued ?? 0} in coda`;
    case "pass-aborted":
      return `${what} annullata: l’elenco sembrava incompleto${e.found != null ? ` (${e.found} titoli)` : ""}`;
    case "pass-failed":
      return e.message?.includes(SWITCHED_OFF)
        ? "Passata saltata: servizio spento"
        : `${what} non riuscita`;
    case "check":
      return `Controllo delle novità: ${e.queued ?? 0} titoli in coda`;
    default:
      return e.kind;
  }
}

// What the catalog worker is doing for this source (titles being read, queue)
// and what it did in the last week, newest first. Refreshes on its own.
function ActivitySection({ id, name }: { id: string; name: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("changes");
  const feed = useInfiniteQuery({
    queryKey: ["admin", "services", id, "activity", filter],
    queryFn: ({ pageParam }) =>
      api<Activity>(
        `/admin/services/${id}/activity?filter=${filter}${pageParam ? `&before=${pageParam}` : ""}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.more ? last.events[last.events.length - 1]?.id : undefined,
    refetchInterval: 5_000,
  });
  const live = feed.data?.pages[0];
  const events = feed.data?.pages.flatMap((p) => p.events) ?? [];
  const waiting = live ? live.queued + live.retrying + live.stalled : 0;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">Attività</p>
        <div
          role="group"
          aria-label={`Attività di ${name}: cosa mostrare`}
          className="flex gap-1 rounded-full bg-white/[0.06] p-1"
        >
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className="focusable pill-focus h-9 rounded-full px-4 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {live && (
        <div className="mt-3 grid gap-1 text-sm" aria-live="polite">
          <p className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${live.worker.online ? "bg-[#30d158]" : "bg-[#ff6b6b]"}`}
            />
            {live.worker.online ? (
              <span className="text-muted">
                Worker acceso
                {live.worker.startedAt &&
                  ` dalle ${stamp(live.worker.startedAt)}`}
              </span>
            ) : (
              <span className="text-[#ffb4b4]">
                Worker spento: la coda resta ferma finché non viene avviato
                {live.worker.seenAt &&
                  ` (ultimo segnale ${stamp(live.worker.seenAt)})`}
                .
              </span>
            )}
          </p>

          {live.pass && (
            <p className="flex items-center gap-2">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${live.pass.state === "running" ? "animate-pulse bg-[#30d158]" : "bg-[#ffd98a]"}`}
              />
              <span>
                {live.pass.state === "running"
                  ? `Passata completa in corso dalle ${stamp(live.pass.since)}: sto leggendo l’elenco di ${name}`
                  : live.pass.state === "retry"
                    ? `Passata completa non riuscita, verrà riprovata (in coda dalle ${stamp(live.pass.since)})`
                    : live.worker.online
                      ? `Passata completa in partenza (in coda dalle ${stamp(live.pass.since)})`
                      : `Passata completa in attesa del worker: in coda dalle ${stamp(live.pass.since)}, non è ancora partita`}
              </span>
            </p>
          )}

          <p className="text-muted">
            {waiting > 0 ? (
              <>
                {live.queued} titoli in coda
                {live.retrying > 0 &&
                  ` · ${live.retrying} da riprovare dopo un errore`}
                {live.stalled > 0 &&
                  ` · ${live.stalled} rimasti a metà dall’ultimo worker (ripartono quando lo riavvii)`}
              </>
            ) : (
              !live.active.length && "Nessun titolo in coda."
            )}
          </p>

          {live.active.length > 0 ? (
            <ul className="grid gap-0.5">
              {live.active.map((a) => (
                <li key={a.externalId} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 animate-pulse rounded-full bg-[#30d158]"
                  />
                  <span className="truncate">
                    Sto leggendo{" "}
                    {a.name ?? (
                      <span className="font-mono">{a.externalId}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            live.worker.online &&
            live.queued + live.retrying > 0 && (
              <p className="text-faint">
                Nessun titolo in lettura: il servizio è spento o in pausa.
              </p>
            )
          )}
        </div>
      )}

      {feed.error && (
        <div className="mt-3">
          <Notice>{feed.error.message}</Notice>
        </div>
      )}

      {feed.data && !events.length ? (
        <p className="mt-3 text-sm text-faint">
          {filter === "errors"
            ? "Nessun errore nell’ultima settimana."
            : "Niente nell’ultima settimana."}
        </p>
      ) : (
        <ol className="mt-3 max-h-96 overflow-y-auto rounded-2xl bg-white/[0.04] text-sm">
          {events.map((e) => {
            const title = TITLE_KINDS[e.kind];
            const detail =
              e.message &&
              (e.kind === "failed" ||
                (e.kind === "pass-failed" && !e.message.includes(SWITCHED_OFF)));
            return (
              <li
                key={e.id}
                className="flex gap-3 border-b border-white/[0.06] px-3 py-2 last:border-0"
              >
                <time
                  dateTime={e.at}
                  className="w-24 shrink-0 tabular-nums text-faint"
                >
                  {stamp(e.at)}
                </time>
                <div className="min-w-0 flex-1">
                  {title ? (
                    <p className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${title.tone}`}
                      >
                        {title.label}
                      </span>
                      <span className="truncate">
                        {e.name ?? (
                          <span className="font-mono">{e.externalId}</span>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className={`font-medium ${PASS_TONE[e.kind] ?? ""}`}>
                      {passText(e)}
                    </p>
                  )}
                  {detail && (
                    <p className="mt-0.5 font-mono text-xs break-words text-faint">
                      {e.message}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {feed.hasNextPage && (
        <button
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="focusable pill-focus mt-3 h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium disabled:opacity-50"
        >
          Mostra altri
        </button>
      )}
    </div>
  );
}
