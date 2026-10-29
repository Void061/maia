"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Avatar from "@/components/avatar";
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lamp/[0.07] blur-[140px]"
      />
      <div className="absolute left-6 top-8 sm:left-12">
        <Logo size="sm" />
      </div>
      <h1 className="relative text-center font-display text-4xl font-semibold sm:text-6xl">Chi guarda?</h1>
      <ul className="relative mt-12 flex flex-wrap justify-center gap-6 sm:gap-10">
        {profiles.map((p, i) => (
          <li key={p.id}>
            <button
              ref={i === 0 ? first : undefined}
              onClick={() => enter(p.id)}
              className="lamp lamp-lift group flex flex-col items-center gap-4 rounded-[2rem] p-3"
            >
              <span className="hidden sm:block">
                <Avatar profile={p} size={150} />
              </span>
              <span className="sm:hidden">
                <Avatar profile={p} size={104} />
              </span>
              <span className="text-xl text-moon group-hover:text-paper group-focus-visible:text-paper">
                {p.name}
              </span>
            </button>
          </li>
        ))}
        {profiles.length < MAX_PROFILES && (
          <li>
            <button className="lamp lamp-lift group flex flex-col items-center gap-4 rounded-[2rem] p-3">
              <span className="grid size-[104px] place-items-center rounded-[28%] border-2 border-dashed border-line text-5xl text-moon sm:size-[150px]">
                +
              </span>
              <span className="text-xl text-moon">Aggiungi</span>
            </button>
          </li>
        )}
      </ul>
      <button className="lamp relative mt-14 rounded-xl border border-line px-6 py-3 text-lg text-moon hover:text-paper">
        Gestisci profili
      </button>
    </main>
  );
}
