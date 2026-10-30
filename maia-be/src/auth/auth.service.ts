import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, EmailTokenType, Role, type Account } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessPayload } from './auth.guard.js';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './cookies.js';
import { hashPassword, newSecret, sha256, verifyPassword } from './crypto.js';
import { AuthError, type RegisterDto } from './dto.js';

const HOUR = 60 * 60 * 1000;
const TOKEN_TTL: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 48 * HOUR,
  RESET_PASSWORD: 1 * HOUR,
};

export type Tokens = { access: string; refresh: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // --- Sign-up and email confirmation ---------------------------------------

  async register(dto: RegisterDto) {
    const exists = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException({ code: AuthError.EMAIL_TAKEN, message: 'Esiste già un account con questa email.' });
    }
    const account = await this.prisma.account.create({
      data: { email: dto.email, name: dto.name, passwordHash: await hashPassword(dto.password) },
    });
    await this.sendVerification(account);
  }

  async resendVerification(email: string) {
    const account = await this.prisma.account.findUnique({ where: { email } });
    // Same answer whether or not the account exists: no email enumeration.
    if (account?.status === AccountStatus.PENDING_EMAIL) await this.sendVerification(account);
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, EmailTokenType.VERIFY_EMAIL);
    const account = await this.prisma.account.update({
      where: { id: record.accountId },
      data: {
        emailVerifiedAt: new Date(),
        // Accounts already approved or suspended keep their status.
        ...(record.account.status === AccountStatus.PENDING_EMAIL ? { status: AccountStatus.PENDING_APPROVAL } : {}),
      },
    });
    if (account.status === AccountStatus.PENDING_APPROVAL) await this.notifyAdmins(account);
    return { status: account.status };
  }

  private async sendVerification(account: Account) {
    const token = await this.createToken(account.id, EmailTokenType.VERIFY_EMAIL);
    await this.mail.send({
      to: account.email,
      subject: 'Conferma la tua email per MAIA',
      lines: [
        `Ciao ${account.name},`,
        "per completare la registrazione conferma il tuo indirizzo email. Il link vale 48 ore.",
        "Dopo la conferma un amministratore abiliterà l'account: riceverai un'altra email.",
      ],
      action: { label: 'Conferma email', url: `${this.mail.appUrl}/verify-email?token=${token}` },
    });
  }

  private async notifyAdmins(account: Account) {
    const admins = await this.prisma.account.findMany({
      where: { role: Role.ADMIN, status: AccountStatus.ACTIVE },
      select: { email: true },
    });
    const to = [...new Set([...admins.map((a) => a.email), this.config.get<string>('ADMIN_EMAIL')].filter(Boolean))];
    if (to.length === 0) return;
    await this.mail.send({
      to: to as string[],
      subject: `Nuovo account da approvare: ${account.name}`,
      lines: [`${account.name} (${account.email}) ha confermato l'email e aspetta l'approvazione.`],
      action: { label: 'Apri il pannello admin', url: `${this.mail.appUrl}/admin` },
    });
  }

  // --- Login, sessions -------------------------------------------------------

  async login(email: string, password: string, userAgent?: string): Promise<Tokens> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException({ code: AuthError.INVALID_CREDENTIALS, message: 'Email o password non corrette.' });
    }
    // Only after a correct password do we reveal the account state.
    this.assertActive(account);
    return this.openSession(account.id, userAgent);
  }

  async refresh(refreshToken: string | undefined): Promise<Tokens> {
    const session = refreshToken
      ? await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) }, include: { account: true } })
      : null;
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: AuthError.UNAUTHENTICATED, message: 'Sessione scaduta.' });
    }
    this.assertActive(session.account);
    // Rotate: the old refresh token stops working as soon as the new one exists.
    const refresh = newSecret();
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(refresh), lastUsedAt: new Date() },
    });
    return { access: await this.signAccess(session.accountId, session.id), refresh };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async openSession(accountId: string, userAgent?: string): Promise<Tokens> {
    const refresh = newSecret();
    const session = await this.prisma.session.create({
      data: {
        accountId,
        refreshTokenHash: sha256(refresh),
        userAgent: userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    });
    return { access: await this.signAccess(accountId, session.id), refresh };
  }

  private signAccess(accountId: string, sessionId: string) {
    const payload: AccessPayload = { sub: accountId, sid: sessionId };
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_TTL_SEC });
  }

  private assertActive(account: Account) {
    const refusals: Partial<Record<AccountStatus, [string, string]>> = {
      PENDING_EMAIL: [AuthError.EMAIL_NOT_VERIFIED, "Conferma l'email prima di accedere."],
      PENDING_APPROVAL: [AuthError.PENDING_APPROVAL, "L'account aspetta l'approvazione di un amministratore."],
      SUSPENDED: [AuthError.SUSPENDED, 'Questo account non è abilitato.'],
    };
    const refusal = refusals[account.status];
    if (refusal) throw new ForbiddenException({ code: refusal[0], message: refusal[1] });
  }

  // --- Password reset ----------------------------------------------------------

  async forgotPassword(email: string) {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account) return; // same answer either way
    const token = await this.createToken(account.id, EmailTokenType.RESET_PASSWORD);
    await this.mail.send({
      to: account.email,
      subject: 'Reimposta la password di MAIA',
      lines: [
        `Ciao ${account.name},`,
        'abbiamo ricevuto una richiesta per reimpostare la password. Il link vale 1 ora.',
        'Se la richiesta non è partita da te, ignora questa email: la password resta quella di prima.',
      ],
      action: { label: 'Scegli una nuova password', url: `${this.mail.appUrl}/reset-password?token=${token}` },
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeToken(token, EmailTokenType.RESET_PASSWORD);
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: record.accountId },
        data: { passwordHash: await hashPassword(password) },
      }),
      // A new password logs out every device.
      this.prisma.session.updateMany({
        where: { accountId: record.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // --- One-time email tokens -------------------------------------------------------

  private async createToken(accountId: string, type: EmailTokenType) {
    // A new link invalidates the previous unused ones of the same type.
    await this.prisma.emailToken.updateMany({
      where: { accountId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = newSecret();
    await this.prisma.emailToken.create({
      data: { accountId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL[type]) },
    });
    return token;
  }

  private async consumeToken(token: string, type: EmailTokenType) {
    const record = await this.prisma.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { account: true },
    });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException({ code: AuthError.TOKEN_INVALID, message: 'Il link non è valido o è scaduto.' });
    }
    await this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return record;
  }
}
