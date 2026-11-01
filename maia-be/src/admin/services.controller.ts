import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { CacheService } from '../cache/cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACTIVITY_FILTERS, CatalogActivity, type ActivityFilter } from '../tv/catalog/catalog.activity.js';
import { CatalogScheduler, type PassState } from '../tv/catalog/catalog.scheduler.js';
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
  @ApiPropertyOptional({
    nullable: true,
    enum: ['waiting', 'running', 'retry'],
    description: 'The full pass: waiting = queued, not started yet; null = none',
  })
  passState: 'waiting' | 'running' | 'retry' | null;
  @ApiProperty({ description: 'A catalog worker is running: without one a queued pass does not start' })
  workerOnline: boolean;
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

class ActivityQueryDto {
  @ApiPropertyOptional({ description: 'One catalog source; all of them when absent' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional({
    enum: ACTIVITY_FILTERS,
    default: 'all',
    description: 'created / updated (gone from the service included) / unchanged titles, errors, or all (passes included)',
  })
  @IsOptional()
  @IsIn([...ACTIVITY_FILTERS])
  filter?: ActivityFilter;

  @ApiPropertyOptional({ description: 'Last event id of the previous page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class ActiveTitleDto {
  @ApiProperty() externalId: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null for a title not read before' }) name: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) startedAt: string | null;
}

class ActivityEventDto {
  @ApiProperty() id: number;
  @ApiProperty() source: string;
  @ApiProperty({
    description:
      'Titles: created | updated | unchanged | missing | failed. Passes: pass-queued | pass-cancelled | pass-start | pass-done | pass-aborted | pass-failed | check',
  })
  kind: string;
  @ApiPropertyOptional({ nullable: true, type: String }) externalId: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) name: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Full passes: titles listed by the service' }) found: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Passes and checks: titles queued' }) queued: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Error, who pressed, or the kind of pass (fill / refresh)' })
  message: string | null;
  @ApiProperty() at: string;
}

class WorkerStateDto {
  @ApiProperty({ description: 'A catalog worker is running (heartbeat within 90 s)' }) online: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) startedAt: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Last heartbeat' }) seenAt: string | null;
}

class PassStateDto {
  @ApiProperty({ enum: ['waiting', 'running', 'retry'], description: 'waiting = queued, no worker took it yet' })
  state: 'waiting' | 'running' | 'retry';
  @ApiProperty({ description: 'Queued at (waiting, retry) or started at (running)' }) since: string;
}

class SourceLiveDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: PassStateDto, description: 'The full pass waiting or running, if any' })
  pass: PassStateDto | null;
  @ApiProperty({ description: 'Titles waiting in the queue' }) queued: number;
  @ApiProperty({ description: 'Titles waiting to try again after an error' }) retrying: number;
  @ApiProperty({ description: 'Titles left halfway by a worker that stopped; retried when a worker runs again' })
  stalled: number;
  @ApiProperty({ type: [ActiveTitleDto], description: 'Titles being read right now' }) active: ActiveTitleDto[];
}

class ActivityLogDto {
  @ApiProperty({ type: WorkerStateDto }) worker: WorkerStateDto;
  @ApiProperty({ type: [SourceLiveDto], description: 'Every catalog source, in panel order' }) sources: SourceLiveDto[];
  @ApiProperty({ type: [ActivityEventDto], description: 'Newest first' }) events: ActivityEventDto[];
  @ApiProperty({ description: 'Older events exist (ask again with before = last id)' }) more: boolean;
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
    private readonly activity: CatalogActivity,
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
    const passes = new Map<string, PassState | null>();
    for (const s of SERVICES.filter((x) => x.catalog)) passes.set(s.id, (await this.scheduler.pass(s.id))?.state ?? null);
    const workerOnline = await this.activity.workerOnline();
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
        sync: s.catalog ? this.syncInfo(h, runs.find((r) => r.provider === s.id), passes.get(s.id) ?? null, workerOnline) : null,
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
  async syncNow(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (!SERVICES.some((s) => s.id === id && s.catalog)) throw notFound();
    if (this.switches.isStopped(id)) {
      throw new ConflictException({ code: 'SERVICE_OFF', message: 'Il servizio è spento: riaccendilo prima di aggiornarlo.' });
    }
    if (!(await this.scheduler.runNow(id))) {
      throw new ConflictException({ code: 'ALREADY_RUNNING', message: 'Un aggiornamento è già in corso.' });
    }
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.activity.passQueued(id, admin.email);
  }

  // Takes a queued full pass back out before it starts (e.g. pressed by mistake,
  // or the worker is off). A running pass is stopped with the service switch.
  @Delete(':id/sync-now')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorDto, description: 'NOT_QUEUED' })
  async cancelSyncNow(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (!SERVICES.some((s) => s.id === id && s.catalog)) throw notFound();
    if (!(await this.scheduler.cancelQueued(id))) {
      throw new ConflictException({
        code: 'NOT_QUEUED',
        message: 'Nessuna passata in coda: è già partita (per fermarla spegni il servizio) o è già finita.',
      });
    }
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.activity.passCancelled(id, admin.email);
  }

  // The catalog log: what the worker is doing now (per source) and what it did
  // in the last week, newest first, filtered by outcome and source. Database only.
  @Get('activity')
  @ApiOkResponse({ type: ActivityLogDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  async activityLog(@Query() q: ActivityQueryDto): Promise<ActivityLogDto> {
    if (q.source && !SERVICES.some((s) => s.id === q.source && s.catalog)) throw notFound();
    const [live, page] = await Promise.all([
      this.activity.live(),
      this.activity.events(q.source, q.filter ?? 'all', q.before, q.limit ?? 50),
    ]);
    return {
      worker: {
        online: live.worker.online,
        startedAt: live.worker.startedAt?.toISOString() ?? null,
        seenAt: live.worker.seenAt?.toISOString() ?? null,
      },
      sources: SERVICES.filter((s) => s.catalog).map((s) => {
        const src = live.source(s.id);
        return {
          id: s.id,
          name: s.name,
          pass: src.pass ? { state: src.pass.state as PassStateDto['state'], since: src.pass.since.toISOString() } : null,
          queued: src.queued,
          retrying: src.retrying,
          stalled: src.stalled,
          active: src.active.map((a) => ({ externalId: a.externalId, name: a.name, startedAt: a.startedOn?.toISOString() ?? null })),
        };
      }),
      events: page.events.map((e) => ({
        id: e.id,
        source: e.provider,
        kind: e.kind,
        externalId: e.externalId,
        name: e.name,
        found: e.found,
        queued: e.queued,
        message: e.message,
        at: e.at.toISOString(),
      })),
      more: page.more,
    };
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
    pass: PassState | null,
    workerOnline: boolean,
  ): SyncInfoDto {
    return {
      mode: h?.syncMode ?? DEFAULT_SYNC.mode,
      at: h?.syncAt ?? DEFAULT_SYNC.at,
      everyHours: h ? h.syncEveryHours : DEFAULT_SYNC.everyHours,
      lastRun: run
        ? { startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, status: run.status, found: run.found }
        : null,
      lastCheckAt: h?.lastCheckAt?.toISOString() ?? null,
      running: pass !== null,
      passState: pass,
      workerOnline,
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
