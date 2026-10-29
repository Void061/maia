"use client";

import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackIcon, PauseIcon, PlayIcon, SettingsIcon } from "@/components/icons";
import { channels, demoStream, scheduleAround, type Title } from "@/lib/mock";
import { hhmm, useNow } from "@/lib/use-now";

type Props = { title?: Title; live?: { channelId: string } };
type Level = { index: number; height: number };
type Track = { index: number; label: string };

const SPEEDS = [0.75, 1, 1.25, 1.5];
const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export default function Player({ title, live }: Props) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [channelId, setChannelId] = useState(live?.channelId);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1); // -1 = auto
  const [audio, setAudio] = useState<Track[]>([]);
  const [subs, setSubs] = useState<Track[]>([]);
  const [sub, setSub] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [sources, setSources] = useState(() => title?.sources ?? [channels.find((c) => c.id === live?.channelId)?.provider ?? ""]);
  const [toast, setToast] = useState<string | null>(null);

  const now = useNow(15_000);
  const channel = channels.find((c) => c.id === channelId);
  const onAir = useMemo(
    () => (now && channelId ? scheduleAround(now).find((p) => p.channelId === channelId && p.start <= now && p.end > now) : undefined),
    [now, channelId],
  );

  // Controls fade out after 3s without input, like a TV.
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) setChrome(false);
    }, 3000);
  }, []);

  // Attach the stream. hls.js where MSE exists, native HLS otherwise (Safari, iOS).
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let cancelled = false;
    (async () => {
      const { default: HlsLib } = await import("hls.js");
      if (cancelled) return;
      if (HlsLib.isSupported()) {
        const h = new HlsLib();
        hls.current = h;
        h.loadSource(demoStream);
        h.attachMedia(v);
        h.on(HlsLib.Events.MANIFEST_PARSED, () => {
          setLevels(h.levels.map((l, index) => ({ index, height: l.height })).sort((a, b) => b.height - a.height));
          setAudio(h.audioTracks.map((t, index) => ({ index, label: t.name || t.lang || `Traccia ${index + 1}` })));
          setSubs(h.subtitleTracks.map((t, index) => ({ index, label: t.name || t.lang || `Sottotitoli ${index + 1}` })));
          v.play().catch(() => {});
        });
      } else {
        v.src = demoStream;
        v.play().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      hls.current?.destroy();
      hls.current = null;
    };
  }, []);

  useEffect(() => {
    // Controls start visible; just schedule the first fade-out.
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) setChrome(false);
    }, 3000);
    root.current?.focus();
    return () => clearTimeout(hideTimer.current);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((delta: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const zap = useCallback(
    (dir: 1 | -1) => {
      const i = channels.findIndex((c) => c.id === channelId);
      const next = channels[(i + dir + channels.length) % channels.length];
      setChannelId(next.id);
      setSources([next.provider]);
      router.replace(`/guarda/live-${next.id}`, { scroll: false });
    },
    [channelId, router],
  );

  // Simulates the current source failing: MAIA moves to the next one and
  // carries on from the same second.
  function failSource() {
    if (sources.length < 2) {
      setToast(`${sources[0]} non risponde e non ci sono altre fonti per questo titolo.`);
    } else {
      const [failed, ...rest] = sources;
      setSources([...rest, failed]);
      setToast(`${failed} non risponde: continui su ${rest[0]} dallo stesso punto.`);
    }
    setTimeout(() => setToast(null), 4000);
  }

  // Remote keys while the controls layer is in charge (the settings panel
  // uses the normal arrow navigation instead).
  function onKeyDown(e: React.KeyboardEvent) {
    if (panel) return;
    poke();
    const onButton = (e.target as HTMLElement).tagName === "BUTTON";
    if (e.key === "Enter" || e.key === " ") {
      if (onButton) return;
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft" && !live) {
      e.preventDefault();
      seek(-10);
    } else if (e.key === "ArrowRight" && !live) {
      e.preventDefault();
      seek(10);
    } else if (e.key === "ArrowUp" && live) {
      e.preventDefault();
      zap(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (live) zap(1);
      else setPanel(true);
    }
  }

  const heading = live ? onAir?.title ?? channel?.name : title?.name;

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-own-keys={panel ? undefined : ""}
      onKeyDown={onKeyDown}
      onPointerMove={poke}
      className={`fixed inset-0 bg-black outline-none ${chrome || panel ? "" : "cursor-none"}`}
    >
      <video
        ref={video}
        playsInline
        className="absolute inset-0 size-full"
        onClick={() => { poke(); toggle(); }}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (!live) seek(e.clientX < r.left + r.width / 2 ? -10 : 10);
        }}
        onPlay={() => { setPlaying(true); poke(); }}
        onPause={() => { setPlaying(false); setChrome(true); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />

      <div
        className={`pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80 transition-opacity duration-300 ${chrome || panel ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto flex items-start gap-4 p-4 sm:p-8">
          <button onClick={() => router.back()} className="lamp grid size-12 place-items-center rounded-full bg-black/40" aria-label="Indietro">
            <BackIcon />
          </button>
          <div className="min-w-0">
            {live && channel && (
              <p className="text-moon">
                {channel.number} {channel.name}
                {onAir && `, ${hhmm(onAir.start)} – ${hhmm(onAir.end)}`}
              </p>
            )}
            <h1 className="truncate font-display text-2xl font-semibold sm:text-4xl">{heading}</h1>
            <p className="mt-1 text-sm text-moon">Da {sources[0]}</p>
          </div>
        </div>

        <div className="pointer-events-auto p-4 sm:p-8">
          {!live && (
            <div className="flex items-center gap-4">
              <span className="w-16 text-sm text-moon tabular-nums">{fmt(time)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={1}
                value={time}
                onChange={(e) => {
                  if (video.current) video.current.currentTime = Number(e.target.value);
                }}
                aria-label="Posizione"
                className="h-1.5 flex-1 cursor-pointer accent-[#f5b856]"
              />
              <span className="w-16 text-right text-sm text-moon tabular-nums">{fmt(duration)}</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={toggle} className="lamp grid size-14 place-items-center rounded-full bg-lamp text-ink" aria-label={playing ? "Pausa" : "Riproduci"}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            {live && (
              <>
                <button onClick={() => zap(-1)} className="lamp h-12 rounded-full bg-black/40 px-5">Canale precedente</button>
                <button onClick={() => zap(1)} className="lamp h-12 rounded-full bg-black/40 px-5">Canale successivo</button>
              </>
            )}
            <button onClick={() => setPanel(true)} className="lamp flex h-12 items-center gap-2 rounded-full bg-black/40 px-5">
              <SettingsIcon /> Qualità e sottotitoli
            </button>
            <button onClick={failSource} className="lamp h-12 rounded-full border border-paper/20 px-5 text-sm text-moon">
              Prototipo: simula guasto della fonte
            </button>
            <p className="ml-auto hidden text-sm text-moon lg:block">
              {live ? "Su e giù cambiano canale" : "Frecce: indietro e avanti di 10 secondi. Giù: impostazioni"}
            </p>
          </div>
        </div>
      </div>

      {!playing && !panel && (
        <button
          onClick={toggle}
          aria-label="Riproduci"
          className="lamp absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lamp text-ink [&>svg]:size-10"
        >
          <PlayIcon />
        </button>
      )}

      {toast && (
        <div role="status" className="absolute left-1/2 top-24 -translate-x-1/2 rounded-2xl border border-lamp/40 bg-dusk/95 px-6 py-4 text-lg shadow-[0_18px_50px_-12px_rgb(245_184_86/0.45)]">
          {toast}
        </div>
      )}

      {panel && (
        <SettingsPanel
          onClose={() => { setPanel(false); root.current?.focus(); }}
          levels={levels}
          level={level}
          onLevel={(i) => { setLevel(i); if (hls.current) hls.current.currentLevel = i; }}
          audio={audio}
          onAudio={(i) => { if (hls.current) hls.current.audioTrack = i; }}
          subs={subs}
          sub={sub}
          onSub={(i) => { setSub(i); if (hls.current) hls.current.subtitleTrack = i; }}
          speed={speed}
          onSpeed={(s) => { setSpeed(s); if (video.current) video.current.playbackRate = s; }}
          live={!!live}
        />
      )}
    </div>
  );
}

function SettingsPanel(props: {
  onClose: () => void;
  levels: Level[];
  level: number;
  onLevel: (i: number) => void;
  audio: Track[];
  onAudio: (i: number) => void;
  subs: Track[];
  sub: number;
  onSub: (i: number) => void;
  speed: number;
  onSpeed: (s: number) => void;
  live: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chip = (active: boolean) =>
    `lamp h-11 rounded-full px-4 ${active ? "bg-lamp text-ink font-semibold" : "bg-haze text-paper"}`;

  return (
    <div
      ref={ref}
      data-focus-trap
      role="dialog"
      aria-label="Impostazioni di riproduzione"
      className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-dusk/95 p-6 backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[28rem] sm:rounded-3xl sm:border sm:p-8"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">Riproduzione</h2>
        <button onClick={onClose} className="lamp rounded-full px-4 py-2 text-moon">Chiudi</button>
      </div>

      <h3 className="mt-6 text-moon">Qualità</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={chip(props.level === -1)} onClick={() => props.onLevel(-1)}>Automatica</button>
        {props.levels.map((l) => (
          <button key={l.index} className={chip(props.level === l.index)} onClick={() => props.onLevel(l.index)}>
            {l.height}p
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-moon">Sottotitoli</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={chip(props.sub === -1)} onClick={() => props.onSub(-1)}>Disattivati</button>
        {props.subs.map((t) => (
          <button key={t.index} className={chip(props.sub === t.index)} onClick={() => props.onSub(t.index)}>
            {t.label}
          </button>
        ))}
      </div>
      {props.subs.length === 0 && <p className="mt-2 text-sm text-moon">Questo contenuto non ha sottotitoli.</p>}

      <h3 className="mt-6 text-moon">Lingua audio</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.audio.length > 0 ? (
          props.audio.map((t) => (
            <button key={t.index} className={chip(false)} onClick={() => props.onAudio(t.index)}>
              {t.label}
            </button>
          ))
        ) : (
          <button className={chip(true)}>Originale</button>
        )}
      </div>

      {!props.live && (
        <>
          <h3 className="mt-6 text-moon">Velocità</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {SPEEDS.map((s) => (
              <button key={s} className={chip(props.speed === s)} onClick={() => props.onSpeed(s)}>
                {s === 1 ? "Normale" : `${s}×`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
