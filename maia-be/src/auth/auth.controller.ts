import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import { EmailDto, ErrorDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto.js';
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
  constructor(private readonly auth: AuthService) {}

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
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Accesso eseguito: cookie di sessione impostati.' })
  @ApiUnauthorizedResponse({ type: ErrorDto, description: 'INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({ type: ErrorDto, description: 'EMAIL_NOT_VERIFIED, PENDING_APPROVAL, SUSPENDED' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.password, req.get('user-agent'));
    setAuthCookies(res, tokens.access, tokens.refresh);
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
