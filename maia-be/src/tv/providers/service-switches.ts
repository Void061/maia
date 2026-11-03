import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assetsUrl, baseUrl, serviceHosts, setBaseUrlOverrides } from './base-urls.js';
import { setStoppedHosts } from './polite-fetch.js';
import { SERVICES } from './services.js';

// How often each process re-reads the switches. The backend and the catalog
// worker (a separate process in local dev) both poll, so a switch flipped in
// the panel reaches every process within this time.
const POLL_MS = 3000;

// Admin on/off switches for the outside services (panel /admin). A service
// switched off gets no request at all: polite-fetch refuses its hosts. Also
// keeps the catalog sources' addresses (base-urls.ts) in sync.
@Injectable()
export class ServiceSwitches implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceSwitches.name);
  private stopped = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.VITEST) return;
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isStopped(service: string) {
    return this.stopped.has(service);
  }

  // Flips a switch and applies it in this process at once (the others pick it
  // up at their next poll).
  async set(service: string, enabled: boolean, by: string) {
    await this.prisma.providerHealth.upsert({
      where: { provider: service },
      create: { provider: service, enabled, switchedAt: new Date(), switchedBy: by },
      update: { enabled, switchedAt: new Date(), switchedBy: by },
    });
    this.logger.warn(`${service} switched ${enabled ? 'on' : 'OFF'} by ${by}`);
    await this.refresh();
    // Back on: the titles put off while it was off start now, not in 10 minutes
    // (TMDB serves every catalog service, so all of them).
    if (enabled) {
      await this.prisma.$executeRaw`
        UPDATE pgboss.job SET start_after = now()
         WHERE name = 'catalog-sync-title' AND state = 'created' AND start_after > now()
           AND (${service} = 'tmdb' OR data->>'provider' = ${service})`.catch(() => undefined);
    }
  }

  // Changes the address a catalog source is read from (null = back to the
  // default). The video links already saved with the old address move to the
  // new one in the database, without any request to the source (pictures keep
  // only their path: assets.ts). Returns how many links moved.
  async setBaseUrl(service: string, url: string | null, by: string): Promise<number> {
    const old = baseUrl(service);
    await this.prisma.providerHealth.upsert({
      where: { provider: service },
      create: { provider: service, baseUrl: url },
      update: { baseUrl: url },
    });
    await this.refresh();
    const next = baseUrl(service);
    this.logger.warn(`${service} address set to ${next} by ${by}`);
    if (next === old) return 0;
    // The slash keeps http://192.168.1.9 from matching http://192.168.1.90.
    const from = `${old}/`;
    const to = `${next}/`;
    const skip = from.length + 1;
    const moved = await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE sources SET playback_url = ${to} || substr(playback_url, ${skip})
                               WHERE provider = ${service} AND starts_with(playback_url, ${from})`,
      this.prisma.$executeRaw`UPDATE extras SET playback_url = ${to} || substr(playback_url, ${skip})
                               WHERE starts_with(playback_url, ${from})`,
    ]);
    return moved.reduce((a, b) => a + b, 0);
  }

  // Where a service's pictures are read from (null = the default). Nothing to
  // move: the database keeps only the pictures' paths.
  async setAssetsUrl(service: string, url: string | null, by: string) {
    await this.prisma.providerHealth.upsert({
      where: { provider: service },
      create: { provider: service, assetsUrl: url },
      update: { assetsUrl: url },
    });
    await this.refresh();
    this.logger.warn(`${service} pictures address set to ${assetsUrl(service)} by ${by}`);
  }

  private async refresh() {
    try {
      const rows = await this.prisma.providerHealth.findMany({ select: { provider: true, enabled: true, baseUrl: true, assetsUrl: true } });
      // Addresses first: a switched-off source is stopped at its current address.
      setBaseUrlOverrides(
        new Map(rows.filter((r) => r.baseUrl).map((r) => [r.provider, r.baseUrl!])),
        new Map(rows.filter((r) => r.assetsUrl).map((r) => [r.provider, r.assetsUrl!])),
      );
      const stopped = new Set(rows.filter((r) => !r.enabled).map((r) => r.provider));
      const hosts = new Map<string, string>();
      for (const s of SERVICES) if (stopped.has(s.id)) for (const h of serviceHosts(s.id)) hosts.set(h, s.id);
      setStoppedHosts(hosts);
      this.stopped = stopped;
    } catch (err) {
      // Database unreachable: keep the last known switches.
      this.logger.warn(`Could not read the service switches: ${String(err)}`);
    }
  }
}
