"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/avatar";
import {
  FilmIcon,
  HomeIcon,
  HouseGlyph,
  LiveIcon,
  SearchIcon,
  SeriesIcon,
  TvGlyph,
} from "@/components/icons";
import { apps, profiles } from "@/lib/mock";
import { rememberApp, useProfile } from "@/lib/session";

const nav = [
  { href: "/tv", label: "Home", Icon: HomeIcon },
  { href: "/tv/live", label: "Live", Icon: LiveIcon },
  { href: "/tv/film", label: "Film", Icon: FilmIcon },
  { href: "/tv/serie", label: "Serie", Icon: SeriesIcon },
  { href: "/tv/cerca", label: "Cerca", Icon: SearchIcon },
];

const appGlyph: Record<string, () => React.JSX.Element> = { tv: TvGlyph, casa: HouseGlyph };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile() ?? profiles[0];
  const [layer, setLayer] = useState<"apps" | "profile" | null>(null);
  // The real rule: show the switcher only with more than one enabled app.
  // The prototype lists "Casa" (disabled) too, to show where future apps go.
  const multipleApps = apps.length > 1;
  const isActive = (href: string) => (href === "/tv" ? pathname === "/tv" : pathname.startsWith(href));

  return (
    <div className="min-h-dvh">
      {/* Side rail: TV, desktop and tablet. Narrow with icons; labels appear
          while focus or the pointer is inside it. */}
      <nav
        aria-label="Menu principale"
        className="group/rail fixed inset-y-0 left-0 z-30 hidden w-24 flex-col justify-between py-8 transition-[width,background] duration-200 focus-within:w-64 focus-within:bg-ink/95 focus-within:shadow-[40px_0_80px_rgb(18_15_28/0.9)] hover:w-64 hover:bg-ink/95 hover:shadow-[40px_0_80px_rgb(18_15_28/0.9)] md:flex"
      >
        <div className="flex flex-col gap-2 px-4">
          {multipleApps && (
            <button
              onClick={() => setLayer("apps")}
              className="lamp mb-8 flex h-14 items-center gap-4 overflow-hidden rounded-2xl px-4 text-lamp"
              aria-label="Cambia app"
            >
              <TvGlyph />
              <span className="whitespace-nowrap font-display text-lg font-semibold opacity-0 transition-opacity group-focus-within/rail:opacity-100 group-hover/rail:opacity-100">
                MAIA TV
              </span>
            </button>
          )}
          {nav.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className="lamp flex h-14 items-center gap-4 overflow-hidden rounded-2xl px-4 text-moon aria-[current=page]:bg-haze aria-[current=page]:text-paper"
            >
              <Icon />
              <span className="whitespace-nowrap text-lg opacity-0 transition-opacity group-focus-within/rail:opacity-100 group-hover/rail:opacity-100">
                {label}
              </span>
            </Link>
          ))}
        </div>
        <div className="px-4">
          <button
            onClick={() => setLayer("profile")}
            className="lamp flex h-14 items-center gap-4 overflow-hidden rounded-2xl px-2"
            aria-label={`Profilo: ${profile.name}`}
          >
            <Avatar profile={profile} size={40} />
            <span className="whitespace-nowrap text-lg opacity-0 transition-opacity group-focus-within/rail:opacity-100 group-hover/rail:opacity-100">
              {profile.name}
            </span>
          </button>
        </div>
      </nav>

      {/* Phone: top bar with app switcher and avatar, tab bar at the bottom. */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-gradient-to-b from-ink to-ink/0 px-4 pb-6 pt-4 md:hidden">
        <button
          onClick={() => multipleApps && setLayer("apps")}
          className="lamp flex items-center gap-2 rounded-xl px-2 py-1 font-display text-xl font-semibold"
        >
          <span className="text-lamp">
            <TvGlyph />
          </span>
          MAIA TV
        </button>
        <button onClick={() => setLayer("profile")} className="lamp rounded-xl" aria-label="Profilo">
          <Avatar profile={profile} size={36} />
        </button>
      </header>
      <nav
        aria-label="Menu principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/60 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {nav.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className="flex flex-col items-center gap-1 py-2.5 text-xs text-moon aria-[current=page]:text-lamp"
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>

      <main className="pb-24 md:pb-0 md:pl-24">{children}</main>

      {layer === "apps" && <AppSwitcher onClose={() => setLayer(null)} />}
      {layer === "profile" && <ProfileMenu onClose={() => setLayer(null)} />}
    </div>
  );
}

// Modal layer: traps arrow navigation inside itself and closes with Back/Escape.
function Layer({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        ref={ref}
        data-focus-trap
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border border-line bg-dusk p-6 md:rounded-3xl md:p-8"
      >
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function AppSwitcher({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <Layer title="Le tue app" onClose={onClose}>
      <ul className="grid gap-3">
        {apps.map((a) => {
          const Glyph = appGlyph[a.key];
          return (
            <li key={a.key}>
              <button
                disabled={!a.enabled}
                onClick={() => {
                  rememberApp(a.key);
                  onClose();
                  router.push(a.href);
                }}
                className="lamp flex w-full items-center gap-4 rounded-2xl bg-haze/60 p-4 text-left disabled:opacity-45"
              >
                <span className={`grid size-12 place-items-center rounded-xl ${a.enabled ? "bg-lamp text-ink" : "bg-line text-moon"}`}>
                  <Glyph />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{a.name}</span>
                  <span className="block text-moon">{a.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Layer>
  );
}

function ProfileMenu({ onClose }: { onClose: () => void }) {
  const profile = useProfile() ?? profiles[0];
  return (
    <Layer title={profile.name} onClose={onClose}>
      <div className="grid gap-3">
        <Link href="/profili" className="lamp rounded-2xl bg-haze/60 p-4 text-lg">
          Cambia profilo
        </Link>
        <button className="lamp rounded-2xl bg-haze/60 p-4 text-left text-lg">Impostazioni account</button>
        <Link href="/login" className="lamp rounded-2xl p-4 text-lg text-moon">
          Esci
        </Link>
      </div>
    </Layer>
  );
}
