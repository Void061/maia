import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './cookies.js';
import { AuthError } from './dto.js';

export type AuthUser = { accountId: string; sessionId: string };
export type AccessPayload = { sub: string; sid: string };

// Requires a valid access token cookie. Access tokens are issued only to
// ACTIVE accounts and live 15 minutes; maia-fe refreshes them on a 401.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw unauthenticated();
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      req.user = { accountId: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw unauthenticated();
    }
  }
}

const unauthenticated = () =>
  new UnauthorizedException({ code: AuthError.UNAUTHENTICATED, message: 'Sessione assente o scaduta.' });

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
