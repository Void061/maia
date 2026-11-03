"use client";

import type { ErrorData } from "hls.js";
import type Hls from "hls.js";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BackIcon,
  EpisodesIcon,
  ExitFullscreenIcon,
  Forward10Icon,
  ForwardIcon,
  FullscreenIcon,
  MutedIcon,
  NextEpisodeIcon,
  PauseIcon,
  PlayIcon,
  PreviousEpisodeIcon,
  Replay10Icon,
  RewindIcon,
  RotateIcon,
  SettingsIcon,
  SubtitlesIcon,
  VolumeIcon,
  VolumeLowIcon,
} from "@/components/icons";
import { Art } from "@/components/poster";
import { isTv } from "@/lib/tv-device";
import {
  episodeLabel,
  flatEpisodes,
  type Episode,
  type TitleDetail,
} from "@/lib/tv";

type Props = { title: TitleDetail };
type Level = { index: number; height: number };
// lock()/unlock() are missing from some DOM typings and from iPhone Safari.
type OrientationWithLock = ScreenOrientation & {
  lock?: (o: "portrait" | "landscape") => Promise<void>;
  unlock?: () => void;
};
type Track = { index: number; label: string };

const SPEEDS = [0.75, 1, 1.25, 1.5];
// The "Prossimo episodio" card shows up this many seconds before the end.
// Holding left or right on a TV: one jump every this many ms.
const SEEK_REPEAT_MS = 300;
const UP_NEXT_SECS = 15;
const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export default function Player({ title }: Props) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Series: which episode is playing (?ep= in the URL, else the first one).
  // Extras play on their own (?extra=), without episode navigation.
  const params = useSearchParams();
  const extraId = params.get("extra");
  const extra = useMemo(
    () => (extraId ? title.extras.flatMap((g) => g.items).find((x) => x.id === extraId) ?? null : null),
    [extraId, title],
  );
  const isSeries = title.kind === "SERIES" && !extraId;
  const episodes = useMemo(() => (isSeries ? flatEpisodes(title) : []), [title, isSeries]);
  const [episode, setEpisode] = useState<Episode | null>(() => {
    if (!episodes.length) return null;
    return episodes.find((e) => e.id === params.get("ep")) ?? episodes[0];
  });
  const at = episode ? episodes.findIndex((e) => e.id === episode.id) : -1;
  const upNext = at >= 0 && at < episodes.length - 1 ? episodes[at + 1] : null;
  const previous = at > 0 ? episodes[at - 1] : null;
  // What the stream is for: a movie, an episode or an extra.
  const playId = extraId ?? (isSeries ? episode?.id : title.id) ?? null;
  const playIdRef = useRef(playId);
  useLayoutEffect(() => {
    playIdRef.current = playId;
  }, [playId]);
  // Where to pick up when a hidden player page is shown again.
  const resume = useRef<{ id: string | null; at: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [chrome, setChrome] = useState(true);
  // Which sheet is open: audio & subtitles, or settings (quality, speed).
  const [panel, setPanel] = useState<"subs" | "settings" | "episodes" | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1); // -1 = auto
  const [audio, setAudio] = useState<Track[]>([]);
  const [subs, setSubs] = useState<Track[]>([]);
  const [sub, setSub] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [volHint, setVolHint] = useState<number | null>(null);
  const volHintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Side indicator for ±10 s jumps; consecutive jumps on the same side add up.
  // The up-next card can be dismissed for the current episode.
  const [upNextHidden, setUpNextHidden] = useState(false);
  const [seekHint, setSeekHint] = useState<{ dir: 1 | -1; secs: number; n: number } | null>(null);
  const seekHintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef(0);
  const lastPointer = useRef<string>("mouse");
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSeek = useRef(0);

  // Controls fade out after 3s without input, like a TV.
  const poke = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) setChrome(false);
    }, 3000);
  }, []);

  // Attach the stream. Catalog videos always go through maia-be
  // (/api/tv/proxy/:itemId): it picks the source, fetches the playlist and
  // rewrites every link so segments, keys and subtitles come back through it
  // too. hls.js plays it where MSE exists, native HLS otherwise (iPhone before
  // iOS 17.1).
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let cancelled = false;
    let onError: (() => void) | null = null;
    let onPlaying: (() => void) | null = null;
    // Back on a page that was only hidden: start where it was left.
    const startAt = resume.current?.id === playId ? resume.current.at : 0;
    setFailure(null);
    setLevels([]);
    setAudio([]);
    setSubs([]);

    const nativeHls = v.canPlayType("application/vnd.apple.mpegurl") !== "";
    const mse = "MediaSource" in window || "ManagedMediaSource" in window;

    // hls.js on `url`; false where MSE is missing (iPhone before iOS 17.1).
    const attachHls = async (url: string, onFatal?: (data: ErrorData) => void) => {
      const { default: HlsLib } = await import("hls.js");
      if (cancelled || !HlsLib.isSupported()) return false;
      hls.current?.destroy();
      const h = new HlsLib(startAt ? { startPosition: startAt } : undefined);
      hls.current = h;
      h.loadSource(url);
      h.attachMedia(v);
      h.on(HlsLib.Events.MANIFEST_PARSED, () => {
        setLevels(h.levels.map((l, index) => ({ index, height: l.height })).sort((a, b) => b.height - a.height));
        setAudio(h.audioTracks.map((t, index) => ({ index, label: t.name || t.lang || `Traccia ${index + 1}` })));
        setSubs(h.subtitleTracks.map((t, index) => ({ index, label: t.name || t.lang || `Sottotitoli ${index + 1}` })));
        v.play().catch(() => {});
      });
      if (onFatal) h.on(HlsLib.Events.ERROR, (_, data) => data.fatal && !cancelled && onFatal(data));
      return true;
    };

    const playCatalog = async (id: string) => {
      if (!nativeHls && !mse) {
        setFailure("Questo browser non riproduce i video di MAIA. Usa Chrome, Edge o Safari.");
        return;
      }
      const url = `/api/tv/proxy/${encodeURIComponent(id)}`;
      // Not for a start that was cancelled (in development React runs the
      // effect twice: the first attachHls returns false, the second plays).
      const failed = (status?: number) =>
        !cancelled && setFailure(status === 404 ? "Questo contenuto ora non è disponibile." : "Il video non parte. Riprova tra poco.");
      // The message never stays over a video that is playing.
      onPlaying = () => setFailure(null);
      v.addEventListener("playing", onPlaying);

      if (!mse) {
        onError = () => failed();
        v.addEventListener("error", onError, { once: true });
        v.src = url;
        if (startAt) v.currentTime = startAt;
        v.play().catch(() => {});
        return;
      }

      // A fatal hls.js error stops loading but the film is still there: resume
      // a few times (network: load again; media: recover) before giving up.
      // The count starts again once the video has moved on since the last error.
      let recoveries = 0;
      let stuckAt = -1;
      const recover = (data: ErrorData) => {
        console.warn("hls", data.type, data.details, data.response?.code);
        // Before any video (the playlist itself was refused): nothing to resume.
        if (data.details === "manifestLoadError") return failed(data.response?.code);
        if (v.currentTime > stuckAt + 1) recoveries = 0;
        stuckAt = v.currentTime;
        const h = hls.current;
        if (!h || recoveries++ >= 3) return failed();
        if (data.type === "networkError") h.startLoad();
        else if (data.type === "mediaError") h.recoverMediaError();
        else failed();
      };
      if (!(await attachHls(url, recover))) failed();
    };

    if (playId) void playCatalog(playId);
    return () => {
      cancelled = true;
      if (onError) v.removeEventListener("error", onError);
      if (onPlaying) v.removeEventListener("playing", onPlaying);
      hls.current?.destroy();
      hls.current = null;
      // Stop sound and download now: the page may only be hidden, not removed.
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [playId]);

  // Next keeps visited pages mounted but hidden (React Activity) instead of
  // unmounting them, and a hidden <video> keeps playing. Leaving the player
  // (back, a link, the system back gesture) pauses it, leaves fullscreen and
  // releases the rotation lock; coming back resumes from the same point.
  useLayoutEffect(() => {
    const v = video.current as (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean; webkitExitFullscreen?: () => void }) | null;
    return () => {
      if (v) {
        // 0 = nothing loaded yet (or React's double run in dev): keep the last point.
        if (v.currentTime > 0) resume.current = { id: playIdRef.current, at: v.currentTime };
        v.pause();
        if (v.webkitDisplayingFullscreen) v.webkitExitFullscreen?.();
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      (screen.orientation as OrientationWithLock).unlock?.();
    };
  }, []);

  useEffect(() => {
    // Controls start visible; just schedule the first fade-out.
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) setChrome(false);
    }, 3000);
    root.current?.focus();
    // On a TV the volume is the remote's, on the TV itself: the video stays at full.
    if (isTv() && video.current) {
      video.current.volume = 1;
      video.current.muted = false;
    }
    return () => clearTimeout(hideTimer.current);
  }, []);

  // Controls gone on a TV: the focus leaves their buttons, or the next OK would
  // press one that cannot be seen.
  useEffect(() => {
    if (!chrome && !panel && isTv()) root.current?.focus();
  }, [chrome, panel]);

  // Track fullscreen however it was entered or left (button, F key, Esc, OS gesture).
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === root.current;
      setFullscreen(on);
      if (!on) (screen.orientation as OrientationWithLock).unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The whole player goes fullscreen so the controls stay visible. iPhone
  // Safari cannot fullscreen a page element: there the video's native
  // fullscreen is used instead. Orientation is left to the user.
  const toggleFullscreen = useCallback(async () => {
    const el = root.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el || !v) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (el.requestFullscreen) {
      await el.requestFullscreen().catch(() => {});
    } else {
      v.webkitEnterFullscreen?.();
    }
  }, []);

  // Touch on the picture: one tap shows/hides the controls; a double tap on
  // the left or right half jumps ±10 s, and further taps keep adding (YouTube).
  const toggleChrome = useCallback(() => {
    if (chrome) {
      clearTimeout(hideTimer.current);
      setChrome(false);
    } else {
      poke();
    }
  }, [chrome, poke]);

  // Rotate button (touch devices), like the YouTube app: portrait -> landscape
  // and back. Browsers only allow locking the orientation in fullscreen, so
  // we enter it first. iPhone Safari cannot lock: there we open the video's
  // native fullscreen, which follows the phone when it is turned.
  const rotate = useCallback(async () => {
    const el = root.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el || !v) return;
    const orientation = screen.orientation as OrientationWithLock;
    const landscape = orientation.type.startsWith("landscape");
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      await orientation.lock!(landscape ? "portrait" : "landscape");
    } catch {
      if (!document.fullscreenElement) v.webkitEnterFullscreen?.();
    }
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  // Jumps to an absolute position. The UI moves at once instead of waiting
  // for the next timeupdate, which only arrives after the seek completes.
  const seekTo = useCallback((t: number) => {
    const v = video.current;
    if (!v) return;
    const target = Math.max(0, Math.min(v.duration || 0, t));
    v.currentTime = target;
    setTime(target);
  }, []);

  const seek = useCallback(
    (delta: number) => {
      seekTo((video.current?.currentTime ?? 0) + delta);
      const dir = delta > 0 ? 1 : -1;
      setSeekHint((h) =>
        h && h.dir === dir ? { dir, secs: h.secs + Math.abs(delta), n: h.n + 1 } : { dir, secs: Math.abs(delta), n: 0 },
      );
      clearTimeout(seekHintTimer.current);
      seekHintTimer.current = setTimeout(() => setSeekHint(null), 800);
    },
    [seekTo],
  );

  // Volume like YouTube/Netflix: the icon mutes/unmutes, the slider and the
  // up/down keys set the level; level 0 counts as muted, and unmuting from 0
  // brings the sound back at half volume.
  const setVolume = useCallback((value: number, hint = false) => {
    const v = video.current;
    if (!v) return;
    const level = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
    v.volume = level;
    v.muted = level === 0;
    if (hint) {
      setVolHint(level);
      clearTimeout(volHintTimer.current);
      volHintTimer.current = setTimeout(() => setVolHint(null), 800);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      v.muted = false;
      if (v.volume === 0) v.volume = 0.5;
    } else {
      v.muted = true;
    }
  }, []);

  // Plays another episode: the URL follows and the stream effect loads its source.
  const playEpisode = useCallback(
    (ep: Episode) => {
      resume.current = null;
      setEpisode(ep);
      setPanel(null);
      setUpNextHidden(false);
      setTime(0);
      root.current?.focus(); // keep the remote/keyboard shortcuts working
      router.replace(`/watch/${title.id}?ep=${ep.id}`, { scroll: false });
    },
    [title, router],
  );

  // The arrows on a TV, like Netflix. On the picture: left and right seek, down
  // goes to the buttons. On the buttons: left and right move along them, up goes
  // back to the picture. True when the key is dealt with here.
  function remoteArrow(e: React.KeyboardEvent, k: string) {
    e.preventDefault();
    const bar = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-tv-bar] button") ?? []).filter(
      (b) => b.getClientRects().length > 0,
    );
    const at = bar.indexOf(e.target as HTMLElement);
    if (at >= 0) {
      if (k === "ArrowUp") root.current?.focus();
      else if (k === "ArrowLeft") bar[at - 1]?.focus();
      else if (k === "ArrowRight") bar[at + 1]?.focus();
      return true;
    }
    if (k === "ArrowDown") bar[0]?.focus();
    if (k === "ArrowUp" || k === "ArrowDown") return true;
    // A held key repeats dozens of times a second: every seek reloads the video.
    if (e.repeat && Date.now() - lastSeek.current < SEEK_REPEAT_MS) return true;
    lastSeek.current = Date.now();
    return false;
  }

  // Remote keys while the controls layer is in charge (the settings panel
  // uses the normal arrow navigation instead).
  function onKeyDown(e: React.KeyboardEvent) {
    if (panel) return;
    poke();
    const onButton = (e.target as HTMLElement).tagName === "BUTTON";
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (isTv() && k.startsWith("Arrow") && remoteArrow(e, k)) return;
    if (k === "Enter" || k === " " || k === "k") {
      if (onButton && k !== "k") return;
      e.preventDefault();
      toggle();
    } else if (k === "MediaPlayPause" || (k === "MediaPlay" && !playing) || (k === "MediaPause" && playing)) {
      // The remote's media keys (Fire TV app, maia-tv/).
      e.preventDefault();
      toggle();
    } else if (k === "MediaFastForward" || k === "MediaRewind") {
      e.preventDefault();
      seek(k === "MediaRewind" ? -10 : 10);
    } else if (k === "f") {
      e.preventDefault();
      toggleFullscreen();
    } else if (k === "m") {
      e.preventDefault();
      toggleMute();
    } else if (k === "ArrowLeft" || k === "j") {
      e.preventDefault();
      seek(-10);
    } else if (k === "ArrowRight" || k === "l") {
      e.preventDefault();
      seek(10);
    } else if (k === "p" && previous) {
      e.preventDefault();
      playEpisode(previous);
    } else if (k === "n" && upNext) {
      e.preventDefault();
      playEpisode(upNext);
    } else if (k === "c") {
      e.preventDefault();
      setPanel("subs");
    } else if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      setVolume((muted ? 0 : volume) + (k === "ArrowUp" ? 0.1 : -0.1), true);
    }
  }

  const heading = title.name;
  const subheading = extra
    ? extra.name
    : episode
      ? [episode.season < 1900 ? `S${episode.season}` : null, episodeLabel(episode), episode.name].filter(Boolean).join(" · ")
      : null;
  // "Prossimo episodio" card in the last seconds, Netflix-style; plays on its own at the end.
  const remaining = duration ? duration - time : Infinity;
  const showUpNext = !!upNext && remaining <= UP_NEXT_SECS && !panel && !upNextHidden;

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-own-keys={panel ? undefined : ""}
      onKeyDown={onKeyDown}
      onPointerMove={(e) => {
        // Only a real mouse wakes the controls by moving; on touch a tap is the toggle.
        if (e.pointerType === "mouse") poke();
      }}
      className={`fixed inset-0 bg-black outline-none ${chrome || panel ? "" : "cursor-none"}`}
    >
      <video
        ref={video}
        playsInline
        className="absolute inset-0 size-full"
        onPointerUp={(e) => {
          lastPointer.current = e.pointerType;
          // Mouse: click = play/pause, like Netflix and YouTube on the web.
          if (e.pointerType === "mouse") {
            if (e.button === 0) toggle();
            return;
          }
          const t = Date.now();
          const r = e.currentTarget.getBoundingClientRect();
          const side = e.clientX < r.left + r.width / 2 ? -10 : 10;
          if (t - lastTap.current < 300) {
            clearTimeout(singleTapTimer.current);
            seek(side);
          } else {
            singleTapTimer.current = setTimeout(toggleChrome, 280);
          }
          lastTap.current = t;
        }}
        onDoubleClick={() => {
          // Mouse: double click = fullscreen. (Touch double taps seek, above.)
          // Mobile browsers also emit dblclick after a double tap: only a mouse counts.
          if (lastPointer.current === "mouse") toggleFullscreen();
        }}
        onWaiting={() => setBuffering(true)}
        onSeeking={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onEnded={() => upNext && playEpisode(upNext)}
        onSeeked={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolumeState(e.currentTarget.volume);
        }}
        onPlay={() => { setPlaying(true); poke(); }}
        onPause={() => { setPlaying(false); setChrome(true); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />

      {/* Controls, Netflix/YouTube layout: no box, just scrims top and bottom.
          Small icon buttons with tooltips, grouped left / centre / right. */}
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${chrome && !panel ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div className="pointer-events-auto flex items-center gap-3 bg-gradient-to-b from-black/75 to-transparent px-3 pb-12 pt-3 sm:gap-4 sm:px-8 sm:pt-6">
          <Ctl label="Indietro" onClick={() => router.back()}>
            <BackIcon />
          </Ctl>
          {/* Phone: the title sits at the top; larger screens show it in the bottom row. */}
          <div className="min-w-0 sm:hidden">
            <p className="truncate text-base font-semibold">{heading}</p>
            {subheading && <p className="truncate text-xs text-muted">{subheading}</p>}
          </div>
        </div>

        <div className="pointer-events-auto bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-3 pt-16 sm:px-8 sm:pb-6">
          <Scrubber time={time} duration={duration} onSeek={seekTo} onActivity={poke} />

          <div data-tv-bar className="mt-1 flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            {/* Left: transport + volume (on phones the transport sits mid-screen instead). */}
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="hidden items-center gap-1 sm:flex sm:gap-2">
                <Ctl label={playing ? "Pausa" : "Riproduci"} onClick={toggle}>
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </Ctl>
                <Ctl label="Indietro di 10 secondi" onClick={() => seek(-10)}>
                  <Replay10Icon />
                </Ctl>
                <Ctl label="Avanti di 10 secondi" onClick={() => seek(10)}>
                  <Forward10Icon />
                </Ctl>
              </span>
              <span className="tv-none contents">
                <VolumeControl
                  level={muted ? 0 : volume}
                  onToggle={toggleMute}
                  onChange={(l) => setVolume(l)}
                  onActivity={poke}
                />
              </span>
            </div>

            {/* Centre: what is playing. */}
            <div className="hidden min-w-0 max-w-[40vw] text-center sm:block">
              <p className="truncate text-base font-semibold">{heading}</p>
              {subheading && <p className="truncate text-sm text-muted">{subheading}</p>}
            </div>

            {/* Right: audio/subtitles, fullscreen. */}
            <div className="flex items-center justify-end gap-1 sm:gap-2">
              {previous && (
                <Ctl label="Episodio precedente" onClick={() => playEpisode(previous)}>
                  <PreviousEpisodeIcon />
                </Ctl>
              )}
              {upNext && (
                <Ctl label="Episodio successivo" onClick={() => playEpisode(upNext)}>
                  <NextEpisodeIcon />
                </Ctl>
              )}
              {isSeries && (
                <Ctl label="Episodi" onClick={() => setPanel("episodes")}>
                  <EpisodesIcon />
                </Ctl>
              )}
              <Ctl label="Ruota schermo" onClick={rotate} className="tv-none hidden pointer-coarse:grid">
                <RotateIcon />
              </Ctl>
              <Ctl label="Audio e sottotitoli" onClick={() => setPanel("subs")}>
                <SubtitlesIcon />
              </Ctl>
              <Ctl label="Impostazioni" onClick={() => setPanel("settings")}>
                <SettingsIcon />
              </Ctl>
              <Ctl label={fullscreen ? "Esci da schermo intero" : "Schermo intero"} onClick={toggleFullscreen} className="tv-none grid">
                {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </Ctl>
            </div>
          </div>
        </div>
      </div>

      {/* Phone: transport in the middle of the screen, like the streaming apps. */}
      {chrome && !panel && !buffering && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-10 sm:hidden">
          <Ctl label="Indietro di 10 secondi" onClick={() => seek(-10)} big>
            <Replay10Icon />
          </Ctl>
          <Ctl label={playing ? "Pausa" : "Riproduci"} onClick={toggle} big strong>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Ctl>
          <Ctl label="Avanti di 10 secondi" onClick={() => seek(10)} big>
            <Forward10Icon />
          </Ctl>
        </div>
      )}

      {failure && (
        <div role="alert" className="absolute left-1/2 top-1/2 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/80 p-6 text-center">
          <p className="text-lg font-semibold">{failure}</p>
          {upNext && (
            <button onClick={() => playEpisode(upNext)} className="focusable pill-focus mt-4 rounded-full bg-white px-5 py-2 font-semibold text-black">
              Episodio successivo
            </button>
          )}
        </div>
      )}

      {/* Nothing drawn over the video uses backdrop-filter: on Android Chrome a
          blurred layer over a playing video copies a stale patch of the frame
          during seeks, which shows up as a "mini player" rectangle. */}
      {buffering && (
        <div role="status" aria-label="Caricamento" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {/* Dark disc behind the ring so it reads on bright frames too. */}
          <div className="grid size-24 place-items-center rounded-full bg-black/65">
            <div className="size-14 animate-spin rounded-full border-4 border-white/25 border-t-white" />
          </div>
        </div>
      )}

      {seekHint && (
        <div
          key={seekHint.n === 0 ? `${seekHint.dir}` : `${seekHint.dir}-${seekHint.n}`}
          aria-hidden
          className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 animate-[fade_200ms_ease-out] flex-col items-center gap-2 ${
            seekHint.dir < 0 ? "left-[14%]" : "right-[14%]"
          }`}
        >
          <span className="grid size-16 place-items-center rounded-full bg-black/55 text-white [&>svg]:size-7">
            {seekHint.dir < 0 ? <RewindIcon /> : <ForwardIcon />}
          </span>
          <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-semibold text-white">
            {seekHint.secs} secondi
          </span>
        </div>
      )}

      {volHint !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[18%] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white [&>svg]:size-5"
        >
          {volHint === 0 ? <MutedIcon /> : volHint < 0.5 ? <VolumeLowIcon /> : <VolumeIcon />}
          {Math.round(volHint * 100)}%
        </div>
      )}

      {/* Up next, Netflix/Prime-style: a compact card above the controls. The bar
          under the thumbnail fills as the countdown runs out; at the end the next
          episode starts on its own. */}
      {showUpNext && upNext && (
        <div className="absolute bottom-28 right-3 flex items-center gap-1 sm:bottom-32 sm:right-8">
          <button
            onClick={() => playEpisode(upNext)}
            className="focusable pill-focus group flex w-72 items-center gap-3 rounded-xl bg-black/80 p-2 pr-3 text-left sm:w-80"
          >
            <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-raised">
              <Art src={upNext.imageUrl ?? title.backdropUrl} seed={upNext.id} />
              <span className="absolute inset-0 grid place-items-center bg-black/30 [&>svg]:size-6">
                <PlayIcon />
              </span>
              <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                <span
                  className="block h-full bg-white"
                  style={{ width: `${Math.min(100, (1 - Math.max(0, remaining) / UP_NEXT_SECS) * 100)}%` }}
                />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted group-focus-visible:text-black/60">
                Prossimo episodio · {Math.max(0, Math.ceil(remaining))} s
              </span>
              <span className="block truncate text-sm font-semibold">
                {episodeLabel(upNext)} · {upNext.name}
              </span>
              {upNext.season !== episode?.season && upNext.season < 1900 && (
                <span className="block text-xs text-faint group-focus-visible:text-black/60">Stagione {upNext.season}</span>
              )}
            </span>
          </button>
          <button
            onClick={() => setUpNextHidden(true)}
            aria-label="Nascondi"
            title="Nascondi"
            className="focusable pill-focus grid size-8 place-items-center self-start rounded-full bg-black/70 text-sm text-white"
          >
            ✕
          </button>
        </div>
      )}

      {panel && (
        <div
          aria-hidden
          className="absolute inset-0 bg-black/75"
          onClick={() => {
            setPanel(null);
            root.current?.focus();
          }}
        />
      )}
      {panel === "episodes" && episode && (
        <EpisodesPanel
          title={title}
          current={episode}
          onPick={playEpisode}
          onClose={() => {
            setPanel(null);
            root.current?.focus();
          }}
        />
      )}
      {(panel === "subs" || panel === "settings") && (
        <SettingsPanel
          mode={panel}
          onClose={() => { setPanel(null); root.current?.focus(); }}
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
        />
      )}
    </div>
  );
}

// Episodes sheet, Netflix-style: season tabs and the list of episodes with a
// thumbnail; the one playing is marked. Picking one plays it at once.
function EpisodesPanel({
  title,
  current,
  onPick,
  onClose,
}: {
  title: TitleDetail;
  current: Episode;
  onPick: (ep: Episode) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [season, setSeason] = useState(current.season);
  const episodes = title.seasonList.find((s) => s.number === season)?.episodes ?? [];
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-current=true], button")?.focus();
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
    <div
      ref={ref}
      data-focus-trap
      role="dialog"
      aria-label="Episodi"
      className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgb(0_0_0/0.6)] sm:inset-x-auto sm:right-10 sm:bottom-24 sm:max-h-[75dvh] sm:w-[34rem] sm:rounded-3xl"
    >
      <div className="flex items-center justify-between gap-6">
        <h2 className="font-display text-xl font-bold">{title.name}</h2>
        <button onClick={onClose} className="focusable pill-focus rounded-full px-4 py-1.5 text-sm text-muted">
          Chiudi
        </button>
      </div>
      {title.seasonList.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {title.seasonList.map(({ number: n }) => (
            <button
              key={n}
              onClick={() => setSeason(n)}
              aria-pressed={season === n}
              className="focusable pill-focus h-10 rounded-full px-4 text-sm font-medium text-muted aria-pressed:bg-white/15 aria-pressed:text-label"
            >
              {n >= 1900 ? `Edizione ${n}` : `Stagione ${n}`}
            </button>
          ))}
        </div>
      )}
      <ol className="mt-4 grid gap-1">
        {episodes.map((ep) => {
          const playing = ep.id === current.id;
          return (
            <li key={ep.id}>
              <button
                onClick={() => onPick(ep)}
                aria-current={playing}
                className="focusable pill-focus group flex w-full items-center gap-4 rounded-2xl p-2 text-left aria-[current=true]:bg-white/10"
              >
                <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-raised sm:w-36">
                  <Art src={ep.imageUrl ?? title.backdropUrl} seed={ep.id} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-faint group-focus-visible:text-black/60">
                    {playing ? "In riproduzione" : episodeLabel(ep)}
                  </span>
                  <span className="block truncate text-base font-semibold">{ep.name}</span>
                  {ep.minutes && <span className="block text-sm text-faint group-focus-visible:text-black/60">{ep.minutes} min</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Check mark beside the selected row in the audio/subtitles and settings sheets.
function Check({ on }: { on: boolean }) {
  return (
    <span className={`w-4 text-sm ${on ? "opacity-100" : "opacity-0"}`} aria-hidden>
      ✓
    </span>
  );
}

function SettingsPanel(props: {
  mode: "subs" | "settings";
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

  // List rows with a check mark, like the Netflix/YouTube menus.
  const row = (active: boolean) =>
    `focusable pill-focus flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base ${
      active ? "font-semibold text-white" : "text-muted"
    }`;
  const title = props.mode === "subs" ? "Audio e sottotitoli" : "Impostazioni";

  return (
    <div
      ref={ref}
      data-focus-trap
      role="dialog"
      aria-label={title}
      className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgb(0_0_0/0.6)] sm:inset-x-auto sm:right-10 sm:bottom-24 sm:w-auto sm:min-w-[22rem] sm:rounded-3xl sm:p-6"
    >
      <div className="flex items-center justify-between gap-6">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <button onClick={onClose} className="focusable pill-focus rounded-full px-4 py-1.5 text-sm text-muted">
          Chiudi
        </button>
      </div>

      {props.mode === "subs" ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="px-3 text-sm font-semibold text-faint">Audio</h3>
            <div className="mt-1">
              {props.audio.length > 0 ? (
                props.audio.map((t, i) => (
                  <button key={t.index} className={row(i === 0)} onClick={() => props.onAudio(t.index)}>
                    <Check on={i === 0} /> {t.label}
                  </button>
                ))
              ) : (
                <button className={row(true)}>
                  <Check on /> Originale
                </button>
              )}
            </div>
          </section>
          <section>
            <h3 className="px-3 text-sm font-semibold text-faint">Sottotitoli</h3>
            <div className="mt-1">
              <button className={row(props.sub === -1)} onClick={() => props.onSub(-1)}>
                <Check on={props.sub === -1} /> Disattivati
              </button>
              {props.subs.map((t) => (
                <button key={t.index} className={row(props.sub === t.index)} onClick={() => props.onSub(t.index)}>
                  <Check on={props.sub === t.index} /> {t.label}
                </button>
              ))}
              {props.subs.length === 0 && (
                <p className="px-3 pt-1 text-sm text-faint">Nessun sottotitolo per questo contenuto.</p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="px-3 text-sm font-semibold text-faint">Qualità</h3>
            <div className="mt-1">
              <button className={row(props.level === -1)} onClick={() => props.onLevel(-1)}>
                <Check on={props.level === -1} /> Automatica
              </button>
              {props.levels.map((l) => (
                <button key={l.index} className={row(props.level === l.index)} onClick={() => props.onLevel(l.index)}>
                  <Check on={props.level === l.index} /> {l.height}p
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="px-3 text-sm font-semibold text-faint">Velocità</h3>
            <div className="mt-1">
              {SPEEDS.map((sp) => (
                <button key={sp} className={row(props.speed === sp)} onClick={() => props.onSpeed(sp)}>
                  <Check on={props.speed === sp} /> {sp === 1 ? "Normale" : `${sp}×`}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Seek bar with a knob. While dragging, the bar and the time follow the
// finger/mouse immediately and a bubble shows the target time; the video
// jumps only on release, so a slow seek never makes the knob lag behind.
function Scrubber({
  time,
  duration,
  onSeek,
  onActivity,
}: {
  time: number;
  duration: number;
  onSeek: (t: number) => void;
  onActivity: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? time;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };

  return (
    <div className="flex items-center gap-4">
      <span className="w-14 text-sm font-medium text-label tabular-nums">{fmt(shown)}</span>
      <div
        ref={track}
        role="slider"
        aria-label="Posizione"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={fmt(shown)}
        className="group relative flex h-8 flex-1 cursor-pointer touch-none items-center"
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
          onActivity();
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          setDrag(at(e.clientX));
          onActivity();
        }}
        onPointerUp={() => {
          if (drag !== null) onSeek(drag);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="relative h-1.5 w-full rounded-full bg-white/25">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_10px_rgb(0_0_0/0.5)] transition-[width,height] duration-150 ${
            drag !== null ? "size-6" : "size-4 group-hover:size-5"
          }`}
          style={{ left: `${pct}%` }}
        />
        {drag !== null && (
          <div
            className="pointer-events-none absolute bottom-full mb-3 -translate-x-1/2 rounded-lg bg-white px-2.5 py-1 text-sm font-semibold text-black tabular-nums"
            style={{ left: `${pct}%` }}
          >
            {fmt(drag)}
          </div>
        )}
      </div>
      <span className="w-14 text-right text-sm font-medium text-muted tabular-nums">
        {fmt(Math.max(0, duration - shown))}
      </span>
    </div>
  );
}

// One control: icon only, its name in the tooltip and for screen readers.
// `strong` = filled white (play/pause on phones), `big` = phone mid-screen controls.
function Ctl({
  label,
  onClick,
  children,
  strong = false,
  big = false,
  className = "grid",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  strong?: boolean;
  big?: boolean;
  className?: string;
}) {
  const size = big
    ? strong
      ? "size-16 [&>svg]:size-8"
      : "size-12 [&>svg]:size-8"
    : "size-9 [&>svg]:size-5 sm:size-11 sm:[&>svg]:size-6";
  const look = strong ? "bg-white text-black" : big ? "bg-black/35 text-white" : "pill-focus text-white";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`focusable shrink-0 place-items-center rounded-full ${className} ${size} ${look}`}
    >
      {children}
    </button>
  );
}

// Volume, Netflix-style: the icon opens a small vertical popover (closed by
// default) with the level, a vertical slider and a mute button. It closes on
// a second press, a tap outside or Back/Esc. Up/down keys still change the
// volume from anywhere in the player.
function VolumeControl({
  level,
  onToggle,
  onChange,
  onActivity,
}: {
  level: number;
  onToggle: () => void;
  onChange: (level: number) => void;
  onActivity: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const pct = Math.round(level * 100);
  const at = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (r.bottom - clientY) / r.height));
  };

  useEffect(() => {
    if (!open) return;
    track.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const icon = level === 0 ? <MutedIcon /> : level < 0.5 ? <VolumeLowIcon /> : <VolumeIcon />;

  return (
    <div ref={box} className="relative" {...(open ? { "data-focus-trap": "" } : {})}>
      <Ctl
        label={open ? "Chiudi volume" : "Volume"}
        onClick={() => {
          setOpen((o) => !o);
          onActivity();
        }}
      >
        {icon}
      </Ctl>
      {open && (
        <div className="absolute bottom-full left-1/2 mb-3 flex w-14 -translate-x-1/2 flex-col items-center gap-3 rounded-full bg-surface/95 py-4 shadow-[0_10px_30px_rgb(0_0_0/0.6)]">
          <span className="text-xs font-semibold tabular-nums text-label">{pct}%</span>
          <div
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Volume"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
            className="focusable relative flex h-32 w-8 cursor-pointer touch-none justify-center rounded-full"
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                onChange(level + (e.key === "ArrowUp" ? 0.1 : -0.1));
                onActivity();
              }
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag(true);
              onChange(at(e.clientY));
              onActivity();
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              onChange(at(e.clientY));
              onActivity();
            }}
            onPointerUp={() => setDrag(false)}
            onPointerCancel={() => setDrag(false)}
          >
            <div className="relative h-full w-1 rounded-full bg-white/30">
              <div className="absolute inset-x-0 bottom-0 rounded-full bg-white" style={{ height: `${pct}%` }} />
            </div>
            <div
              className="absolute left-1/2 size-3.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow"
              style={{ bottom: `${pct}%` }}
            />
          </div>
          <button
            onClick={onToggle}
            aria-label={level === 0 ? "Attiva audio" : "Disattiva audio"}
            title={level === 0 ? "Attiva audio" : "Disattiva audio"}
            className="focusable pill-focus grid size-9 place-items-center rounded-full text-white [&>svg]:size-5"
          >
            {level === 0 ? <VolumeIcon /> : <MutedIcon />}
          </button>
        </div>
      )}
    </div>
  );
}
