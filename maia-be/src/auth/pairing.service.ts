import { randomInt } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { newSecret, sha256 } from './crypto.js';
import { deviceOf } from './device.js';

const PAIRING_TTL_MS = 5 * 60_000;
// No 0/O or 1/I: the code is read off a TV from across the room.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export const newPairingCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const notFound = () =>
  new NotFoundException({ code: 'PAIRING_NOT_FOUND', message: 'Codice scaduto o sbagliato. Controlla quello sulla TV.' });

export type PairingState = { status: 'pending' | 'rejected' | 'expired' } | { status: 'approved'; accountId: string; userAgent: string | null };

// Login on a TV without typing: the TV shows a QR and a code, a phone already
// signed in confirms it. The TV holds a secret token and asks until the answer
// comes; the code alone gets nobody in, it only names the request.
@Injectable()
export class PairingService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userAgent?: string) {
    await this.prisma.devicePairing.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const token = newSecret();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    for (let tries = 0; ; tries++) {
      const code = newPairingCode();
      try {
        await this.prisma.devicePairing.create({ data: { code, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 300), expiresAt } });
        return { token, code, expiresAt };
      } catch (err) {
        if (tries < 3 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
  }

  // What the TV asks. An approval can be collected once.
  async poll(token: string): Promise<PairingState> {
    const row = await this.prisma.devicePairing.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.expiresAt < new Date() || row.status === 'DONE') return { status: 'expired' };
    if (row.status === 'PENDING') return { status: 'pending' };
    if (row.status === 'REJECTED') return { status: 'rejected' };
    const { count } = await this.prisma.devicePairing.updateMany({ where: { id: row.id, status: 'APPROVED' }, data: { status: 'DONE' } });
    if (!count || !row.accountId) return { status: 'expired' };
    return { status: 'approved', accountId: row.accountId, userAgent: row.userAgent };
  }

  // What the phone shows before confirming.
  async describe(code: string) {
    const row = await this.prisma.devicePairing.findFirst({ where: this.waiting(code) });
    if (!row) throw notFound();
    return { device: deviceOf(row.userAgent).device };
  }

  async approve(code: string, accountId: string) {
    const { count } = await this.prisma.devicePairing.updateMany({ where: this.waiting(code), data: { status: 'APPROVED', accountId } });
    if (!count) throw notFound();
  }

  async reject(code: string) {
    const { count } = await this.prisma.devicePairing.updateMany({ where: this.waiting(code), data: { status: 'REJECTED' } });
    if (!count) throw notFound();
  }

  private waiting(code: string): Prisma.DevicePairingWhereInput {
    return { code: cleanCode(code), status: 'PENDING', expiresAt: { gt: new Date() } };
  }
}
