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
  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons },
    },
  });
}

export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonTitle: string,
  sections: WhatsAppListSection[]
): Promise<void> {
  await sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonTitle,
        sections,
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
