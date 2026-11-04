import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { ErrorDto } from '../auth/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Streaming source only: the address in use' })
  baseUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Streaming source only: the default address' })
  defaultBaseUrl: string | null;
}

class SwitchDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

const notFound = () => new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'Servizio sconosciuto.' });

class BaseUrlDto {
  @ApiPropertyOptional({ nullable: true, type: String, example: 'http://192.168.1.9', description: 'null = back to the default' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string | null;
}

class BaseUrlResultDto {
  @ApiProperty() baseUrl: string;
}

// The outside services MAIA talks to: an on/off switch for each, and the
// address of the streaming source.
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
    const health = await this.prisma.providerHealth.findMany({
      select: { provider: true, enabled: true, switchedAt: true, switchedBy: true },
    });
    return SERVICES.map((s) => {
      const h = health.find((x) => x.provider === s.id);
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        enabled: h?.enabled ?? true,
        switchedAt: h?.switchedAt?.toISOString() ?? null,
        switchedBy: h?.switchedBy ?? null,
        baseUrl: s.baseUrl ? baseUrl(s.id) : null,
        defaultBaseUrl: defaultBaseUrl(s.id),
      };
    });
  }

  // The address of the streaming source (e.g. the home server's IP).
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
    await this.switches.setBaseUrl(id, url, admin.email);
    return { baseUrl: baseUrl(id) };
  }

  @Post(':id')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Applied at once' })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SERVICE_NOT_FOUND' })
  async set(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: SwitchDto) {
    if (!SERVICES.some((s) => s.id === id)) throw notFound();
    const admin = await this.prisma.account.findUniqueOrThrow({ where: { id: me.accountId }, select: { email: true } });
    await this.switches.set(id, dto.enabled, admin.email);
  }
}
