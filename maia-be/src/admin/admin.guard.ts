import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.guard.js';
import { AccountStatus, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Runs after AuthGuard: the caller must be an ACTIVE account with role ADMIN.
// Checked against the database on every call, so a demoted or suspended admin
// loses access at once (the access token alone would still be valid 15 min).
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const { user } = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: { role: true, status: true },
    });
    if (account?.role !== Role.ADMIN || account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'NOT_ADMIN', message: 'Serve un account amministratore.' });
    }
    return true;
  }
}
