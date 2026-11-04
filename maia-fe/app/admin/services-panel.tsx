"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { api, type components } from "@/lib/api";

export type Service = components["schemas"]["AdminServiceDto"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// On/off switch per outside service (the streaming source, TMDB). Off = MAIA
// sends that service no request at all, within seconds.
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
        Spegnendo un servizio MAIA smette subito di contattarlo.
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
          return (
            <li
              key={s.id}
              className={`rounded-3xl bg-surface p-4 sm:p-5 ${on ? "" : "ring-2 ring-[#ff6b6b]/60"}`}
            >
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{s.name}</p>
                  <p className="text-sm text-faint">{s.role}</p>
                  {!s.enabled && (
                    <p className="mt-1 text-sm text-[#ffb4b4]">
                      Spento{s.switchedAt ? ` il ${when(s.switchedAt)}` : ""}
                      {s.switchedBy ? ` da ${s.switchedBy}` : ""}
                    </p>
                  )}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The address of the streaming source (e.g. the home server's IP).
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
    mutationFn: (url: string | null) =>
      api<{ baseUrl: string }>(`/admin/services/${id}/base-url`, {
        method: "PATCH",
        body: { baseUrl: url },
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
          {save.data ? "Salvato." : "Il server da cui partono i video."}
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
