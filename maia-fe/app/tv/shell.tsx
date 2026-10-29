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
import Logo from "@/components/logo";
import { apps, profiles } from "@/lib/mock";
import { rememberApp, useProfile } from "@/lib/session";

const nav = [
  { href: "/tv", label: "Home", Icon: HomeIcon },
  { href: "/tv/live", label: "Live", Icon: LiveIcon },
  { href: "/tv/film", label: "Film", Icon: FilmIcon },
  { href: "/tv/serie", label: "Serie", Icon: SeriesIcon },
];

const appGlyph: Record<string, () => React.JSX.Element> = { tv: TvGlyph, casa: HouseGlyph };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile() ?? profiles[0];
  const [layer, setLayer] = useState<"apps" | "profile" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // The real rule: show the switcher only with more than one enabled app.
  // The prototype lists "Casa" (disabled) too, to show where future apps go.
  const multipleApps = apps.length > 1;
  const isActive = (href: string) => (href === "/tv" ? pathname === "/tv" : pathname.startsWith(href));

  // The bar is clear over the hero and turns to glass once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-dvh">
      <header
        className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
          scrolled ? "bg-black/85 backdrop-blur-xl" : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-10 md:h-20">
          <button
            onClick={() => multipleApps && setLayer("apps")}
            className="focusable flex items-center gap-2 rounded-full px-3 py-1.5"
            aria-label="MAIA TV, cambia app"
          >
            <Logo size="sm" />
            <span className="font-display text-2xl font-bold">TV</span>
          </button>

          {/* Tabs: TV, desktop, tablet. */}
          <nav aria-label="Menu principale" className="glass hidden items-center gap-1 rounded-full p-1.5 md:flex">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className="focusable pill-focus rounded-full px-5 py-2 text-base font-medium text-muted aria-[current=page]:bg-white/15 aria-[current=page]:text-label"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/tv/cerca"
              aria-label="Cerca"
              aria-current={isActive("/tv/cerca") ? "page" : undefined}
              className="focusable pill-focus hidden size-11 place-items-center rounded-full text-label md:grid"
            >
              <SearchIcon />
            </Link>
            <button onClick={() => setLayer("profile")} className="focusable rounded-full" aria-label={`Profilo: ${profile.name}`}>
              <Avatar profile={profile} size={40} />
            </button>
          </div>
        </div>
      </header>

      {/* Phone: iOS-style tab bar. */}
      <nav
        aria-label="Menu principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {[...nav, { href: "/tv/cerca", label: "Cerca", Icon: SearchIcon }].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className="flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted aria-[current=page]:text-white"
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>

      <main className="pb-24 md:pb-0">{children}</main>

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div
        ref={ref}
        data-focus-trap
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-t-[2rem] p-6 md:rounded-[2rem] md:p-8"
      >
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function AppSwitcher({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <Layer title="Le tue app" onClose={onClose}>
      <ul className="grid gap-2">
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
                className="focusable pill-focus group flex w-full items-center gap-4 rounded-2xl p-3 text-left disabled:opacity-40"
              >
                <span
                  className={`grid size-12 place-items-center rounded-xl ${
                    a.enabled ? "bg-gradient-to-br from-brand to-brand-2 text-white" : "bg-raised text-muted"
                  }`}
                >
                  <Glyph />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{a.name}</span>
                  <span className="block text-muted group-focus-visible:text-black/60">{a.description}</span>
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
  const item = "focusable pill-focus block w-full rounded-2xl px-4 py-3.5 text-left text-lg";
  return (
    <Layer title={profile.name} onClose={onClose}>
      <div className="grid gap-1">
        <Link href="/profili" className={item}>
          Cambia profilo
        </Link>
        <button className={item}>Impostazioni account</button>
        <Link href="/login" className={`${item} text-muted`}>
          Esci
        </Link>
      </div>
    </Layer>
  );
}
