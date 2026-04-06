import {
  PrismaClient,
  Channel,
  ContentFormat,
} from '../../src/prisma/generated/client.js';
import { ensureTemplate, ensureVersion } from './helpers.js';

export async function seedGuestAccountCreatedTemplates(
  prisma: PrismaClient,
  tenantId: string,
) {
  /**
   * ============================================
   * EMAIL TEMPLATE
   * ============================================
   */
  const emailTemplate = await ensureTemplate(
    prisma,
    tenantId,
    'guest.account.created',
    Channel.EMAIL,
    ['guest', 'event', 'onboarding'],
  );

  // =========================
  // 🇩🇪 DE
  // =========================
  await ensureVersion(
    prisma,
    emailTemplate.id,
    'de-DE',
    1,
    'Dein Zugang für {{eventName}}',
    `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<title>Gastzugang erstellt</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:40px;">
<tr>
<td>

<h2 style="margin-top:0;color:#111;">Dein Zugang wurde erstellt</h2>

<p>Hallo {{firstName}} {{lastName}},</p>

<p>du wurdest als Gast für das Event <strong>{{eventName}}</strong> registriert 🎉</p>

{{#if seat}}
<p><strong>🪑 Dein Sitzplatz:</strong> {{seat}}</p>
{{else}}
<p><strong>🪑 Freie Platzwahl</strong></p>
{{/if}}

<p>
Bevor dein Zugang aktiviert und dein Ticket erstellt wird, musst du deine {{verificationChannel}} bestätigen.
</p>

<p style="text-align:center;margin:32px 0;">
<a href="{{actionUrl}}"
style="background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block;">
Zugang bestätigen
</a>
</p>

<p>
Dieser Link ist <strong>{{expiresInMinutes}} Minuten</strong> gültig und kann nur einmal verwendet werden.
</p>

<hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />

<p style="font-size:13px;color:#666;">
Nach erfolgreicher Bestätigung wird dein persönliches Ticket automatisch erstellt.
</p>

<p style="font-size:13px;color:#666;">
Bei Fragen kontaktiere bitte unser Team:
</p>

<p style="font-size:13px;color:#666;">
📧 <a href="mailto:{{supportEmail}}">{{supportEmail}}</a><br/>
{{#if supportPhone}}📞 {{supportPhone}}{{/if}}
</p>

<p style="margin-top:24px;">
Wir freuen uns auf dich!<br/>
{{#if hostName}}— {{hostName}}{{/if}}
</p>

<p style="margin-top:40px;font-size:12px;color:#aaa;">
© 2026 Omnixys Technologies
</p>

</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`,
    ContentFormat.HTML,
    {
      firstName: 'string',
      lastName: 'string',
      eventName: 'string',
      seat: 'string | null',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      verificationChannel: 'string',
      supportEmail: 'string',
      supportPhone: 'string',
      hostName: 'string',
    },
  );

  // =========================
  // 🇺🇸 EN
  // =========================
  await ensureVersion(
    prisma,
    emailTemplate.id,
    'en-US',
    1,
    'Your access to {{eventName}}',
    `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Guest access created</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:40px;">
<tr>
<td>

<h2 style="margin-top:0;color:#111;">Your access has been created</h2>

<p>Hello {{firstName}} {{lastName}},</p>

<p>You have been registered as a guest for <strong>{{eventName}}</strong> 🎉</p>

{{#if seat}}
<p><strong>🪑 Your seat:</strong> {{seat}}</p>
{{else}}
<p><strong>🪑 Free seating</strong></p>
{{/if}}

<p>
Before your access is activated and your ticket is created, you need to verify your {{verificationChannel}}.
</p>

<p style="text-align:center;margin:32px 0;">
<a href="{{actionUrl}}"
style="background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block;">
Confirm access
</a>
</p>

<p>
This link is valid for <strong>{{expiresInMinutes}} minutes</strong> and can only be used once.
</p>

<hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />

<p style="font-size:13px;color:#666;">
After verification, your personal ticket will be created automatically.
</p>

<p style="font-size:13px;color:#666;">
If you have any questions, contact our team:
</p>

<p style="font-size:13px;color:#666;">
📧 <a href="mailto:{{supportEmail}}">{{supportEmail}}</a><br/>
{{#if supportPhone}}📞 {{supportPhone}}{{/if}}
</p>

<p style="margin-top:24px;">
We look forward to seeing you!<br/>
{{#if hostName}}— {{hostName}}{{/if}}
</p>

<p style="margin-top:40px;font-size:12px;color:#aaa;">
© 2026 Omnixys Technologies
</p>

</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`,
    ContentFormat.HTML,
    {
      firstName: 'string',
      lastName: 'string',
      eventName: 'string',
      seat: 'string | null',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      verificationChannel: 'string',
      supportEmail: 'string',
      supportPhone: 'string',
      hostName: 'string',
    },
  );

  /**
   * ============================================
   * WHATSAPP TEMPLATE
   * ============================================
   */
  const whatsappTemplate = await ensureTemplate(
    prisma,
    tenantId,
    'guest.account.created',
    Channel.WHATSAPP,
    ['guest', 'event'],
  );

  // 🇩🇪
  await ensureVersion(
    prisma,
    whatsappTemplate.id,
    'de-DE',
    1,
    null,
    `
Hallo {{firstName}} 👋

Du bist für *{{eventName}}* registriert 🎉

🪑 Sitzplatz: {{#if seat}} {{seat}}{{/if}}

Bitte bestätige deine {{verificationChannel}}, um deinen Zugang zu aktivieren:

👉 {{actionUrl}}

⏳ Gültig für {{expiresInMinutes}} Minuten.

Danach wird dein Ticket automatisch erstellt 🎟️

Fragen?
📧 {{supportEmail}}
{{#if supportPhone}}📞 {{supportPhone}}{{/if}}
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      eventName: 'string',
      seat: 'string | null',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      verificationChannel: 'string',
      supportEmail: 'string',
      supportPhone: 'string',
    },
  );

  // 🇺🇸
  await ensureVersion(
    prisma,
    whatsappTemplate.id,
    'en-US',
    1,
    null,
    `
Hello {{firstName}} 👋

You are registered for *{{eventName}}* 🎉

🪑 Seat: {{#if seat}} {{seat}}{{/if}}

Please verify your {{verificationChannel}} to activate your access:

👉 {{actionUrl}}

⏳ Valid for {{expiresInMinutes}} minutes.

Your ticket will be created automatically afterwards 🎟️

Questions?
📧 {{supportEmail}}
{{#if supportPhone}}📞 {{supportPhone}}{{/if}}
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      eventName: 'string',
      seat: 'string | null',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      verificationChannel: 'string',
      supportEmail: 'string',
      supportPhone: 'string',
    },
  );

  console.log('✅ Guest account created templates seeded (EMAIL + WHATSAPP)');
}
