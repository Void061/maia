"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/avatar";
import { PencilIcon, PlusIcon } from "@/components/icons";
import Logo from "@/components/logo";
import { ProfileDialog, ProfileForm } from "@/components/profile-editor";
import { Button } from "@/components/ui";
import { useMe, useProfileMutations } from "@/lib/account";
import type { Profile } from "@/lib/api";
import { apps } from "@/lib/mock";
import { selectProfile } from "@/lib/session";

const MAX_PROFILES = 5;

// "Chi sta guardando?": the account's profiles. With no profile yet the user
// goes through the welcome guide first. "Gestisci profili" switches to edit mode.
export default function ProfilePicker() {
  const router = useRouter();
  const { data: me } = useMe();
  const { update } = useProfileMutations();
  const first = useRef<HTMLButtonElement>(null);
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);

  const profiles = me?.profiles;
  useEffect(() => {
    if (profiles && profiles.length === 0) router.replace("/benvenuto");
  }, [profiles, router]);

  // On a TV the remote should be ready to move straight away.
  useEffect(() => {
    if (profiles?.length) first.current?.focus();
  }, [profiles?.length]);

  function enter(p: Profile) {
    if (managing) {
      setEditing(p);
      return;
    }
    selectProfile(p.id);
    // Reopen the profile's last app; with a single enabled app there is nothing to choose.
    const enabled = apps.filter((a) => a.enabled);
    const app = enabled.find((a) => a.key === p.lastAppKey) ?? enabled[0];
    if (p.lastAppKey !== app.key) update.mutate({ id: p.id, lastAppKey: app.key });
    router.push(app.href);
  }

  return (
    <main className="night flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="absolute left-6 top-8 sm:left-12">
        <Logo size="sm" />
      </div>
      <h1 className="text-center font-display text-4xl font-bold sm:text-5xl">
        {managing ? "Gestisci profili" : "Chi sta guardando?"}
      </h1>
      {!profiles ? (
        <p className="mt-14 text-muted" role="status">
          Caricamento…
        </p>
      ) : (
        <ul className="mt-14 flex flex-wrap justify-center gap-8 sm:gap-12">
          {profiles.map((p, i) => (
            <li key={p.id}>
              <button
                ref={i === 0 ? first : undefined}
                onClick={() => enter(p)}
                aria-label={managing ? `Modifica ${p.name}` : p.name}
                className="group flex flex-col items-center gap-4 rounded-full outline-none"
              >
                <span className="focusable lift relative block rounded-full group-hover:scale-[1.08] group-focus-visible:scale-[1.08] group-focus-visible:shadow-[0_0_0_3px_white,0_30px_60px_-15px_black]">
                  <span className="hidden sm:block">
                    <Avatar profile={p} size={160} hideInitial={managing} />
                  </span>
                  <span className="sm:hidden">
                    <Avatar profile={p} size={96} hideInitial={managing} />
                  </span>
                  {/* Manage mode, Netflix-style: darkened avatar with a pencil, no letter underneath. */}
                  {managing && (
                    <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white [&>svg]:size-8 sm:[&>svg]:size-10">
                      <PencilIcon />
                    </span>
                  )}
                </span>
                <span className="text-lg text-muted transition-colors group-hover:text-label group-focus-visible:text-label sm:text-xl">
                  {p.name}
                </span>
              </button>
            </li>
          ))}
          {profiles.length < MAX_PROFILES && (
            <li>
              <button
                onClick={() => setEditing("new")}
                className="group flex flex-col items-center gap-4 rounded-full outline-none"
              >
                <span className="focusable grid size-24 place-items-center rounded-full bg-surface text-muted group-hover:scale-[1.08] group-focus-visible:scale-[1.08] group-focus-visible:bg-white group-focus-visible:text-black sm:size-40 [&>svg]:size-10">
                  <PlusIcon />
                </span>
                <span className="text-lg text-muted sm:text-xl">Aggiungi</span>
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="mt-16 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={() => setManaging((m) => !m)}>
          {managing ? "Fatto" : "Gestisci profili"}
        </Button>
        {!managing && (
          <Button variant="secondary" onClick={() => router.push("/account")}>
            Account
          </Button>
        )}
      </div>

      {editing && (
        <ProfileDialog title={editing === "new" ? "Nuovo profilo" : `Modifica ${editing.name}`} onClose={() => setEditing(null)}>
          <ProfileForm
            profile={editing === "new" ? undefined : editing}
            submitLabel={editing === "new" ? "Crea profilo" : "Salva"}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </ProfileDialog>
      )}
    </main>
  );
}
