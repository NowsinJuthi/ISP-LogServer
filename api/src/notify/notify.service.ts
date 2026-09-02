import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { assertSafeSmsUrl, assertSafeSmtpTarget, redactSecretMessage, smsAllowlist } from '../security/net-guard';

type SendResult = { ok: true } | { ok: false; error: string };

type Company = {
  id: number;
  companyName: string;
  contactEmail?: string | null;
  mobileNumber?: string | null;
  emailSendingEnable: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure: boolean;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smsSendingEnable: boolean;
  smsProviderUserId?: string | null;
  smsProviderSender?: string | null;
  smsProviderPassword?: string | null;
  smsProviderId?: string | null;
  smsSentToday?: number;
  lastSmsSend?: Date | null;
};

@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async alertMikroTikDown(server: { id: number; serverName: string; url: string; port?: string | null }) {
    const company = await this.prisma.companySetting.findFirst();
    if (!company) return;

    const when = new Date().toLocaleString();
    const subject = `MikroTik down: ${server.serverName}`;
    const text =
      `${company.companyName}\n\n` +
      `MikroTik connection is down.\n` +
      `Router: ${server.serverName}\n` +
      `IP: ${server.url}\n` +
      `API port: ${server.port || '—'}\n` +
      `Time: ${when}\n\n` +
      `Check the router, API user and network path to uniqbd.com Log Server.`;

    const sent: string[] = [];
    if (company.emailSendingEnable) {
      const email = await this.sendEmail(company, subject, text);
      if (email.ok) sent.push('email');
    }
    if (company.smsSendingEnable) {
      const sms =
        `MikroTik DOWN: ${server.serverName} (${server.url}) at ${when}. Check API/network.`;
      const result = await this.sendSms(company, sms);
      if (result.ok) sent.push('SMS');
    }

    if (sent.length) {
      void this.audit.write({
        type: 'ALERT',
        tableName: 'Server',
        message: `Down alert for ${server.serverName} via ${sent.join(' + ')}`,
      });
    } else {
      this.log.warn(
        `MikroTik ${server.serverName} is down, but email/SMS is off or failed. Enable them in Server Settings.`,
      );
    }
  }

  async testEmail(actor?: AuthUser) {
    const company = await this.requireCompany();
    const to = company.contactEmail?.trim();
    if (!to) {
      throw new BadRequestException('Save a contact email first. The test is sent to that inbox.');
    }
    if (!company.smtpHost?.trim()) {
      throw new BadRequestException('Save an SMTP host first.');
    }
    const when = new Date().toLocaleString();
    const result = await this.sendEmail(
      company,
      'SMTP test',
      `${company.companyName}\n\n` +
        `This is a test from uniqbd.com Log Server.\n` +
        `If you received this, the email server is working.\n` +
        `Time: ${when}\n`,
    );
    if (!result.ok) {
      throw new BadRequestException(result.error);
    }
    void this.audit.write({
      actor,
      type: 'ALERT',
      tableName: 'Company',
      message: `SMTP test email sent to ${to}`,
    });
    return { ok: true, message: `Test email sent to ${to}` };
  }

  async testSms(actor?: AuthUser) {
    const company = await this.requireCompany();
    const mobile = company.mobileNumber?.replace(/\s+/g, '');
    if (!mobile) {
      throw new BadRequestException('Save a mobile number in Company profile first.');
    }
    if (!company.smsProviderUserId?.trim() && !company.smsProviderId?.trim()) {
      throw new BadRequestException('Save SMS provider user ID or API URL first.');
    }
    const when = new Date().toLocaleString();
    const result = await this.sendSms(
      company,
      `Log Server SMS test at ${when}. If you got this, SMS is working.`,
    );
    if (!result.ok) {
      throw new BadRequestException(result.error);
    }
    const saved = await this.prisma.companySetting.findFirst({
      select: { smsSentToday: true, lastSmsSend: true },
    });
    void this.audit.write({
      actor,
      type: 'ALERT',
      tableName: 'Company',
      message: `SMS test sent to ${mobile}`,
    });
    return {
      ok: true,
      message: `Test SMS sent to ${mobile}`,
      smsSentToday: saved?.smsSentToday ?? 0,
      lastSmsSend: saved?.lastSmsSend?.toISOString() ?? null,
    };
  }

  private async requireCompany() {
    const company = await this.prisma.companySetting.findFirst();
    if (!company) {
      throw new BadRequestException('Save Server Settings first.');
    }
    return company;
  }

  private async sendEmail(company: Company, subject: string, text: string): Promise<SendResult> {
    const to = company.contactEmail?.trim();
    if (!to || !company.smtpHost) {
      this.log.warn('Email alert skipped: contact email or SMTP host missing');
      return { ok: false, error: 'Contact email or SMTP host is missing.' };
    }
    try {
      const target = await assertSafeSmtpTarget(company.smtpHost, company.smtpPort || 587);
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: target.host,
        port: target.port,
        secure: target.port === 465 || (company.smtpSecure && target.port === 465),
        requireTLS: company.smtpSecure && target.port !== 465,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
        auth:
          company.smtpUser && company.smtpPassword
            ? { user: company.smtpUser, pass: company.smtpPassword }
            : undefined,
      });
      const fromName = company.smtpFromName || company.companyName || 'uniqbd.com Log Server';
      const fromEmail = company.smtpFromEmail || company.smtpUser || to;
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: `[${company.companyName}] ${subject}`,
        text,
      });
      this.log.log('Email sent');
      return { ok: true };
    } catch (e) {
      const error = redactSecretMessage((e as Error).message) || 'Email send failed.';
      this.log.error(`Email send failed: ${error}`);
      return { ok: false, error };
    }
  }

  private async sendSms(company: Company, message: string): Promise<SendResult> {
    const mobile = company.mobileNumber?.replace(/\s+/g, '');
    if (!mobile) {
      this.log.warn('SMS alert skipped: mobile number missing');
      return { ok: false, error: 'Mobile number is missing.' };
    }
    const dailyMax = Number(process.env.SMS_DAILY_LIMIT || 30);
    const last = company.lastSmsSend ? new Date(company.lastSmsSend) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = last && last >= today ? company.smsSentToday || 0 : 0;
    if (sentToday >= dailyMax) {
      this.log.warn('SMS alert skipped: daily limit reached');
      return { ok: false, error: `SMS daily limit reached (${dailyMax}).` };
    }
    try {
      const custom = company.smsProviderId?.trim() || '';
      const url = custom.startsWith('http')
        ? assertSafeSmsUrl(custom, smsAllowlist())
        : new URL('https://api.smsq.global/api/SendSMS');
      const params = new URLSearchParams({
        api_id: company.smsProviderUserId || '',
        sms_type: 'P',
        encoding: 'T',
        sender_id: company.smsProviderSender || '',
        phonenumber: mobile,
        textmessage: message.slice(0, 480),
      });
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${company.smsProviderUserId || ''}:${company.smsProviderPassword || ''}`).toString('base64')}`,
          },
          body: params,
          signal: controller.signal,
          redirect: 'manual',
        });
        if (!res.ok) {
          const hint = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80);
          const error = redactSecretMessage(
            hint ? `SMS provider HTTP ${res.status}: ${hint}` : `SMS provider HTTP ${res.status}`,
          );
          this.log.error(error);
          return { ok: false, error };
        }
      } finally {
        clearTimeout(t);
      }
      await this.prisma.companySetting.update({
        where: { id: company.id },
        data: { smsSentToday: sentToday + 1, lastSmsSend: new Date() },
      });
      this.log.log('SMS sent');
      return { ok: true };
    } catch (e) {
      const error = redactSecretMessage((e as Error).message) || 'SMS send failed.';
      this.log.error(`SMS send failed: ${error}`);
      return { ok: false, error };
    }
  }
}
