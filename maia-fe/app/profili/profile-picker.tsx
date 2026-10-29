"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Avatar from "@/components/avatar";
import { PlusIcon } from "@/components/icons";
import Logo from "@/components/logo";
import { apps, profiles } from "@/lib/mock";
import { lastApp, rememberApp, selectProfile } from "@/lib/session";

const MAX_PROFILES = 5;

export default function ProfilePicker() {
  const router = useRouter();
  const first = useRef<HTMLButtonElement>(null);

  // On a TV the remote should be ready to move straight away.
  useEffect(() => first.current?.focus(), []);

  function enter(id: string) {
    selectProfile(id);
    // Reopen the last app used; with a single enabled app there is nothing to choose.
    const enabled = apps.filter((a) => a.enabled);
    const app = enabled.find((a) => a.key === lastApp()) ?? enabled[0];
    rememberApp(app.key);
    router.push(app.href);
  }

  return (
    <main className="night flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="absolute left-6 top-8 sm:left-12">
        <Logo size="sm" />
      </div>
      <h1 className="text-center font-display text-4xl font-bold sm:text-5xl">Chi sta guardando?</h1>
      <ul className="mt-14 flex flex-wrap justify-center gap-8 sm:gap-12">
        {profiles.map((p, i) => (
          <li key={p.id}>
            <button
              ref={i === 0 ? first : undefined}
              onClick={() => enter(p.id)}
              className="group flex flex-col items-center gap-4 rounded-full outline-none"
            >
              {/* The circle itself carries the tvOS lift. */}
              <span className="focusable lift block rounded-full group-focus-visible:scale-[1.08] group-focus-visible:shadow-[0_0_0_3px_white,0_30px_60px_-15px_black] group-hover:scale-[1.08]">
                <span className="hidden sm:block">
                  <Avatar profile={p} size={160} />
                </span>
                <span className="sm:hidden">
                  <Avatar profile={p} size={96} />
                </span>
              </span>
              <span className="text-lg text-muted transition-colors group-hover:text-label group-focus-visible:text-label sm:text-xl">
                {p.name}
              </span>
            </button>
          </li>
        ))}
        {profiles.length < MAX_PROFILES && (
          <li>
            <button className="group flex flex-col items-center gap-4 rounded-full outline-none">
              <span className="focusable grid size-24 place-items-center rounded-full bg-surface text-muted group-hover:scale-[1.08] group-focus-visible:scale-[1.08] group-focus-visible:bg-white group-focus-visible:text-black sm:size-40 [&>svg]:size-10">
                <PlusIcon />
              </span>
              <span className="text-lg text-muted sm:text-xl">Aggiungi</span>
            </button>
          </li>
        )}
      </ul>
      <button className="focusable pill-focus mt-16 h-12 rounded-full px-6 text-lg text-muted">
        Gestisci profili
      </button>
    </main>
  );
}
