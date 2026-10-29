"use client";

import { useSyncExternalStore } from "react";
import { profiles, type Profile } from "./mock";

// Prototype-only session: the chosen profile and last app live in
// localStorage. Real auth comes from maia-be.

const PROFILE_KEY = "maia.profile";
const APP_KEY = "maia.lastApp";
const listeners = new Set<() => void>();

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProfile(): Profile | null {
  const id = useSyncExternalStore(subscribe, () => read(PROFILE_KEY), () => null);
  return profiles.find((p) => p.id === id) ?? null;
}

export const selectProfile = (id: string) => write(PROFILE_KEY, id);
export const lastApp = () => read(APP_KEY);
export const rememberApp = (key: string) => write(APP_KEY, key);
