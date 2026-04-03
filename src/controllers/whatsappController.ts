import { Request, Response } from 'express';
import { env } from '../config/env';
import { handleIncomingMessage } from '../services/whatsappBotService';
import type { WhatsAppWebhookPayload } from '../types/whatsapp';
import logger from '../utils/logger';

/** Redact phone number to show only last 4 digits */
function redactPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '****';
  return '****' + phone.slice(-4);
}

/**
 * GET /api/whatsapp/webhook
 * Meta verification endpoint - responds with hub.challenge.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, tokenMatch: token === env.WHATSAPP_VERIFY_TOKEN });
    res.status(403).send('Forbidden');
  }
}

/**
 * POST /api/whatsapp/webhook
 * Incoming messages from WhatsApp Cloud API.
 * MUST return 200 immediately - processing happens async.
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  // Always respond 200 quickly to Meta (they retry on non-200)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const payload = req.body as WhatsAppWebhookPayload;

    if (payload.object !== 'whatsapp_business_account') {
      logger.debug('WhatsApp webhook ignored: non-WA object', { object: payload.object });
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const messages = change.value.messages;
        if (!messages || messages.length === 0) {
          logger.debug('WhatsApp webhook: status update (no messages)');
          continue;
        }

        for (const message of messages) {
          logger.info('WhatsApp message received', {
            from: redactPhone(message.from),
            type: message.type,
            timestamp: message.timestamp,
          });

          await handleIncomingMessage(message);

          logger.info('WhatsApp message processed', {
            from: redactPhone(message.from),
            type: message.type,
          });
        }
      }
    }
  } catch (error) {
    logger.error('WhatsApp webhook processing error', { error: (error as Error).message });
  }
}
