import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
  ) {}

  @Get()
  @ApiOkResponse({ type: [AdminServiceDto] })
  async list(): Promise<AdminServiceDto[]> {
    const [health, queued] = await Promise.all([
      this.prisma.providerHealth.findMany(),
      this.prisma.$queryRaw<{ provider: string; n: number }[]>`
        SELECT data->>'provider' AS provider, count(*)::int AS n
          FROM pgboss.job
         WHERE name = 'catalog-sync-title' AND state IN ('created', 'retry')
         GROUP BY 1`.catch(() => []),
    ]);
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
      };
    });
  }

  @Post(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Applied at once in this process, within seconds everywhere' })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  async set(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: SwitchDto) {
    if (!SERVICES.some((s) => s.id === id)) throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'Servizio sconosciuto.' });
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.switches.set(id, dto.enabled, admin.email);
  }
}
