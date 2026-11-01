import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { setStoppedHosts } from './polite-fetch.js';
import { SERVICES } from './services.js';

// How often each process re-reads the switches. The backend and the catalog
// worker (a separate process in local dev) both poll, so a switch flipped in
// the panel reaches every process within this time.
const POLL_MS = 3000;

// Admin on/off switches for the outside services (panel /admin). A service
// switched off gets no request at all: polite-fetch refuses its hosts.
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

  private async refresh() {
    try {
      const off = await this.prisma.providerHealth.findMany({ where: { enabled: false }, select: { provider: true } });
      const stopped = new Set(off.map((s) => s.provider));
      const hosts = new Map<string, string>();
      for (const s of SERVICES) if (stopped.has(s.id)) for (const h of s.hosts) hosts.set(h, s.id);
      setStoppedHosts(hosts);
      this.stopped = stopped;
    } catch (err) {
      // Database unreachable: keep the last known switches.
      this.logger.warn(`Could not read the service switches: ${String(err)}`);
    }
  }
}
