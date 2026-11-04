"use client";

import { useSyncExternalStore } from "react";
import type { Profile } from "./api";
import { useMe } from "./account";

// The profile chosen on this device lives in localStorage (each device can be
// on a different profile of the same account). Profiles themselves come from
// maia-be via useMe().

const PROFILE_KEY = "maia.profile";
const EMAIL_KEY = "maia.pendingEmail";
const listeners = new Set<() => void>();

function read(key: string, storage: "local" | "session" = "local") {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null, storage: "local" | "session" = "local") {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const selectProfile = (id: string | null) => write(PROFILE_KEY, id);

// Where a login lands: the page that sent to the login, or the profiles.
export function afterLogin() {
  const next = new URLSearchParams(location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/profiles";
}

export function useSelectedProfileId() {
  return useSyncExternalStore(subscribe, () => read(PROFILE_KEY), () => null);
}

// The current profile, if the stored id still belongs to the account.
export function useProfile(): Profile | null {
  const { data } = useMe();
  const id = useSelectedProfileId();
  return data?.profiles.find((p) => p.id === id) ?? null;
}

// Email typed at sign-up/login, so "Rimanda l'email" knows where to send it
// without putting the address in the URL.
export const rememberPendingEmail = (email: string) => write(EMAIL_KEY, email, "session");
export const pendingEmail = () => read(EMAIL_KEY, "session");
export const usePendingEmail = () => useSyncExternalStore(subscribe, () => pendingEmail() ?? "", () => "");
