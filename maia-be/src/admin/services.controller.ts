import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { CacheService } from '../cache/cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogScheduler } from '../tv/catalog/catalog.scheduler.js';
import { CHECK_HOURS, DEFAULT_SYNC } from '../tv/catalog/queues.js';
import { baseUrl, defaultBaseUrl, normalizeBaseUrl } from '../tv/providers/base-urls.js';
import { ServiceSwitches } from '../tv/providers/service-switches.js';
import { SERVICES } from '../tv/providers/services.js';
import { AdminGuard } from './admin.guard.js';

class AdminServiceDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'What MAIA uses the service for' }) role: string;
  @ApiProperty({ description: 'Admin switch: false = no request at all to the service' }) enabled: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) switchedAt: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) switchedBy: string | null;
  @ApiProperty({ enum: ['OK', 'DOWN'], description: 'Automatic pause after errors, independent of the switch' })
  status: 'OK' | 'DOWN';
  @ApiPropertyOptional({ nullable: true, type: String }) pausedUntil: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastSuccessAt: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastError: string | null;
  @ApiProperty({ description: 'Titles waiting in the catalog queue for this service' }) queued: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Catalog sources only: the address in use' })
  baseUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Catalog sources only: the default address' })
  defaultBaseUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: () => SyncInfoDto, description: 'Catalog sources only' })
  sync: SyncInfoDto | null;
}

class LastRunDto {
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional({ nullable: true, type: String }) finishedAt: string | null;
  @ApiProperty({ description: 'running | done | aborted | failed' }) status: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) found: number | null;
}

class SyncInfoDto {
  @ApiProperty({ enum: ['AUTO', 'MANUAL'] }) mode: 'AUTO' | 'MANUAL';
  @ApiProperty({ description: 'Daily full pass, Rome time HH:MM' }) at: string;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Checks every N hours; null = only the daily pass' })
  everyHours: number | null;
  @ApiPropertyOptional({ nullable: true, type: LastRunDto }) lastRun: LastRunDto | null;
  @ApiPropertyOptional({ nullable: true, type: String }) lastCheckAt: string | null;
  @ApiProperty({ description: 'A full pass is queued or running' }) running: boolean;
}

class SyncSettingsDto {
  @ApiProperty({ enum: ['AUTO', 'MANUAL'] })
  @IsIn(['AUTO', 'MANUAL'])
  mode: 'AUTO' | 'MANUAL';

  @ApiProperty({ example: '03:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  at: string;

  @ApiPropertyOptional({ nullable: true, type: Number, enum: CHECK_HOURS })
  @IsOptional()
  @IsIn([...CHECK_HOURS, null])
  everyHours: number | null;
}

const notFound = () => new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'Servizio sconosciuto.' });

class BaseUrlDto {
  @ApiPropertyOptional({ nullable: true, type: String, example: 'http://192.168.1.9', description: 'null = back to the default' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl: string | null;
}

class BaseUrlResultDto {
  @ApiProperty() baseUrl: string;
  @ApiProperty({ description: 'Saved links (videos, pictures) moved to the new address' }) moved: number;
}

class SwitchDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

// Admin panel: on/off switch per outside service, to stop all acquisition from
// a service at once (e.g. it is having problems or complains). docs/tv/catalog.md.
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ type: ErrorDto, description: 'NOT_ADMIN' })
@UseGuards(AuthGuard, AdminGuard)
@Controller('admin/services')
export class AdminServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly switches: ServiceSwitches,
    private readonly scheduler: CatalogScheduler,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [AdminServiceDto] })
  async list(): Promise<AdminServiceDto[]> {
    const [health, queued, runs] = await Promise.all([
      this.prisma.providerHealth.findMany(),
      this.prisma.$queryRaw<{ provider: string; n: number }[]>`
        SELECT data->>'provider' AS provider, count(*)::int AS n
          FROM pgboss.job
         WHERE name = 'catalog-sync-title' AND state IN ('created', 'retry')
         GROUP BY 1`.catch(() => []),
      this.prisma.syncRun.findMany({ distinct: ['provider'], orderBy: { startedAt: 'desc' } }),
    ]);
    const running = new Map<string, boolean>();
    for (const s of SERVICES.filter((x) => x.catalog)) running.set(s.id, await this.scheduler.running(s.id));
    return SERVICES.map((s) => {
      const h = health.find((x) => x.provider === s.id);
      const paused = h?.status === 'DOWN' && h.retryAfter && h.retryAfter > new Date();
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        enabled: h?.enabled ?? true,
        switchedAt: h?.switchedAt?.toISOString() ?? null,
        switchedBy: h?.switchedBy ?? null,
        status: paused ? 'DOWN' : 'OK',
        pausedUntil: paused ? h.retryAfter!.toISOString() : null,
        lastSuccessAt: h?.lastSuccessAt?.toISOString() ?? null,
        lastError: h?.lastError ?? null,
        queued: queued.find((q) => q.provider === s.id)?.n ?? 0,
        baseUrl: s.baseUrl ? baseUrl(s.id) : null,
        defaultBaseUrl: defaultBaseUrl(s.id),
        sync: s.catalog ? this.syncInfo(h, runs.find((r) => r.provider === s.id), running.get(s.id) ?? false) : null,
      };
    });
  }

  // How a catalog source updates: automatic (daily pass + checks) or manual.
  @Patch(':id/sync')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Schedules updated at once' })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  async setSync(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: SyncSettingsDto) {
    if (!SERVICES.some((s) => s.id === id && s.catalog)) throw notFound();
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.scheduler.save(id, { mode: dto.mode, at: dto.at, everyHours: dto.everyHours ?? null }, admin.email);
  }

  // "Aggiorna ora": a full pass of the source now (it re-reads the whole list
  // of the service: hundreds of requests, at the usual pace).
  @Post(':id/sync-now')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorDto, description: 'SERVICE_OFF | ALREADY_RUNNING' })
  async syncNow(@Param('id') id: string) {
    if (!SERVICES.some((s) => s.id === id && s.catalog)) throw notFound();
    if (this.switches.isStopped(id)) {
      throw new ConflictException({ code: 'SERVICE_OFF', message: 'Il servizio è spento: riaccendilo prima di aggiornarlo.' });
    }
    if (!(await this.scheduler.runNow(id))) {
      throw new ConflictException({ code: 'ALREADY_RUNNING', message: 'Un aggiornamento è già in corso.' });
    }
  }

  // The address a catalog source is read from (e.g. the home server's IP).
  // Takes effect at once here, within seconds in the worker; the links already
  // saved move to the new address and the cache is dropped.
  @Patch(':id/base-url')
  @ApiOkResponse({ type: BaseUrlResultDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'INVALID_BASE_URL' })
  async setBaseUrl(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: BaseUrlDto): Promise<BaseUrlResultDto> {
    if (!SERVICES.some((s) => s.id === id && s.baseUrl)) throw notFound();
    let url: string | null = null;
    if (dto.baseUrl) {
      url = normalizeBaseUrl(dto.baseUrl);
      if (!url) {
        throw new BadRequestException({
          code: 'INVALID_BASE_URL',
          message: 'Indirizzo non valido: scrivilo completo, per esempio http://192.168.1.9 o https://server:8443.',
        });
      }
      if (url === defaultBaseUrl(id)) url = null;
    }
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    const moved = await this.switches.setBaseUrl(id, url, admin.email);
    await this.cache.invalidateAll(); // the API builds some links from the address (RaiPlay's image crops)
    return { baseUrl: baseUrl(id), moved };
  }

  private syncInfo(
    h: { syncMode: 'AUTO' | 'MANUAL'; syncAt: string; syncEveryHours: number | null; lastCheckAt: Date | null } | undefined,
    run: { startedAt: Date; finishedAt: Date | null; status: string; found: number | null } | undefined,
    running: boolean,
  ): SyncInfoDto {
    return {
      mode: h?.syncMode ?? DEFAULT_SYNC.mode,
      at: h?.syncAt ?? DEFAULT_SYNC.at,
      everyHours: h ? h.syncEveryHours : DEFAULT_SYNC.everyHours,
      lastRun: run
        ? { startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, status: run.status, found: run.found }
        : null,
      lastCheckAt: h?.lastCheckAt?.toISOString() ?? null,
      running,
    };
  }

  @Post(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Applied at once in this process, within seconds everywhere' })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  async set(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: SwitchDto) {
    if (!SERVICES.some((s) => s.id === id)) throw notFound();
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.switches.set(id, dto.enabled, admin.email);
  }
}
