import { describe, expect, it, vi } from 'vitest';
import type { MailService } from '../mail/mail.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { sha256 } from './crypto.js';
import { cleanCode, newPairingCode } from './pairing.service.js';
import { newCode, sameCode, TwoFactorService } from './two-factor.service.js';

const TOKEN = 'challenge';
const hash = (code: string) => sha256(`${TOKEN}:${code}`);
const row = (over = {}) => ({
  id: 'c',
  accountId: 'a',
  purpose: 'LOGIN',
  codeHash: hash('123456'),
  attempts: 0,
  usedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 60_000),
  sentAt: new Date(Date.now() - 60_000),
  ...over,
});

function service(found: ReturnType<typeof row> | null, counted = 1) {
  const emailCode = {
    findUnique: vi.fn().mockResolvedValue(found),
    updateMany: vi.fn().mockResolvedValue({ count: counted }),
    update: vi.fn().mockResolvedValue({}),
  };
  const prisma = { emailCode } as unknown as PrismaService;
  return { twoFactor: new TwoFactorService(prisma, { send: vi.fn() } as unknown as MailService), emailCode };
}

describe('TwoFactorService.check', () => {
  it('accepts the right code and gives the account', async () => {
    await expect(service(row()).twoFactor.check(TOKEN, '123456', 'LOGIN')).resolves.toBe('a');
  });

  it('says how many tries are left', async () => {
    await expect(service(row({ attempts: 1 })).twoFactor.check(TOKEN, '000000', 'LOGIN')).rejects.toMatchObject({
      response: { code: 'CODE_WRONG', message: 'Codice sbagliato. Tentativi rimasti: 3.' },
    });
  });

  it('ends the challenge at the last wrong try', async () => {
    const { twoFactor, emailCode } = service(row({ attempts: 4 }));
    await expect(twoFactor.check(TOKEN, '000000', 'LOGIN')).rejects.toMatchObject({ response: { code: 'CODE_EXPIRED' } });
    expect(emailCode.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a used, expired, unknown or other-purpose challenge, even with the right code', async () => {
    for (const found of [row({ usedAt: new Date() }), row({ expiresAt: new Date(Date.now() - 1) }), row({ purpose: 'ENABLE_2FA' }), null]) {
      await expect(service(found).twoFactor.check(TOKEN, '123456', 'LOGIN')).rejects.toMatchObject({ response: { code: 'CODE_EXPIRED' } });
    }
  });

  it('refuses when the attempts ran out in a parallel request', async () => {
    await expect(service(row(), 0).twoFactor.check(TOKEN, '123456', 'LOGIN')).rejects.toMatchObject({ response: { code: 'CODE_EXPIRED' } });
  });
});

describe('TwoFactorService.resend', () => {
  it('waits between two emails', async () => {
    await expect(service(row({ sentAt: new Date() })).twoFactor.resend(TOKEN)).rejects.toMatchObject({ response: { code: 'CODE_TOO_SOON' } });
  });
});

describe('TwoFactorService.issue', () => {
  it('says so when the email did not leave', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      emailCode: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), create },
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const mail = { send: vi.fn().mockResolvedValue(false) } as unknown as MailService;
    await expect(new TwoFactorService(prisma, mail).issue({ id: 'a', email: 'a@b.it' }, 'LOGIN')).rejects.toMatchObject({
      response: { code: 'MAIL_FAILED' },
    });
  });
});

describe('codes', () => {
  it('are six digits, padded', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it('compare without caring about different lengths', () => {
    expect(sameCode('abc', 'abc')).toBe(true);
    expect(sameCode('abc', 'abcd')).toBe(false);
  });

  it('for a TV skip the characters that look alike, and survive spaces and lowercase', () => {
    for (let i = 0; i < 200; i++) expect(newPairingCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(cleanCode(' ab3-d7k ')).toBe('AB3D7K');
  });
});
