import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, CurrentUser, type AuthUser } from '../auth/auth.guard.js';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { deviceOf } from '../auth/device.js';
import { ErrorDto, PASSWORD_MIN } from '../auth/dto.js';
import { SessionCheck } from '../auth/session-check.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileDto, toProfileDto } from '../profiles/profiles.controller.js';

class AccountDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['USER', 'ADMIN'] }) role: string;
  @ApiProperty({ description: 'A code by email after the password' }) twoFactor: boolean;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: [ProfileDto] }) profiles: ProfileDto[];
}

class TwoFactorChallengeDto {
  @ApiProperty() challenge: string;
}

class EnableTwoFactorDto {
  @ApiProperty() @IsString() @MaxLength(100) challenge: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code: string;
}

class DisableTwoFactorDto {
  @ApiProperty() @IsString() @MaxLength(200) password: string;
}

class SessionDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'A readable guess from the user agent' }) device: string;
  @ApiProperty({ enum: ['tv', 'phone', 'tablet', 'computer', 'other'] }) kind: string;
  @ApiProperty({ description: 'Signed in on' }) createdAt: string;
  @ApiProperty() lastUsedAt: string;
  @ApiProperty({ description: 'The device making this request' }) current: boolean;
}

class UpdateAccountDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  name: string;
}

class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(200) currentPassword: string;
  @ApiProperty({ minLength: PASSWORD_MIN }) @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) newPassword: string;
}

// The signed-in account: details, name change, password change, connected devices.
@ApiTags('account')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionCheck,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AccountDto })
  async me(@CurrentUser() user: AuthUser): Promise<AccountDto> {
    const a = await this.prisma.account.findUniqueOrThrow({
      where: { id: user.accountId },
      include: { profiles: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      twoFactor: a.twoFactor,
      createdAt: a.createdAt.toISOString(),
      profiles: a.profiles.map(toProfileDto),
    };
  }

  @Patch()
  @HttpCode(204)
  @ApiNoContentResponse()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAccountDto) {
    await this.prisma.account.update({ where: { id: user.accountId }, data: { name: dto.name } });
  }

  @Post('password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Password cambiata; le altre sessioni vengono chiuse.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'WRONG_PASSWORD' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.accountId } });
    if (!(await verifyPassword(dto.currentPassword, account.passwordHash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'La password attuale non è corretta.' });
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: account.id },
        data: { passwordHash: await hashPassword(dto.newPassword) },
      }),
      // Other devices are logged out; this one stays signed in.
      this.prisma.session.updateMany({
        where: { accountId: account.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // Two-step verification goes on only with a code received: proof that the
  // emails arrive, or the next login would lock the account out.
  @Post('two-factor/start')
  @HttpCode(200)
  @ApiOkResponse({ type: TwoFactorChallengeDto })
  async startTwoFactor(@CurrentUser() user: AuthUser): Promise<TwoFactorChallengeDto> {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.accountId } });
    return { challenge: await this.twoFactor.issue(account, 'ENABLE_2FA') };
  }

  @Post('two-factor/enable')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorDto, description: 'CODE_WRONG, CODE_EXPIRED' })
  async enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: EnableTwoFactorDto) {
    const accountId = await this.twoFactor.check(dto.challenge, dto.code, 'ENABLE_2FA');
    if (accountId !== user.accountId) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'Codice scaduto. Richiedine uno nuovo.' });
    }
    await this.prisma.account.update({ where: { id: accountId }, data: { twoFactor: true } });
  }

  @Post('two-factor/disable')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorDto, description: 'WRONG_PASSWORD' })
  async disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto) {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.accountId } });
    if (!(await verifyPassword(dto.password, account.passwordHash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'La password non è corretta.' });
    }
    await this.prisma.account.update({ where: { id: account.id }, data: { twoFactor: false } });
  }

  // The devices signed in to this account: this one first, then the latest used.
  @Get('sessions')
  @ApiOkResponse({ type: [SessionDto] })
  async listSessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    const rows = await this.prisma.session.findMany({
      where: { accountId: user.accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows
      .map((s) => ({
        id: s.id,
        ...deviceOf(s.userAgent),
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        current: s.id === user.sessionId,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  }

  // Disconnects every other device; this one stays signed in.
  @Delete('sessions')
  @HttpCode(204)
  @ApiNoContentResponse()
  async closeOtherSessions(@CurrentUser() user: AuthUser) {
    const others = await this.prisma.session.findMany({
      where: { accountId: user.accountId, revokedAt: null, id: { not: user.sessionId } },
      select: { id: true },
    });
    const ids = others.map((s) => s.id);
    await this.prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } });
    this.sessions.forget(ids);
  }

  // Disconnects one device of this account: it stops at its next request.
  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorDto, description: 'CURRENT_SESSION: to leave this device, log out' })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'SESSION_NOT_FOUND' })
  async closeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (id === user.sessionId) {
      throw new BadRequestException({ code: 'CURRENT_SESSION', message: 'Per uscire da questo dispositivo usa "Esci da MAIA".' });
    }
    const { count } = await this.prisma.session.updateMany({
      where: { id, accountId: user.accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Questo dispositivo non è più connesso.' });
    this.sessions.forget([id]);
  }
}
