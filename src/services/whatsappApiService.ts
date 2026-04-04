import { env } from '../config/env';
import { getAccessToken } from './whatsappTokenService';
import logger from '../utils/logger';
import type {
  WhatsAppButton,
  WhatsAppListSection,
  WhatsAppTemplateComponent,
} from '../types/whatsapp';

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

async function sendRequest(body: Record<string, unknown>): Promise<void> {
  const url = `${GRAPH_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const token = await getAccessToken();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error('WhatsApp API error', { status: res.status, body: errorBody });
    throw new Error(`WhatsApp API error: ${res.status} - ${errorBody}`);
  }
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      ...(caption && { caption }),
    },
  });
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string = 'hi',
  components?: WhatsAppTemplateComponent[]
): Promise<void> {
  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components && { components }),
    },
  });
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: WhatsAppButton[]
): Promise<void> {
  // WhatsApp allows max 3 buttons, each title max 20 chars
  const sanitizedButtons = buttons.slice(0, 3).map(btn => ({
    type: btn.type,
    reply: {
      id: btn.reply.id.slice(0, 256),
      title: btn.reply.title.slice(0, 20),
    },
  }));

  for (const btn of buttons) {
    if (btn.reply.title.length > 20) {
      logger.warn('Button title truncated', { id: btn.reply.id, original: btn.reply.title, length: btn.reply.title.length });
    }
  }

  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: sanitizedButtons },
    },
  });
}

export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonTitle: string,
  sections: WhatsAppListSection[]
): Promise<void> {
  // Enforce WhatsApp interactive list limits to prevent error 131009
  const sanitizedButton = buttonTitle.slice(0, 20);
  const sanitizedSections = sections.slice(0, 10).map(section => ({
    title: section.title.slice(0, 24),
    rows: section.rows.slice(0, 10).map(row => ({
      id: row.id.slice(0, 200),
      title: row.title.slice(0, 24),
      ...(row.description ? { description: row.description.slice(0, 72) } : {}),
    })),
  }));

  // Log if any truncation happened
  if (buttonTitle.length > 20) {
    logger.warn('Interactive list button title truncated', { original: buttonTitle, length: buttonTitle.length });
  }
  for (const [i, section] of sections.entries()) {
    if (section.title.length > 24) {
      logger.warn('Interactive list section title truncated', { section: i, original: section.title, length: section.title.length });
    }
    for (const row of section.rows) {
      if (row.title.length > 24) {
        logger.warn('Interactive list row title truncated', { rowId: row.id, original: row.title, length: row.title.length });
      }
      if (row.description && row.description.length > 72) {
        logger.warn('Interactive list row description truncated', { rowId: row.id, length: row.description.length });
      }
    }
  }

  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: sanitizedButton,
        sections: sanitizedSections,
      },
    },
  });
}

export async function markAsRead(messageId: string): Promise<void> {
  const url = `${GRAPH_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const token = await getAccessToken();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });

  if (!res.ok) {
    logger.warn('Failed to mark message as read', { messageId, status: res.status });
  }
}
