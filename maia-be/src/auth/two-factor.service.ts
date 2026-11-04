import { randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EmailCodePurpose } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { newSecret, sha256 } from './crypto.js';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_GAP_MS = 30_000;

// A code is tied to its challenge token: six digits alone would be trivial to
// reverse from a leaked hash.
const codeHash = (token: string, code: string) => sha256(`${token}:${code}`);
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const expired = () => new BadRequestException({ code: 'CODE_EXPIRED', message: 'Codice scaduto. Richiedine uno nuovo.' });

export function sameCode(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Two-step verification by email: a six-digit code that lasts 10 minutes and
// allows 5 tries. The challenge token ties it to the browser that asked for it.
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Sends a new code, voiding the previous ones. Returns the challenge token.
  async issue(account: { id: string; email: string }, purpose: EmailCodePurpose): Promise<string> {
    const token = newSecret();
    const code = newCode();
    await this.prisma.$transaction([
      this.prisma.emailCode.updateMany({
        where: { accountId: account.id, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailCode.create({
        data: {
          accountId: account.id,
          purpose,
          tokenHash: sha256(token),
          codeHash: codeHash(token, code),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      }),
    ]);
    await this.sendCode(account.email, code);
    return token;
  }

  // A new code for the same challenge, once every 30 seconds at most.
  async resend(token: string) {
    const row = await this.prisma.emailCode.findUnique({ where: { tokenHash: sha256(token) }, include: { account: true } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw expired();
    if (Date.now() - row.sentAt.getTime() < RESEND_GAP_MS) {
      throw new BadRequestException({ code: 'CODE_TOO_SOON', message: 'Aspetta qualche secondo prima di chiederne un altro.' });
    }
    const code = newCode();
    await this.prisma.emailCode.update({
      where: { id: row.id },
      data: { codeHash: codeHash(token, code), attempts: 0, sentAt: new Date(), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });
    await this.sendCode(row.account.email, code);
  }

  // Spends the code; returns the account it belongs to. Refuses a wrong one,
  // and after 5 tries the challenge is over.
  async check(token: string, code: string, purpose: EmailCodePurpose): Promise<string> {
    const row = await this.prisma.emailCode.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) throw expired();
    // Counted before comparing, in one step: parallel tries cannot get extra attempts.
    const { count } = await this.prisma.emailCode.updateMany({
      where: { id: row.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (!count) throw expired();
    if (!sameCode(row.codeHash, codeHash(token, code))) {
      const left = MAX_ATTEMPTS - row.attempts - 1;
      if (left <= 0) {
        await this.prisma.emailCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
        throw expired();
      }
      throw new BadRequestException({ code: 'CODE_WRONG', message: `Codice sbagliato. Tentativi rimasti: ${left}.` });
    }
    const spent = await this.prisma.emailCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!spent.count) throw expired();
    return row.accountId;
  }

  private async sendCode(to: string, code: string) {
    const sent = await this.mail.send({
      to,
      subject: `${code} è il tuo codice MAIA`,
      lines: [
        `Il tuo codice di accesso a MAIA è ${code}.`,
        'Vale 10 minuti. Se non stai accedendo tu, qualcuno conosce la tua password: cambiala subito.',
      ],
    });
    // Waiting for a code that never left would be worse than saying so.
    if (!sent) throw new ServiceUnavailableException({ code: 'MAIL_FAILED', message: "Non riesco a inviare l'email con il codice. Riprova tra poco." });
  }
}
