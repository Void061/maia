import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

type Mail = { to: string | string[]; subject: string; lines: string[]; action?: { label: string; url: string } };

// Resend's SMTP endpoint: fixed for every account, only the API key changes.
const RESEND_SMTP = { host: 'smtp.resend.com', port: 465, secure: true, user: 'resend' };
// Mailpit (docker-compose) catches every email in development: web UI on :8025.
const MAILPIT_PORT = 1025;

// Sends the transactional emails. With RESEND_API_KEY set they go out through
// Resend; without it they land in Mailpit, so development never emails anyone.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;
  readonly appUrl: string;

  constructor(config: ConfigService) {
    const resendKey = config.get<string>('RESEND_API_KEY');
    this.transport = resendKey
      ? nodemailer.createTransport({
          host: RESEND_SMTP.host,
          port: RESEND_SMTP.port,
          secure: RESEND_SMTP.secure,
          auth: { user: RESEND_SMTP.user, pass: resendKey },
        })
      : nodemailer.createTransport({
          // Inside docker-compose Mailpit is reachable as "mailpit".
          host: config.get<string>('MAILPIT_HOST', 'localhost'),
          port: MAILPIT_PORT,
          secure: false,
        });
    this.logger.log(resendKey ? 'Email via Resend' : 'Email via Mailpit (development)');
    this.from = config.get<string>('MAIL_FROM') || 'MAIA <noreply@maia.local>';
    this.appUrl = config.get<string>('APP_URL', 'http://localhost:3001').replace(/\/$/, '');
  }

  // False when the mail did not leave: most callers carry on, a code by email cannot.
  async send({ to, subject, lines, action }: Mail): Promise<boolean> {
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
      return true;
    } catch (err) {
      // Never break the request because the mail server is down: log it.
      this.logger.error(`Email "${subject}" not sent: ${(err as Error).message}`);
      return false;
    }
  }
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
