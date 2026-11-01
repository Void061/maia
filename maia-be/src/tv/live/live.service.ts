import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Channel, LiveProgram } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { ProviderProgram } from '../providers/provider.types.js';
import { romeTime } from '../providers/raiplay/raiplay.adapter.js';
import type { PlaybackDto } from '../tv.dto.js';
import type { ChannelCategory, ChannelDto, ProgramDto, ReplayDetailDto } from './live.dto.js';

const PROVIDER = 'raiplay';
// Replays stay this many days, like on RaiPlay's guide.
const KEEP_DAYS = 7;
const HOUR = 3600_000;

const CATEGORY: Record<string, ChannelCategory> = {
  'rai-1': 'general',
  'rai-2': 'general',
  'rai-3': 'general',
  'rai-4': 'movies-series',
  'rai-movie': 'movies-series',
  'rai-premium': 'movies-series',
  italiana: 'movies-series',
  'rai-5': 'culture',
  'rai-storia': 'culture',
  'rai-gulp': 'kids',
  'rai-yoyo': 'kids',
  'rai-news-24': 'news-sport',
  'rai-sport': 'news-sport',
};

// Same crop service as the catalog thumbnails (tv.service.ts).
const RAIPLAY_IMG = 'https://www.raiplay.it/';
const thumb = (url: string | null) =>
  url?.startsWith(RAIPLAY_IMG) && !url.startsWith(`${RAIPLAY_IMG}cropgd/`) ? `${RAIPLAY_IMG}cropgd/640x360/${url.slice(RAIPLAY_IMG.length)}` : url;

// The Rome calendar day `offset` days from today, as YYYY-MM-DD.
export const romeDay = (offset = 0, from = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(from + offset * 24 * HOUR));

const dayBounds = (day: string) => {
  const [y, m, d] = day.split('-');
  const start = romeTime(`${d}/${m}/${y}`, '00:00');
  // The next calendar day at midnight, whatever the DST change in between.
  const next = romeDay(1, start.getTime() + 12 * HOUR);
  const [ny, nm, nd] = next.split('-');
  return { start, end: romeTime(`${nd}/${nm}/${ny}`, '00:00') };
};

const toProgram = (p: LiveProgram, now: Date): ProgramDto => ({
  id: p.id,
  channelId: p.channelId,
  title: p.title,
  episodeTitle: p.episodeTitle,
  description: p.description,
  start: p.startsAt.toISOString(),
  end: p.endsAt.toISOString(),
  imageUrl: thumb(p.imageUrl),
  replay: !!p.replayPath && p.playable && p.endsAt <= now,
});

const toChannel = (c: Channel): ChannelDto => ({
  id: c.id,
  name: c.name,
  number: c.position + 1,
  category: (CATEGORY[c.externalId] ?? 'general') as ChannelCategory,
  logoUrl: c.logoUrl,
});

// TV channels and their 7-day schedule, for the replays: kept in the database
// by the catalog worker (live-channels, live-guide jobs), read from there by
// the API. Only these channels: the others (e.g. Rai Radio 2) are skipped.
@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  private get adapter() {
    return this.catalog.adapters[PROVIDER];
  }

  // ─── sync (worker) ────────────────────────────────────────────────────────

  async hasChannels() {
    return (await this.prisma.channel.count({ where: { provider: PROVIDER } })) > 0;
  }

  async syncChannels(): Promise<number> {
    const list = ((await this.adapter.listChannels?.()) ?? []).filter((c) => CATEGORY[c.externalId]);
    if (!list.length) return 0; // an empty answer is a glitch: keep what we have
    for (const ch of list) {
      const data = { name: ch.name, position: ch.position, category: CATEGORY[ch.externalId], logoUrl: ch.logoUrl, available: true };
      await this.prisma.channel.upsert({
        where: { provider_externalId: { provider: PROVIDER, externalId: ch.externalId } },
        create: { provider: PROVIDER, externalId: ch.externalId, ...data },
        update: data,
      });
    }
    await this.prisma.channel.updateMany({
      where: { provider: PROVIDER, externalId: { notIn: list.map((c) => c.externalId) } },
      data: { available: false },
    });
    return list.length;
  }

  // Today and tomorrow every time (schedules change), past days only when
  // missing (first run, or a day the worker was off). Old days are dropped.
  async syncGuide(): Promise<number> {
    const channels = await this.prisma.channel.findMany({ where: { provider: PROVIDER, available: true } });
    let read = 0;
    for (const ch of channels) {
      for (let offset = 1; offset >= -KEEP_DAYS; offset--) {
        const day = romeDay(offset);
        if (offset < 0) {
          const { start, end } = dayBounds(day);
          if (await this.prisma.liveProgram.count({ where: { channelId: ch.id, startsAt: { gte: start, lt: end } } })) continue;
        }
        await this.saveDay(ch.id, day, (await this.adapter.channelGuide?.(ch.externalId, day)) ?? []);
        read++;
      }
    }
    await this.prisma.liveProgram.deleteMany({ where: { startsAt: { lt: new Date(Date.now() - (KEEP_DAYS + 1) * 24 * HOUR) } } });
    return read;
  }

  private async saveDay(channelId: string, day: string, programs: ProviderProgram[]) {
    if (!programs.length) return; // nothing published yet (tomorrow) or a glitch: keep what we have
    for (const p of programs) {
      const data = {
        title: p.title,
        episodeTitle: p.episodeTitle,
        description: p.description,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        imageUrl: p.imageUrl,
        replayPath: p.replayPath,
      };
      await this.prisma.liveProgram.upsert({
        where: { channelId_externalId: { channelId, externalId: p.externalId } },
        create: { channelId, externalId: p.externalId, ...data },
        update: data, // the replay link and playable flag found at play time stay
      });
    }
    const { start, end } = dayBounds(day);
    await this.prisma.liveProgram.deleteMany({
      where: { channelId, startsAt: { gte: start, lt: end }, externalId: { notIn: programs.map((p) => p.externalId) } },
    });
  }

  // ─── API ─────────────────────────────────────────────────────────────────

  async channels(): Promise<ChannelDto[]> {
    const list = await this.prisma.channel.findMany({ where: { available: true }, orderBy: { position: 'asc' } });
    return list.map(toChannel);
  }

  // What can be watched again on a channel, one Rome day (default today).
  async replays(channelId: string, day = romeDay()): Promise<ProgramDto[]> {
    const { start, end } = dayBounds(day);
    const now = new Date();
    const list = await this.prisma.liveProgram.findMany({
      where: { channelId, startsAt: { gte: start, lt: end }, endsAt: { lte: now }, replayPath: { not: null }, playable: true },
      orderBy: { startsAt: 'asc' },
    });
    return list.map((p) => toProgram(p, now));
  }

  async replay(id: string): Promise<ReplayDetailDto> {
    const p = await this.prisma.liveProgram.findUnique({ where: { id }, include: { channel: { select: { name: true } } } });
    if (!p) throw new NotFoundException({ code: 'PROGRAM_NOT_FOUND', message: 'Programma non trovato.' });
    return { ...toProgram(p, new Date()), channelName: p.channel.name };
  }

  // Playback for a replay; null = not one. Its link is read from the service
  // at the first play, then kept.
  async playback(itemId: string, exclude: string[]): Promise<PlaybackDto | null> {
    if (exclude.includes(PROVIDER)) return null;
    const p = await this.prisma.liveProgram.findUnique({ where: { id: itemId } });
    if (!p?.replayPath || !p.playable || p.endsAt > new Date()) return null;
    if (!p.playbackUrl) {
      const found = await this.adapter.resolveReplay?.(p.replayPath);
      await this.prisma.liveProgram.update({
        where: { id: p.id },
        data: found ? { playbackUrl: found.playbackUrl, durationSec: found.durationSec } : { playable: false },
      });
      if (!found) {
        this.logger.log(`Replay ${p.id} (${p.title}) cannot be played here`);
        return null;
      }
      return { itemId, provider: PROVIDER, type: 'native-hls', url: found.playbackUrl, durationSec: found.durationSec };
    }
    return { itemId, provider: PROVIDER, type: 'native-hls', url: p.playbackUrl, durationSec: p.durationSec };
  }
}
