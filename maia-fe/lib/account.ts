"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ApiError, type Account, type Profile } from "./api";

export const ME = ["me"] as const;

// The signed-in account with its profiles. Without a session it sends the
// user back to the login (the proxy already blocks most of these cases).
const SESSION_CHECK_MS = 60_000;

export function useMe() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ME,
    queryFn: () => api<Account>("/me"),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    // Also how a device left alone finds out it was disconnected from another one.
    refetchInterval: SESSION_CHECK_MS,
  });
  const expired = query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (expired) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
  }, [expired, router]);
  return query;
}

export function useProfileMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ME });
  return {
    create: useMutation({
      mutationFn: (p: { name: string; hue: number }) => api<Profile>("/profiles", { method: "POST", body: p }),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, ...p }: { id: string; name?: string; hue?: number; lastAppKey?: string }) =>
        api<Profile>(`/profiles/${id}`, { method: "PATCH", body: p }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/profiles/${id}`, { method: "DELETE" }),
      onSuccess: done,
    }),
  };
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSettled: () => {
      qc.clear();
      router.replace("/login");
    },
  });
}

// Avatar colours offered when creating or editing a profile.
export const PROFILE_HUES = [38, 330, 200, 145, 268, 10, 175, 55];
