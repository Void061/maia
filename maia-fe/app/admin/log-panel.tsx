"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

type Log = components["schemas"]["ActivityLogDto"];
type LogEvent = components["schemas"]["ActivityEventDto"];
type Source = components["schemas"]["SourceLiveDto"];
type Filter = "all" | "created" | "updated" | "unchanged" | "errors";

const FILTERS: [Filter, string][] = [
  ["all", "Tutto"],
  ["created", "Nuovi"],
  ["updated", "Modificati"],
  ["unchanged", "Invariati"],
  ["errors", "Errori"],
];

const EMPTY: Record<Filter, string> = {
  all: "Niente nell’ultima settimana.",
  created: "Nessun titolo nuovo nell’ultima settimana.",
  updated: "Nessun titolo modificato nell’ultima settimana.",
  unchanged: "Nessun titolo invariato nell’ultima settimana.",
  errors: "Nessun errore nell’ultima settimana.",
};

const TITLE_KINDS: Record<string, { label: string; tone: string }> = {
  created: { label: "Nuovo", tone: "bg-[#18301f] text-[#7ee2a0]" },
  updated: { label: "Modificato", tone: "bg-[#1b2740] text-[#9cc2ff]" },
  unchanged: { label: "Invariato", tone: "bg-white/[0.08] text-faint" },
  missing: { label: "Tolto dal servizio", tone: "bg-[#3a311a] text-[#ffd98a]" },
  failed: { label: "Errore", tone: "bg-[#3a1d1d] text-[#ffb4b4]" },
};

const PASS_TONE: Record<string, string> = {
  "pass-done": "text-[#7ee2a0]",
  "pass-aborted": "text-[#ffd98a]",
  "pass-failed": "text-[#ffb4b4]",
};

const SWITCHED_OFF = "service switched off";

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Today: just the time; older: day and time.
const stamp = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : when(iso);
};

// A full pass, a check or how it ended, in words.
function passText(e: LogEvent) {
  const what = e.message?.startsWith("fill")
    ? "Riempimento completo"
    : "Passata completa";
  switch (e.kind) {
    case "pass-queued":
      return `“Aggiorna ora” premuto${e.message ? ` da ${e.message}` : ""}`;
    case "pass-cancelled":
      return `Passata tolta dalla coda${e.message ? ` da ${e.message}` : ""}`;
    case "pass-start":
      return `${what} iniziata`;
    case "pass-done":
      return `${what} finita${e.found != null ? `: ${e.found} titoli trovati` : ""}, ${e.queued ?? 0} in coda`;
    case "pass-aborted":
      return `${what} annullata: l’elenco sembrava incompleto`;
    case "pass-failed":
      return e.message?.includes(SWITCHED_OFF)
        ? "Passata saltata: servizio spento"
        : `${what} non riuscita`;
    case "check":
      return `Controllo novità: ${e.queued ?? 0} titoli in coda`;
    default:
      return e.kind;
  }
}

// Admin "Log" tab: one log for every catalog source. On top what the worker is
// doing right now, below what happened in the last week, newest first, with a
// single filter by outcome and an optional source.
export default function LogPanel({ enabled }: { enabled: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState("");
  const feed = useInfiniteQuery({
    queryKey: ["admin", "log", filter, source],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter });
      if (source) params.set("source", source);
      if (pageParam) params.set("before", String(pageParam));
      return api<Log>(`/admin/services/activity?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.more ? last.events[last.events.length - 1]?.id : undefined,
    refetchInterval: 5_000,
    enabled,
  });
  const live = feed.data?.pages[0];
  const events = feed.data?.pages.flatMap((p) => p.events) ?? [];
  const names = new Map(live?.sources.map((s) => [s.id, s.name]));

  return (
    <section className="mt-6">
      {live && <Now worker={live.worker} sources={live.sources} />}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Cosa mostrare"
          className="rail -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
        >
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className="focusable pill-focus h-10 shrink-0 rounded-full bg-white/10 px-4 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
            >
              {label}
            </button>
          ))}
        </div>
        {/* Pills like the filters, not a native select (its arrow looked squashed on phones). */}
        {live && live.sources.length > 1 && (
          <div
            role="group"
            aria-label="Fonte"
            className="rail -mx-4 flex gap-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
          >
            <div className="flex shrink-0 gap-1 rounded-full bg-white/[0.06] p-1">
              {[{ id: "", name: "Tutte le fonti" }, ...live.sources].map((s) => (
                <button
                  key={s.id || "all"}
                  onClick={() => setSource(s.id)}
                  aria-pressed={source === s.id}
                  className="focusable pill-focus h-8 shrink-0 rounded-full px-3 text-sm font-medium text-muted aria-pressed:bg-white/15 aria-pressed:text-label"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {feed.error && (
        <div className="mt-4">
          <Notice>{feed.error.message}</Notice>
        </div>
      )}

      {!feed.data ? (
        <p className="mt-6 text-muted" role="status">
          Caricamento…
        </p>
      ) : !events.length ? (
        <p className="mt-6 text-muted">{EMPTY[filter]}</p>
      ) : (
        <ol className="mt-4 overflow-hidden rounded-3xl bg-surface text-sm">
          {events.map((e) => {
            const title = TITLE_KINDS[e.kind];
            const detail =
              e.message &&
              (e.kind === "failed" ||
                (e.kind === "pass-failed" && !e.message.includes(SWITCHED_OFF)));
            return (
              <li
                key={e.id}
                className="flex gap-3 border-b border-white/[0.06] px-4 py-2.5 last:border-0"
              >
                <time
                  dateTime={e.at}
                  className="w-[4.5rem] shrink-0 tabular-nums text-faint sm:w-24"
                >
                  {stamp(e.at)}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    {title ? (
                      <>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${title.tone}`}
                        >
                          {title.label}
                        </span>
                        <span className="truncate">
                          {e.name ?? <span className="font-mono">{e.externalId}</span>}
                        </span>
                      </>
                    ) : (
                      <span className={`font-medium ${PASS_TONE[e.kind] ?? "text-muted"}`}>
                        {passText(e)}
                      </span>
                    )}
                  </p>
                  {detail && (
                    <p className="mt-0.5 font-mono text-xs break-words text-faint">
                      {e.message}
                    </p>
                  )}
                </div>
                {!source && (
                  <span className="hidden shrink-0 text-faint sm:block">
                    {names.get(e.source) ?? e.source}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {feed.hasNextPage && (
        <button
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="focusable pill-focus mt-4 h-10 rounded-full bg-white/[0.12] px-4 text-sm font-medium disabled:opacity-50"
        >
          Mostra altri
        </button>
      )}
    </section>
  );
}

// What is happening right now: the worker, then each source that has something
// in progress or waiting.
function Now({ worker, sources }: { worker: Log["worker"]; sources: Source[] }) {
  const busy = sources.filter(
    (s) => s.pass || s.queued || s.retrying || s.stalled || s.active.length,
  );
  return (
    <div className="grid gap-2 rounded-3xl bg-surface p-4 text-sm sm:p-5" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold">
        <Dot tone={worker.online ? "on" : "off"} />
        {worker.online
          ? `Worker acceso${worker.startedAt ? ` dalle ${stamp(worker.startedAt)}` : ""}`
          : "Worker spento: niente viene letto finché non viene avviato"}
      </p>
      {busy.length === 0 ? (
        <p className="text-muted">Niente in coda.</p>
      ) : (
        busy.map((s) => (
          <div key={s.id} className="border-t border-white/[0.06] pt-2">
            <p className="font-semibold">{s.name}</p>
            {s.pass && (
              <p className="text-muted">
                {s.pass.state === "running"
                  ? `Passata completa in corso dalle ${stamp(s.pass.since)}`
                  : s.pass.state === "retry"
                    ? "Passata completa da riprovare dopo un errore"
                    : `Passata completa in coda dalle ${stamp(s.pass.since)}${worker.online ? "" : ", non ancora partita"}`}
              </p>
            )}
            {(s.queued > 0 || s.retrying > 0 || s.stalled > 0) && (
              <p className="text-muted">
                {[
                  s.queued > 0 && `${s.queued} titoli in coda`,
                  s.retrying > 0 && `${s.retrying} da riprovare`,
                  s.stalled > 0 && `${s.stalled} rimasti a metà`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {s.active.map((a) => (
              <p key={a.externalId} className="flex items-center gap-2">
                <Dot tone="busy" />
                <span className="truncate">
                  Sto leggendo {a.name ?? <span className="font-mono">{a.externalId}</span>}
                </span>
              </p>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function Dot({ tone }: { tone: "on" | "off" | "busy" }) {
  const look = {
    on: "bg-[#30d158]",
    off: "bg-[#ff6b6b]",
    busy: "animate-pulse bg-[#30d158]",
  }[tone];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${look}`} />;
}
