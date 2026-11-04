"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// The trailer inside MAIA, over the title page. The focus stays on Chiudi, out
// of the player: inside it the remote's keys would go to YouTube, and Back
// could not close the layer. YouTube refuses to play without a referrer, so
// this frame alone is exempt from the site's no-referrer rule. On the body: the
// page sits under the top menu, and a layer inside it could not cover the menu.
export default function Trailer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div data-focus-trap role="dialog" aria-label={`Trailer di ${name}`} className="fixed inset-0 z-[70] bg-black">
      <iframe
        src={`${url}?autoplay=1&rel=0&playsinline=1`}
        title={`Trailer di ${name}`}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="size-full border-0"
      />
      <button
        ref={close}
        onClick={onClose}
        className="focusable pill-focus absolute top-4 right-4 h-12 rounded-full bg-white/[0.15] px-6 text-base font-semibold"
      >
        Chiudi
      </button>
    </div>,
    document.body,
  );
}
