import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import {
  ChallengeDto,
  EmailDto,
  ErrorDto,
  LoginDto,
  LoginResultDto,
  PairingCodeDto,
  PairingInfoDto,
  PairingPollDto,
  PairingStartDto,
  PairingStatusDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
  VerifyCodeDto,
} from './dto.js';
import { PairingService } from './pairing.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { ApiProperty } from '@nestjs/swagger';

class VerifyEmailResponse {
  @ApiProperty({ enum: ['PENDING_EMAIL', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'] })
  status: string;
}

const refreshCookie = (req: Request) => (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

// Sign-up, email confirmation, login/logout and password reset. Stricter rate
// limit than the rest of the API: these endpoints are the ones worth brute-forcing.
@ApiTags('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly pairing: PairingService,
  ) {}

  @Post('register')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Account creato; email di conferma inviata." })
  @ApiConflictResponse({ type: ErrorDto, description: 'EMAIL_TAKEN' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('resend-verification')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Sempre 204: se l'account aspetta la conferma, l'email parte di nuovo." })
  resendVerification(@Body() dto: EmailDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOkResponse({ type: VerifyEmailResponse })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'TOKEN_INVALID' })
  verifyEmail(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResultDto, description: 'Cookie di sessione impostati, oppure codice inviato per email.' })
  @ApiUnauthorizedResponse({ type: ErrorDto, description: 'INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({ type: ErrorDto, description: 'EMAIL_NOT_VERIFIED, PENDING_APPROVAL, SUSPENDED' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResultDto> {
    const result = await this.auth.login(dto.email, dto.password, req.get('user-agent'));
    if ('challenge' in result) return { twoFactor: true, challenge: result.challenge };
    setAuthCookies(res, result.tokens.access, result.tokens.refresh);
    return { twoFactor: false };
  }

  @Post('login/verify')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Codice giusto: cookie di sessione impostati.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'CODE_WRONG, CODE_EXPIRED' })
  async verifyLogin(@Body() dto: VerifyCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.verifyLogin(dto.challenge, dto.code, req.get('user-agent'));
    setAuthCookies(res, tokens.access, tokens.refresh);
  }

  @Post('login/resend')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Nuovo codice inviato.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'CODE_EXPIRED, CODE_TOO_SOON' })
  resendCode(@Body() dto: ChallengeDto) {
    return this.twoFactor.resend(dto.challenge);
  }

  // Login on a TV from a phone (docs/access.md): the TV starts and asks...
  @Post('pair/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ type: PairingStartDto })
  async startPairing(@Req() req: Request): Promise<PairingStartDto> {
    const { token, code, expiresAt } = await this.pairing.start(req.get('user-agent'));
    return { token, code, expiresAt: expiresAt.toISOString() };
  }

  @Post('pair/poll')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: PairingStatusDto, description: 'approved: cookie di sessione impostati.' })
  async pollPairing(@Body() dto: PairingPollDto, @Res({ passthrough: true }) res: Response): Promise<PairingStatusDto> {
    const { status, tokens } = await this.auth.pairingResult(dto.token);
    if (tokens) setAuthCookies(res, tokens.access, tokens.refresh);
    return { status };
  }

  // ...and a phone with a session answers.
  @Get('pair/:code')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: PairingInfoDto })
  @ApiNotFoundResponse({ type: ErrorDto, description: 'PAIRING_NOT_FOUND' })
  describePairing(@Param('code') code: string): Promise<PairingInfoDto> {
    return this.pairing.describe(code);
  }

  @Post('pair/approve')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorDto, description: 'PAIRING_NOT_FOUND' })
  approvePairing(@CurrentUser() user: AuthUser, @Body() dto: PairingCodeDto) {
    return this.pairing.approve(dto.code, user.accountId);
  }

  @Post('pair/reject')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorDto, description: 'PAIRING_NOT_FOUND' })
  rejectPairing(@Body() dto: PairingCodeDto) {
    return this.pairing.reject(dto.code);
  }

  @Post('refresh')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiNoContentResponse({ description: 'Nuovi cookie di sessione.' })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(refreshCookie(req));
      setAuthCookies(res, tokens.access, tokens.refresh);
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(refreshCookie(req));
    clearAuthCookies(res);
  }

  @Post('forgot-password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Sempre 204: se l'email esiste parte il link di reimpostazione." })
  forgotPassword(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Password cambiata; tutte le sessioni chiuse.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'TOKEN_INVALID' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
