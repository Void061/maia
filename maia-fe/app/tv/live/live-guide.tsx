"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlayIcon } from "@/components/icons";
import LivePreview from "@/components/live-preview";
import { ButtonLink } from "@/components/ui";
import {
  channelCategories,
  channels,
  scheduleAround,
  type Channel,
  type Program,
} from "@/lib/live-demo";
import { hhmm, useNow } from "@/lib/use-now";

const PX_PER_MIN = 5; // one hour = 300px
const MIN = 60 * 1000;
const COL = 224; // channel column width (px), w-56

// Live, modelled on the Pluto TV / Samsung TV Plus guide: a live preview of
// the selected channel on top, category filters, then the programme grid.
// Moving through the grid updates the preview and the details.
export default function LiveGuide() {
  const now = useNow();
  const schedule = useMemo(() => (now ? scheduleAround(now) : []), [now]);
  const [category, setCategory] = useState<string>("tutti");
  const [selected, setSelected] = useState<{
    channelId: string;
    start?: number;
  }>({ channelId: channels[0].id });
  // The preview follows the selection with a short delay, so zipping through
  // the grid with the remote does not restart the video at every step.
  const [previewId, setPreviewId] = useState(channels[0].id);
  useEffect(() => {
    const id = setTimeout(() => setPreviewId(selected.channelId), 450);
    return () => clearTimeout(id);
  }, [selected.channelId]);

  const shown = channels.filter(
    (c) => category === "tutti" || c.category === category,
  );

  if (!now) return <div className="night min-h-dvh" />;

  const onAirOf = (chId: string) =>
    schedule.find((p) => p.channelId === chId && p.start <= now && p.end > now);
  const after = (p?: Program) =>
    p
      ? schedule.find((x) => x.channelId === p.channelId && x.start === p.end)
      : undefined;
  const channel = channels.find((c) => c.id === selected.channelId)!;
  const program =
    (selected.start !== undefined &&
      schedule.find(
        (p) => p.channelId === channel.id && p.start === selected.start,
      )) ||
    onAirOf(channel.id);

  return (
    <div className="night min-h-dvh pb-16 pt-16 md:pt-24">
      {/* Selected channel: live preview + what is (or will be) on. */}
      <section className="grid gap-5 px-4 sm:px-10 md:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] md:items-center md:gap-10 lg:px-16 xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)]">
        <Link
          href={`/watch/live-${previewId}`}
          aria-label={`Guarda ${channels.find((c) => c.id === previewId)?.name}`}
          className="focusable lift block overflow-hidden rounded-2xl md:order-2"
          tabIndex={-1}
        >
          <LivePreview
            key={previewId}
            channelId={previewId}
            className="aspect-video"
          />
        </Link>
        {program && (
          <Details
            channel={channel}
            program={program}
            now={now}
            next={after(program)}
          />
        )}
      </section>

      {/* Category filters. */}
      <div className="rail mt-6 flex gap-2 overflow-x-auto px-4 py-2 sm:px-10 md:mt-10 lg:px-16">
        {channelCategories.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            aria-pressed={category === c.key}
            className="focusable pill-focus h-10 shrink-0 rounded-full bg-white/10 px-4 text-sm font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Phone: one row per channel with what's on now and next. */}
      <ul className="mt-3 grid gap-1 px-2 md:hidden">
        {shown.map((ch) => {
          const p = onAirOf(ch.id);
          const n = after(p);
          const active = ch.id === selected.channelId;
          return (
            <li key={ch.id}>
              <button
                onClick={() => setSelected({ channelId: ch.id })}
                aria-pressed={active}
                className="focusable flex w-full items-center gap-3 rounded-2xl p-2 text-left aria-pressed:bg-white/10"
              >
                <ChannelTile channel={ch} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-xs text-faint">{ch.number}</span>
                    <span className="truncate text-sm font-medium text-muted">
                      {ch.name}
                    </span>
                  </span>
                  <span className="block truncate text-base font-semibold">
                    {p?.title}
                  </span>
                  {p && (
                    <span className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-white/20">
                      <span
                        className="block h-full bg-white"
                        style={{
                          width: `${((now - p.start) / (p.end - p.start)) * 100}%`,
                        }}
                      />
                    </span>
                  )}
                  {n && (
                    <span className="mt-1.5 block truncate text-xs text-faint">
                      Dopo, alle {hhmm(n.start)}: {n.title}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* TV / desktop / tablet: the programme grid. */}
      <Grid
        channels={shown}
        schedule={schedule}
        now={now}
        selected={selected}
        onSelect={(channelId, start) => setSelected({ channelId, start })}
      />
    </div>
  );
}

function Details({
  channel,
  program,
  now,
  next,
}: {
  channel: Channel;
  program: Program;
  now: number;
  next?: Program;
}) {
  const live = program.start <= now && program.end > now;
  const left = Math.max(1, Math.round((program.end - now) / MIN));
  return (
    <div className="min-w-0 md:order-1">
      <div className="flex items-center gap-3">
        <ChannelTile channel={channel} small />
        <p className="text-sm font-medium text-muted">
          {channel.number} · {channel.name}
        </p>
      </div>
      <p className="mt-4 text-sm font-semibold text-muted">
        {live ? (
          <>
            <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-black">
              IN ONDA
            </span>
            {hhmm(program.start)} – {hhmm(program.end)}
          </>
        ) : program.end <= now ? (
          `Andato in onda alle ${hhmm(program.start)}`
        ) : (
          `Più tardi, alle ${hhmm(program.start)}`
        )}
      </p>
      <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold sm:text-5xl">
        {program.title}
      </h1>
      <p className="mt-3 line-clamp-2 max-w-xl text-base text-label/85">
        {program.description}
      </p>
      {live && (
        <div className="mt-4 flex max-w-sm items-center gap-3 text-sm text-muted">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <span
              className="block h-full bg-white"
              style={{
                width: `${((now - program.start) / (program.end - program.start)) * 100}%`,
              }}
            />
          </span>
          {left} min rimasti
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/watch/live-${channel.id}`}>
          <PlayIcon /> {live ? "Guarda" : "Guarda il canale"}
        </ButtonLink>
        {live && next && (
          <p className="text-sm text-faint">
            Dopo, alle {hhmm(next.start)}:{" "}
            <span className="text-muted">{next.title}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Monogram tile standing in for the channel logo.
function ChannelTile({
  channel,
  small = false,
}: {
  channel: Channel;
  small?: boolean;
}) {
  const initials = channel.name
    .replace(/^Pluto /, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg font-display font-extrabold text-white ${
        small ? "size-8 text-xs" : "size-12 text-sm"
      }`}
      style={{
        background: `linear-gradient(150deg, hsl(${channel.hue} 65% 52%), hsl(${channel.hue} 60% 30%))`,
      }}
    >
      {/^Rai \d/.test(channel.name)
        ? channel.name.replace("Rai ", "R")
        : initials}
    </span>
  );
}

function Grid({
  channels: list,
  schedule,
  now,
  selected,
  onSelect,
}: {
  channels: Channel[];
  schedule: Program[];
  now: number;
  selected: { channelId: string; start?: number };
  onSelect: (channelId: string, start: number) => void;
}) {
  const hour = 60 * MIN;
  const from = Math.floor(now / (30 * MIN)) * 30 * MIN - 30 * MIN;
  const to = from + 4.5 * hour;
  const x = (t: number) => ((Math.max(t, from) - from) / MIN) * PX_PER_MIN;
  const slots = Array.from({ length: 9 }, (_, i) => from + i * 30 * MIN);

  return (
    <div className="rail mt-6 hidden overflow-x-auto px-10 md:block lg:px-16">
      <div className="relative" style={{ width: COL + x(to) }}>
        {/* Time ruler */}
        <div
          className="flex h-9 items-end text-sm font-medium text-faint"
          style={{ paddingLeft: COL }}
        >
          {slots.map((t) => (
            <span
              key={t}
              className="shrink-0 border-l border-white/10 pl-2"
              style={{ width: 30 * PX_PER_MIN }}
            >
              {t <= now && t + 30 * MIN > now ? "Ora" : hhmm(t)}
            </span>
          ))}
        </div>

        {/* Now line: drawn behind the (opaque) programme blocks so it never
            crosses their text; it shows in the gaps, with a dot on the ruler. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-7 z-0"
          style={{ left: COL + x(now) }}
        >
          <span className="absolute -left-1 top-0 size-2.5 rounded-full bg-white" />
          <span className="absolute left-0 top-1 bottom-0 w-0.5 bg-white/70" />
        </div>

        {list.map((ch) => (
          <div key={ch.id} className="flex h-[4.5rem] items-stretch py-1">
            <Link
              href={`/watch/live-${ch.id}`}
              className="focusable pill-focus sticky left-0 z-20 flex shrink-0 items-center gap-3 rounded-xl bg-canvas pr-3"
              style={{ width: COL - 8, marginRight: 8 }}
              onFocus={() =>
                onSelect(
                  ch.id,
                  schedule.find(
                    (p) =>
                      p.channelId === ch.id && p.start <= now && p.end > now,
                  )?.start ?? 0,
                )
              }
            >
              <ChannelTile channel={ch} />
              <span className="min-w-0">
                <span className="block text-xs text-faint">{ch.number}</span>
                <span className="block truncate text-base font-semibold">
                  {ch.name}
                </span>
              </span>
            </Link>
            <div className="relative z-[1] flex-1">
              {schedule
                .filter(
                  (p) => p.channelId === ch.id && p.end > from && p.start < to,
                )
                .map((p) => {
                  const live = p.start <= now && p.end > now;
                  const past = p.end <= now;
                  const isSel =
                    selected.channelId === ch.id && selected.start === p.start;
                  const cls = `focusable pill-focus absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-xl px-4 text-left ${
                    isSel
                      ? "bg-[#4a4a4e]"
                      : live
                        ? "bg-raised"
                        : past
                          ? "bg-[#141416] text-faint"
                          : "bg-surface"
                  }`;
                  const width = x(p.end) - x(p.start) - 6;
                  const style = {
                    left: x(p.start),
                    width: Math.max(width, 12),
                  };
                  // A sliver cut by the left edge of the window shows no text at all.
                  const body =
                    width < 90 ? null : (
                      <>
                        <span className="truncate text-base font-semibold">
                          {p.title}
                        </span>
                        <span className="truncate text-sm text-muted">
                          {hhmm(p.start)} – {hhmm(p.end)}
                        </span>
                      </>
                    );
                  return live ? (
                    <Link
                      key={p.start}
                      href={`/watch/live-${ch.id}`}
                      onFocus={() => onSelect(ch.id, p.start)}
                      onMouseEnter={() => onSelect(ch.id, p.start)}
                      className={cls}
                      style={style}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      key={p.start}
                      onClick={() => onSelect(ch.id, p.start)}
                      onFocus={() => onSelect(ch.id, p.start)}
                      onMouseEnter={() => onSelect(ch.id, p.start)}
                      className={cls}
                      style={style}
                    >
                      {body}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
