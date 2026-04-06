import {
  PrismaClient,
  Channel,
  ContentFormat,
} from '../../src/prisma/generated/client.js';
import { ensureTemplate, ensureVersion } from './helpers.js';

export async function seedAccountCreatedTemplates(
  prisma: PrismaClient,
  tenantId: string,
) {
  /**
   * EMAIL TEMPLATE
   */
  const emailTemplate = await ensureTemplate(
    prisma,
    tenantId,
    'account.created',
    Channel.EMAIL,
    ['account', 'security', 'onboarding'],
  );

  // =========================
  // 🇩🇪 DE
  // =========================
  await ensureVersion(
    prisma,
    emailTemplate.id,
    'de-DE',
    1,
    'Dein Account wurde erstellt',
    `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<title>Account erstellt</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:40px;">
<tr>
<td>

<h2 style="margin-top:0;color:#111;">Dein Account ist bereit</h2>

<p>Hallo {{username}},</p>

<p>dein Account wurde erfolgreich erstellt.</p>

<p>
Um dein Konto zu aktivieren und ein sicheres Passwort zu setzen, klicke bitte auf den folgenden Button:
</p>

<p style="text-align:center;margin:32px 0;">
<a href="{{actionUrl}}"
style="background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block;">
Passwort festlegen
</a>
</p>

<p>
Dieser Link ist <strong>{{expiresInMinutes}} Minuten</strong> gültig und kann nur einmal verwendet werden.
</p>

<hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />

<p style="font-size:13px;color:#666;">
Falls du diesen Account nicht angefordert hast, kontaktiere bitte sofort den Support.
</p>

<p style="font-size:13px;color:#666;">
Support: <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>
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
      username: 'string',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      supportEmail: 'string',
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
    'Your account has been created',
    `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Account created</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:40px;">
<tr>
<td>

<h2 style="margin-top:0;color:#111;">Your account is ready</h2>

<p>Hello {{username}},</p>

<p>Your account has been successfully created.</p>

<p>
To activate your account and set a secure password, click the button below:
</p>

<p style="text-align:center;margin:32px 0;">
<a href="{{actionUrl}}"
style="background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;display:inline-block;">
Set your password
</a>
</p>

<p>
This link expires in <strong>{{expiresInMinutes}} minutes</strong> and can only be used once.
</p>

<hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />

<p style="font-size:13px;color:#666;">
If you did not request this account, please contact support immediately.
</p>

<p style="font-size:13px;color:#666;">
Support: <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>
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
      username: 'string',
      actionUrl: 'string',
      expiresInMinutes: 'number',
      supportEmail: 'string',
    },
  );

  /**
   * WHATSAPP TEMPLATE
   */
  const whatsappTemplate = await ensureTemplate(
    prisma,
    tenantId,
    'account.created',
    Channel.WHATSAPP,
    ['account', 'onboarding'],
  );

  // 🇩🇪
  await ensureVersion(
    prisma,
    whatsappTemplate.id,
    'de-DE',
    1,
    null,
    `
Hallo {{username}} 👋

Dein Account wurde erstellt ✅

👉 Bitte setze dein Passwort:
{{actionUrl}}

⏳ Gültig für {{expiresInMinutes}} Minuten.
`,
    ContentFormat.TEXT,
    {
      username: 'string',
      actionUrl: 'string',
      expiresInMinutes: 'number',
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
Hello {{username}} 👋

Your account has been created ✅

👉 Set your password:
{{actionUrl}}

⏳ Valid for {{expiresInMinutes}} minutes.
`,
    ContentFormat.TEXT,
    {
      username: 'string',
      actionUrl: 'string',
      expiresInMinutes: 'number',
    },
  );

  /**
   * OPTIONAL: IN_APP (clean & minimal)
   */
  const inAppTemplate = await ensureTemplate(
    prisma,
    tenantId,
    'account.created',
    Channel.IN_APP,
    ['account'],
  );

  await ensureVersion(
    prisma,
    inAppTemplate.id,
    'de-DE',
    1,
    null,
    `
Dein Account wurde erstellt.
Bitte setze dein Passwort über den bereitgestellten Link.
`,
    ContentFormat.TEXT,
    {},
  );

  await ensureVersion(
    prisma,
    inAppTemplate.id,
    'en-US',
    1,
    null,
    `
Your account has been created.
Please set your password using the provided link.
`,
    ContentFormat.TEXT,
    {},
  );

  console.log(
    '✅ Account created templates seeded (EMAIL + WHATSAPP + IN_APP)',
  );
}
