import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Every MAIA key in Redis starts with this, so the whole app cache can be
// dropped at once without touching anything else stored there.
export const CACHE_PREFIX = 'MAIA_APP_';
const FAILS = 'fails:';
// Failure counters forget isolated errors after this long.
const FAIL_WINDOW_SEC = 3600;

// Read-through cache of ready API responses (docs/architecture.md, "Cache").
// Redis is an accelerator, never a dependency: without REDIS_URL, or while
// Redis is down, every call simply computes the value.
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly ttlSec: number;
  private readonly maxFails: number;
  // Same key requested while it is being computed: one computation, shared.
  private readonly inflight = new Map<string, Promise<unknown>>();
  private up = false;

  constructor(config: ConfigService) {
    this.ttlSec = Number(config.get('CACHE_TTL_SECONDS') ?? 86_400);
    this.maxFails = Number(config.get('CACHE_MAX_FAILS') ?? 3);
    const url = config.get<string>('REDIS_URL');
    if (!url || process.env.VITEST) {
      this.redis = null;
      if (!process.env.VITEST) this.logger.warn('REDIS_URL not set: cache off');
      return;
    }
    this.redis = new Redis(url, {
      // Fail fast while disconnected instead of queueing: the caller computes.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 1000, 15_000),
    });
    this.redis.on('ready', () => {
      this.up = true;
      this.logger.log('Redis connected');
    });
    this.redis.on('error', (err) => {
      if (this.up) this.logger.warn(`Redis unavailable, cache off until it is back: ${err.message}`);
      this.up = false;
    });
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  // The cached value of `key`, or `compute()` stored for next time.
  async wrap<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = await this.read<T>(key);
    if (hit !== undefined) return hit;
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const job = compute()
      .then((value) => {
        void this.write(key, value);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  // A cached value turned out wrong (e.g. the device could not play it). After
  // CACHE_MAX_FAILS reports it is deleted, so the next read computes it again.
  // True when it was deleted.
  async fail(key: string): Promise<boolean> {
    if (!this.redis || !this.up) return false;
    try {
      const counter = CACHE_PREFIX + FAILS + key;
      const [[, count]] = (await this.redis.multi().incr(counter).expire(counter, FAIL_WINDOW_SEC).exec()) as [[null, number]];
      if (count < this.maxFails) return false;
      await this.redis.unlink(CACHE_PREFIX + key, counter);
      this.logger.log(`${key}: ${count} failures, dropped from the cache`);
      return true;
    } catch {
      return false;
    }
  }

  // Drops the whole MAIA cache (the catalog changed). Returns the keys removed.
  async invalidateAll(): Promise<number> {
    if (!this.redis || !this.up) return 0;
    let removed = 0;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 500);
        if (keys.length) removed += await this.redis.unlink(...keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${String(err)}`);
    }
    return removed;
  }

  private async read<T>(key: string): Promise<T | undefined> {
    if (!this.redis || !this.up) return undefined;
    let raw: string | null;
    try {
      raw = await this.redis.get(CACHE_PREFIX + key);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Unreadable entry: it can only fail again, drop it now.
      await this.redis.unlink(CACHE_PREFIX + key).catch(() => undefined);
      return undefined;
    }
  }

  private async write(key: string, value: unknown) {
    if (!this.redis || !this.up) return;
    await this.redis.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', this.ttlSec).catch(() => undefined);
  }
}
