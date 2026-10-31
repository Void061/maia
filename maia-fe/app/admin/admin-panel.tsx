"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/avatar";
import { BackIcon, SearchIcon } from "@/components/icons";
import Logo from "@/components/logo";
import { Notice } from "@/components/ui";
import { useMe } from "@/lib/account";
import { api, type components } from "@/lib/api";
import ServicesPanel, { type Service } from "./services-panel";

type AdminAccount = components["schemas"]["AdminAccountDto"];
type Accounts = components["schemas"]["AdminAccountsDto"];
type Status = AdminAccount["status"];

const FILTERS: { key: Status | "ALL"; label: string }[] = [
  { key: "PENDING_APPROVAL", label: "Da approvare" },
  { key: "PENDING_EMAIL", label: "Email da confermare" },
  { key: "ACTIVE", label: "Attivi" },
  { key: "SUSPENDED", label: "Sospesi" },
  { key: "ALL", label: "Tutti" },
];

const STATUS_LABEL: Record<Status, string> = {
  PENDING_EMAIL: "Email da confermare",
  PENDING_APPROVAL: "Da approvare",
  ACTIVE: "Attivo",
  SUSPENDED: "Sospeso",
};

const STATUS_TONE: Record<Status, string> = {
  PENDING_EMAIL: "bg-white/10 text-muted",
  PENDING_APPROVAL: "bg-[#3d3216] text-[#ffd98a]",
  ACTIVE: "bg-[#18301f] text-[#a8e6b8]",
  SUSPENDED: "bg-[#3a1d1d] text-[#ffb4b4]",
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// A stable avatar colour from the name, until accounts have their own.
const hueOf = (s: string) =>
  [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

type Tab = "accounts" | "services";

// Admin panel, one tab per area: accounts (by status, search, the actions each
// status allows) and the outside services (on/off switches).
export default function AdminPanel() {
  const router = useRouter();
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>("accounts");
  const [filter, setFilter] = useState<Status | "ALL">("PENDING_APPROVAL");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(id);
  }, [typed]);

  const isAdmin = me?.role === "ADMIN";
  const list = useQuery({
    queryKey: ["admin", "accounts", filter, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      if (q) params.set("q", q);
      return api<Accounts>(`/admin/accounts?${params}`);
    },
    enabled: isAdmin,
    placeholderData: keepPreviousData,
  });
  // Shares the cache with the Servizi tab: its badge counts the services off or paused.
  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<Service[]>("/admin/services"),
    refetchInterval: 10_000,
    enabled: isAdmin,
  });
  const servicesAlert =
    services.data?.filter((s) => !s.enabled || s.status === "DOWN").length ?? 0;
  const counts = list.data?.counts;
  const total = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <main className="night min-h-dvh px-4 pb-20 pt-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Indietro"
            className="focusable pill-focus grid size-11 place-items-center rounded-full"
          >
            <BackIcon />
          </button>
          <Logo size="sm" />
          <span className="size-11" />
        </div>
        <h1 className="mt-8 font-display text-4xl font-bold">
          Amministrazione
        </h1>

        {me && !isAdmin ? (
          <div className="mt-8">
            <Notice>Questa pagina è riservata agli amministratori.</Notice>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Sezioni"
              className="mt-8 flex gap-6 overflow-x-auto border-b border-hairline [scrollbar-width:none]"
            >
              {(
                [
                  {
                    key: "accounts",
                    label: "Account",
                    badge: counts?.PENDING_APPROVAL ?? 0,
                  },
                  { key: "services", label: "Servizi", badge: servicesAlert },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className="focusable -mb-px flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 border-transparent px-1 pb-3 pt-1 text-lg font-semibold text-faint aria-selected:border-white aria-selected:text-label"
                >
                  {t.label}
                  {t.badge > 0 && (
                    <span className="rounded-full bg-[#ffd98a] px-1.5 text-xs font-bold tabular-nums text-black">
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "services" ? (
              <ServicesPanel enabled={isAdmin} />
            ) : (
              <>
                <div className="rail -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
                  {FILTERS.map((f) => {
                    const n = f.key === "ALL" ? total : counts?.[f.key];
                    return (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        aria-pressed={filter === f.key}
                        className="focusable pill-focus flex h-10 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
                      >
                        {f.label}
                        {n !== undefined && (
                          <span
                            className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${
                              f.key === "PENDING_APPROVAL" && n > 0
                                ? "bg-[#ffd98a] text-black"
                                : "bg-black/20"
                            }`}
                          >
                            {n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <label className="relative mt-4 block">
                  <span className="sr-only">Cerca per nome o email</span>
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint">
                    <SearchIcon />
                  </span>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Cerca per nome o email"
                    className="focusable h-12 w-full rounded-xl bg-white/[0.08] pl-12 pr-4 text-base placeholder:text-faint"
                  />
                </label>

                {list.error && (
                  <div className="mt-6">
                    <Notice>{list.error.message}</Notice>
                  </div>
                )}

                {!list.data ? (
                  <p className="mt-8 text-muted" role="status">
                    Caricamento…
                  </p>
                ) : list.data.accounts.length === 0 ? (
                  <p className="mt-10 text-center text-lg text-muted">
                    {q
                      ? `Nessun account corrisponde a “${q}”.`
                      : filter === "PENDING_APPROVAL"
                        ? "Nessun account da approvare."
                        : "Nessun account qui."}
                  </p>
                ) : (
                  <ul
                    className={`mt-6 grid gap-3 transition-opacity ${list.isFetching ? "opacity-70" : ""}`}
                  >
                    {list.data.accounts.map((a) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        self={a.id === me?.id}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function AccountRow({
  account: a,
  self,
}: {
  account: AdminAccount;
  self: boolean;
}) {
  const qc = useQueryClient();
  // Which destructive action is waiting for a second press.
  const [confirm, setConfirm] = useState<
    "reject" | "suspend" | "delete" | null
  >(null);
  const act = useMutation({
    mutationFn: (op: {
      path: string;
      method?: "POST" | "DELETE";
      body?: unknown;
    }) =>
      api(`/admin/accounts/${a.id}${op.path}`, {
        method: op.method ?? "POST",
        body: op.body,
      }),
    onSuccess: () => {
      setConfirm(null);
      return qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
  const run = (path: string, method?: "POST" | "DELETE", body?: unknown) =>
    act.mutate({ path, method, body });
  const busy = act.isPending;

  const meta = [
    `Registrato il ${date(a.createdAt)}`,
    a.emailVerifiedAt ? "email confermata" : "email non confermata",
    `${a.profileCount} ${a.profileCount === 1 ? "profilo" : "profili"}`,
  ].join(" · ");

  return (
    <li className="rounded-3xl bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar profile={{ name: a.name, hue: hueOf(a.email) }} size={48} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-semibold">{a.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[a.status]}`}
              >
                {STATUS_LABEL[a.status]}
              </span>
              {a.role === "ADMIN" && (
                <span className="rounded-full bg-gradient-to-r from-brand to-brand-2 px-2 py-0.5 text-xs font-semibold text-white">
                  Admin
                </span>
              )}
              {self && <span className="text-sm text-faint">(tu)</span>}
            </p>
            <p className="truncate text-muted">{a.email}</p>
            <p className="mt-0.5 text-sm text-faint">{meta}</p>
          </div>
        </div>

        {!self && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {confirm ? (
              <>
                <Small
                  tone="danger"
                  disabled={busy}
                  onClick={() =>
                    confirm === "suspend" ? run("/suspend") : run("", "DELETE")
                  }
                >
                  {confirm === "suspend"
                    ? "Sì, sospendi"
                    : confirm === "reject"
                      ? "Sì, rifiuta"
                      : "Sì, elimina"}
                </Small>
                <Small onClick={() => setConfirm(null)}>Annulla</Small>
              </>
            ) : (
              <>
                {(a.status === "PENDING_APPROVAL" ||
                  a.status === "PENDING_EMAIL") && (
                  <>
                    <Small
                      tone={
                        a.status === "PENDING_APPROVAL" ? "primary" : "neutral"
                      }
                      disabled={busy}
                      onClick={() => run("/approve")}
                    >
                      {a.status === "PENDING_APPROVAL"
                        ? "Approva"
                        : "Approva comunque"}
                    </Small>
                    <Small onClick={() => setConfirm("reject")}>Rifiuta</Small>
                  </>
                )}
                {a.status === "ACTIVE" && (
                  <>
                    <Small
                      disabled={busy}
                      onClick={() =>
                        run("/role", "POST", {
                          role: a.role === "ADMIN" ? "USER" : "ADMIN",
                        })
                      }
                    >
                      {a.role === "ADMIN" ? "Togli admin" : "Rendi admin"}
                    </Small>
                    <Small onClick={() => setConfirm("suspend")}>
                      Sospendi
                    </Small>
                  </>
                )}
                {a.status === "SUSPENDED" && (
                  <>
                    <Small
                      tone="primary"
                      disabled={busy}
                      onClick={() => run("/reactivate")}
                    >
                      Riattiva
                    </Small>
                    <Small onClick={() => setConfirm("delete")}>Elimina</Small>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {confirm && (
        <p className="mt-3 text-sm text-muted">
          {confirm === "suspend"
            ? `${a.name} non potrà più accedere e le sue sessioni verranno chiuse su tutti i dispositivi. Puoi riattivare l'account dopo.`
            : `L'account di ${a.name} e i suoi profili verranno eliminati definitivamente.`}
        </p>
      )}
      {act.error && (
        <div className="mt-3">
          <Notice>{act.error.message}</Notice>
        </div>
      )}
    </li>
  );
}

// Compact pill button for the account rows.
function Small({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "danger";
}) {
  const look = {
    primary: "bg-white text-black font-semibold",
    neutral: "bg-white/[0.12] text-label pill-focus",
    danger: "bg-[#3a1d1d] text-[#ffb4b4] font-semibold pill-focus",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`focusable h-10 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${look}`}
    >
      {children}
    </button>
  );
}
