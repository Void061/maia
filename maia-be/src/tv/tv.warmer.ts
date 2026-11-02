import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import type { TitleKind } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TvService, VISIBLE } from './tv.service.js';

// Title pages computed at the same time while warming.
const PARALLEL = 4;
const KINDS: TitleKind[] = ['MOVIE', 'SERIES'];

// After the cache is dropped (a catalog job changed something) goes through
// MAIA like a visitor would, so nobody waits for a cold cache: first the pages
// (home, genres, lists exactly as maia-fe asks for them), then every title.
// It calls the same TvService methods as the API, so the keys always match.
// A new invalidation stops the round under way and starts a fresh one.
@Injectable()
export class TvCacheWarmer implements OnModuleInit {
  private readonly logger = new Logger(TvCacheWarmer.name);
  private round = 0;

  constructor(
    private readonly tv: TvService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit() {
    if (process.env.VITEST) return;
    this.cache.onInvalidated(() => void this.warm());
  }

  async warm() {
    const round = ++this.round;
    const current = () => round === this.round;
    const started = Date.now();
    let done = 0;
    const visit = async (load: () => Promise<unknown>) => {
      if (!current()) return;
      await load().catch(() => undefined); // a broken page must not stop the round
      done++;
    };

    // Pages, in the order people open them.
    await visit(() => this.tv.home());
    await visit(() => this.tv.genres());
    await visit(() => this.tv.titles({ take: 14 })); // search suggestions
    for (const kind of KINDS) {
      await visit(() => this.tv.titles({ kind, take: 20 }));
      for (const g of await this.tv.genres(kind).catch(() => [])) {
        await visit(() => this.tv.titles({ kind, genre: g.slug, take: 20 }));
        await visit(() => this.tv.titles({ kind, genre: g.slug, take: 200 }));
      }
    }
    for (const g of await this.tv.genres().catch(() => [])) {
      await visit(() => this.tv.titles({ genre: g.slug, take: 200 }));
    }
    if (!current()) return;
    const pages = done;

    // Every visible title, the most recently updated first.
    const titles = await this.prisma.title.findMany({ where: VISIBLE, select: { id: true }, orderBy: { updatedAt: 'desc' } });
    for (let i = 0; i < titles.length && current(); i += PARALLEL) {
      await Promise.all(titles.slice(i, i + PARALLEL).map((t) => visit(() => this.tv.title(t.id))));
    }
    if (!current()) return;
    const secs = Math.round((Date.now() - started) / 1000);
    this.logger.log(`Cache warmed: ${pages} pages and ${done - pages} titles in ${secs}s`);
  }
}
