import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Every MAIA key in Redis starts with this.
export const CACHE_PREFIX = 'MAIA_APP_';
// Raise it whenever a cached value changes for the same data: its shape (a
// DTO, a cached internal type) or how it is computed (e.g. how extras are
// grouped). Entries written by the previous code are then never read, and the
// expire on their own.
const CACHE_VERSION = 'v4';
const ns = (key: string) => `${CACHE_PREFIX}${CACHE_VERSION}:${key}`;

// Read-through cache of ready API responses (docs/architecture.md, "Cache").
// Redis is an accelerator, never a dependency: without REDIS_URL, or while
// Redis is down, every call simply computes the value.
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private readonly ttlSec: number;
  // Same key requested while it is being computed: one computation, shared.
  private readonly inflight = new Map<string, Promise<unknown>>();
  private up = false;

  constructor(config: ConfigService) {
    this.ttlSec = Number(config.get('CACHE_TTL_SECONDS') ?? 86_400);
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

  private async read<T>(key: string): Promise<T | undefined> {
    if (!this.redis || !this.up) return undefined;
    let raw: string | null;
    try {
      raw = await this.redis.get(ns(key));
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Unreadable entry: it can only fail again, drop it now.
      await this.redis.unlink(ns(key)).catch(() => undefined);
      return undefined;
    }
  }

  private async write(key: string, value: unknown) {
    if (!this.redis || !this.up) return;
    await this.redis.set(ns(key), JSON.stringify(value), 'EX', this.ttlSec).catch(() => undefined);
  }
}
