import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

type Mail = { to: string | string[]; subject: string; lines: string[]; action?: { label: string; url: string } };

// Sends the transactional emails over SMTP. In development the SMTP server is
// Mailpit (docker-compose): every email is caught and readable on :8025.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;
  readonly appUrl: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.transport = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: Number(config.get<string>('SMTP_PORT', '1025')),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
    });
    this.from = config.get<string>('MAIL_FROM', 'MAIA <noreply@maia.local>');
    this.appUrl = config.get<string>('APP_URL', 'http://localhost:3001').replace(/\/$/, '');
  }

  async send({ to, subject, lines, action }: Mail) {
    const text = [...lines, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n');
    const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:520px">
${lines.map((l) => `<p>${escape(l)}</p>`).join('\n')}
${
  action
    ? `<p><a href="${action.url}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${escape(action.label)}</a></p>
<p style="color:#666;font-size:13px">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>${action.url}</p>`
    : ''
}
</div>`;
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text, html });
    } catch (err) {
      // Never break the request because the mail server is down: log it.
      this.logger.error(`Email "${subject}" not sent: ${(err as Error).message}`);
    }
  }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
