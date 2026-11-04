import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// A session confirmed alive is not asked about again for this long: the video
// proxy makes several requests a second. A session closed from the app is
// forgotten at once; one closed any other way ends within this time.
const CONFIRMED_MS = 15_000;
// How stale "last used" may get: enough for "in use now", without a write per request.
const LAST_USED_MS = 5 * 60_000;

// Whether an access token's session is still open. The token alone lives 15
// minutes: without this a device disconnected from another one would keep going.
@Injectable()
export class SessionCheck {
  private readonly confirmed = new Map<string, { accountId: string; until: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async isOpen(sessionId: string, accountId: string): Promise<boolean> {
    const now = Date.now();
    const known = this.confirmed.get(sessionId);
    if (known && known.until > now && known.accountId === accountId) return true;
    this.confirmed.delete(sessionId);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { accountId: true, revokedAt: true, expiresAt: true, lastUsedAt: true },
    });
    if (!session || session.accountId !== accountId || session.revokedAt || session.expiresAt.getTime() < now) return false;
    this.confirmed.set(sessionId, { accountId, until: now + CONFIRMED_MS });
    if (now - session.lastUsedAt.getTime() > LAST_USED_MS) {
      await this.prisma.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date(now) } });
    }
    return true;
  }

  forget(sessionIds: string[]) {
    for (const id of sessionIds) this.confirmed.delete(id);
  }
}
