"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/avatar";
import { Button, Field, Notice } from "@/components/ui";
import { PROFILE_HUES, useProfileMutations } from "@/lib/account";
import type { Profile } from "@/lib/api";

// Create or edit a profile: name and avatar colour; deleting is offered when
// editing. Used as a dialog on "Chi sta guardando?" and inline in the onboarding.
export function ProfileForm({
  profile,
  defaultName = "",
  submitLabel,
  onDone,
  onCancel,
}: {
  profile?: Profile;
  defaultName?: string;
  submitLabel: string;
  onDone: (p?: Profile) => void;
  onCancel?: () => void;
}) {
  const { create, update, remove } = useProfileMutations();
  const [name, setName] = useState(profile?.name ?? defaultName);
  const [hue, setHue] = useState(profile?.hue ?? PROFILE_HUES[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = profile ? update : create;
  const error = save.error ?? remove.error;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (profile) update.mutate({ id: profile.id, name, hue }, { onSuccess: (p) => onDone(p) });
        else create.mutate({ name, hue }, { onSuccess: (p) => onDone(p) });
      }}
    >
      <div className="flex justify-center">
        <Avatar profile={{ name: name || "?", hue }} size={112} />
      </div>
      <div className="mt-6">
        <Field label="Nome del profilo" name="name" value={name} onChange={setName} required maxLength={20} />
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-muted">Colore</legend>
        <div className="flex flex-wrap gap-3">
          {PROFILE_HUES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHue(h)}
              aria-label={`Colore ${h}`}
              aria-pressed={hue === h}
              className="focusable size-11 rounded-full ring-white ring-offset-2 ring-offset-surface aria-pressed:ring-2"
              style={{ background: `linear-gradient(160deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 60% 38%))` }}
            />
          ))}
        </div>
      </fieldset>
      {error && (
        <div className="mt-5">
          <Notice>{error.message}</Notice>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvataggio…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Annulla
          </Button>
        )}
        {profile &&
          (confirmDelete ? (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(profile.id, { onSuccess: () => onDone() })}
            >
              {remove.isPending ? "Eliminazione…" : `Sì, elimina ${profile.name}`}
            </Button>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              Elimina profilo
            </Button>
          ))}
      </div>
    </form>
  );
}

// Modal wrapper: traps the remote's arrows inside and closes with Back/Esc.
export function ProfileDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center" onClick={onClose}>
      <div
        ref={ref}
        data-focus-trap
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-surface p-6 sm:rounded-[2rem] sm:p-8"
      >
        <h2 className="text-center font-display text-2xl font-bold">{title}</h2>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
