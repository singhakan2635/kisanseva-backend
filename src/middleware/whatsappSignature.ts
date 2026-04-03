import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import logger from '../utils/logger';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Verify WhatsApp webhook signatures using HMAC SHA-256.
 * In production, WHATSAPP_APP_SECRET must be configured.
 */
export function verifyWhatsAppSignature(req: RawBodyRequest, res: Response, next: NextFunction): void {
  // Skip signature verification if app secret is not configured
  if (!env.WHATSAPP_APP_SECRET) {
    if (env.NODE_ENV === 'production') {
      logger.error('WHATSAPP_APP_SECRET not configured in production - rejecting webhook');
      res.status(500).json({ success: false, message: 'Webhook not configured' });
      return;
    }
    // Dev/test: allow through without verification
    next();
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!signature) {
    logger.warn('WhatsApp webhook missing signature');
    res.status(401).json({ success: false, message: 'Missing signature' });
    return;
  }

  // Use raw body buffer for accurate signature verification
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body));

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', env.WHATSAPP_APP_SECRET)
      .update(body)
      .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    logger.warn('WhatsApp webhook invalid signature');
    res.status(401).json({ success: false, message: 'Invalid signature' });
    return;
  }

  // Replay attack protection: reject webhooks older than 5 minutes
  const parsedBody = req.body as Record<string, unknown>;
  const entry = parsedBody?.entry as Array<Record<string, unknown>> | undefined;
  const changes = entry?.[0]?.changes as Array<Record<string, unknown>> | undefined;
  const value = changes?.[0]?.value as Record<string, unknown> | undefined;
  const messages = value?.messages as Array<Record<string, unknown>> | undefined;
  const timestamp = messages?.[0]?.timestamp as string | undefined;

  if (timestamp) {
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
      logger.warn('Stale WhatsApp webhook rejected', { timestamp });
      res.status(400).json({ success: false, message: 'Stale webhook' });
      return;
    }
  }

  next();
}
