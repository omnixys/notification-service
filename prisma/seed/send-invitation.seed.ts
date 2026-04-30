import {
  Channel,
  ContentFormat,
  PrismaClient,
} from '../../src/prisma/generated/client.js';
import { ensureTemplate, ensureVersion } from './helpers.js';

export async function seedInvitesTemplates(
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
    'invitation.event.invite',
    Channel.EMAIL,
    ['event', 'invitation'],
  );

  // 🇩🇪 DE
  await ensureVersion(
    prisma,
    emailTemplate.id,
    'de-DE',
    2,
    'Einladung: {{eventName}}',
    `
Hallo {{firstName}} {{lastName}},

du bist herzlich eingeladen zu:

📅 {{eventName}}

{{#if plusOnes}}
👥 Du darfst {{plusOnes}} Begleitperson(en) mitbringen
{{/if}}

Bitte bestätige deine Teilnahme hier:
👉 {{rsvpUrl}}

Wir freuen uns auf dich!

— {{hostName}}
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      lastName: 'string',
      eventName: 'string',
      rsvpUrl: 'string',
      plusOnes: 'number | null',
      hostName: 'string',
    },
  );

  // 🇺🇸 EN
  await ensureVersion(
    prisma,
    emailTemplate.id,
    'en-US',
    2,
    'Invitation: {{eventName}}',
    `
Hello {{firstName}} {{lastName}},

you are invited to:

📅 {{eventName}}

{{#if plusOnes}}
👥 You may bring {{plusOnes}} guest(s)
{{/if}}

Please confirm your attendance here:
👉 {{rsvpUrl}}

We are looking forward to seeing you!

— {{hostName}}
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      lastName: 'string',
      eventName: 'string',
      rsvpUrl: 'string',
      plusOnes: 'number | null',
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
    'invitation.event.invite',
    Channel.WHATSAPP,
    ['event', 'invitation'],
  );

  // 🇩🇪 DE
  await ensureVersion(
    prisma,
    whatsappTemplate.id,
    'de-DE',
    2,
    null,
    `
🎉 Einladung

Hallo {{firstName}},

du bist eingeladen zu:
👉 {{eventName}}

{{#if plusOnes}}
Du darfst {{plusOnes}} Begleitperson(en) mitbringen
{{/if}}

Bestätige hier:
{{rsvpUrl}}

Wir freuen uns auf dich!
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      eventName: 'string',
      rsvpUrl: 'string',
      plusOnes: 'number | null',
    },
  );

  // 🇺🇸 EN
  await ensureVersion(
    prisma,
    whatsappTemplate.id,
    'en-US',
    2,
    null,
    `
🎉 Invitation

Hi {{firstName}},

You are invited to:
👉 {{eventName}}

{{#if plusOnes}}
You may bring {{plusOnes}} guest(s)
{{/if}}

Confirm here:
{{rsvpUrl}}

See you there!
`,
    ContentFormat.TEXT,
    {
      firstName: 'string',
      eventName: 'string',
      rsvpUrl: 'string',
      plusOnes: 'number | null',
    },
  );

    console.log('✅ send Invitation templates seeded (de-DE & en-US)');
}
