import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { baseUrl, serviceHosts, setBaseUrlOverrides } from './base-urls.js';
import { setStoppedHosts } from './polite-fetch.js';
import { SERVICES } from './services.js';

// How often the switches are read again.
const POLL_MS = 3000;

// Admin on/off switches for the outside services (panel /admin). A service
// switched off gets no request at all: polite-fetch refuses its hosts. Also
// keeps the streaming source's address (base-urls.ts) in sync.
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

  async set(service: string, enabled: boolean, by: string) {
    await this.prisma.providerHealth.upsert({
      where: { provider: service },
      create: { provider: service, enabled, switchedAt: new Date(), switchedBy: by },
      update: { enabled, switchedAt: new Date(), switchedBy: by },
    });
    this.logger.warn(`${service} switched ${enabled ? 'on' : 'OFF'} by ${by}`);
    await this.refresh();
  }

  // Changes the address of the streaming source (null = back to the default).
  async setBaseUrl(service: string, url: string | null, by: string) {
    await this.prisma.providerHealth.upsert({
      where: { provider: service },
      create: { provider: service, baseUrl: url },
      update: { baseUrl: url },
    });
    await this.refresh();
    this.logger.warn(`${service} address set to ${baseUrl(service)} by ${by}`);
  }

  private async refresh() {
    try {
      const rows = await this.prisma.providerHealth.findMany({ select: { provider: true, enabled: true, baseUrl: true } });
      // Address first: a switched-off source is stopped at its current address.
      setBaseUrlOverrides(new Map(rows.filter((r) => r.baseUrl).map((r) => [r.provider, r.baseUrl!])));
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
