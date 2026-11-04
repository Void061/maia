import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SessionCheck } from './session-check.js';

const row = (over = {}) => ({
  accountId: 'a',
  revokedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 60_000),
  lastUsedAt: new Date(),
  ...over,
});

function check(result: ReturnType<typeof row> | null) {
  const findUnique = vi.fn().mockResolvedValue(result);
  const update = vi.fn().mockResolvedValue({});
  const prisma = { session: { findUnique, update } } as unknown as PrismaService;
  return { sessions: new SessionCheck(prisma), findUnique, update };
}

describe('SessionCheck', () => {
  it('accepts an open session and does not ask again right away', async () => {
    const { sessions, findUnique } = check(row());
    expect(await sessions.isOpen('s', 'a')).toBe(true);
    expect(await sessions.isOpen('s', 'a')).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('refuses a closed, expired, missing or foreign session', async () => {
    expect(await check(row({ revokedAt: new Date() })).sessions.isOpen('s', 'a')).toBe(false);
    expect(await check(row({ expiresAt: new Date(Date.now() - 1) })).sessions.isOpen('s', 'a')).toBe(false);
    expect(await check(null).sessions.isOpen('s', 'a')).toBe(false);
    expect(await check(row({ accountId: 'other' })).sessions.isOpen('s', 'a')).toBe(false);
  });

  it('a confirmed session only counts for its own account', async () => {
    const { sessions } = check(row());
    expect(await sessions.isOpen('s', 'a')).toBe(true);
    expect(await sessions.isOpen('s', 'other')).toBe(false);
  });

  it('asks again once forgotten: a disconnected device stops at once', async () => {
    const { sessions, findUnique } = check(row());
    await sessions.isOpen('s', 'a');
    findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
    expect(await sessions.isOpen('s', 'a')).toBe(true); // still confirmed
    sessions.forget(['s']);
    expect(await sessions.isOpen('s', 'a')).toBe(false);
  });

  it('keeps "last used" fresh without writing at every request', async () => {
    const fresh = check(row());
    await fresh.sessions.isOpen('s', 'a');
    expect(fresh.update).not.toHaveBeenCalled();
    const stale = check(row({ lastUsedAt: new Date(Date.now() - 10 * 60_000) }));
    await stale.sessions.isOpen('s', 'a');
    expect(stale.update).toHaveBeenCalledTimes(1);
  });
});
