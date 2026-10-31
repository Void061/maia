"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

export type Service = components["schemas"]["AdminServiceDto"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
      api(`/admin/services/${s.id}`, { method: "POST", body: { enabled: s.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });

  return (
    <section className="mt-6">
      <p className="text-muted">
        Spegnendo un servizio MAIA smette subito di contattarlo. I titoli in coda aspettano e ripartono quando lo riaccendi.
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
              className={`flex items-center gap-4 rounded-3xl bg-surface p-4 sm:p-5 ${on ? "" : "ring-2 ring-[#ff6b6b]/60"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{s.name}</p>
                <p className="text-sm text-faint">{s.role}</p>
                <p className={`mt-1 text-sm ${!s.enabled ? "text-[#ffb4b4]" : s.status === "DOWN" ? "text-[#ffd98a]" : "text-muted"}`}>
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
                  on ? "border-[#30d158] bg-[#30d158]" : "border-white/35 bg-transparent"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-7 rounded-full shadow transition-transform ${on ? "translate-x-7 bg-white" : "bg-white/60"}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
