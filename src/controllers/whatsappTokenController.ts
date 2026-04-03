import { Request, Response } from 'express';
import { env } from '../config/env';
import {
  getTokenStatus,
  storeAndExchangeToken,
  storeSystemUserToken,
  forceRefreshToken,
} from '../services/whatsappTokenService';
import logger from '../utils/logger';

/**
 * GET /api/whatsapp-token/status
 * Check current token health (type, expiry, etc.)
 */
export async function tokenStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = await getTokenStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Failed to get token status', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Failed to check token status' });
  }
}

/**
 * POST /api/whatsapp-token/exchange
 * Exchange a short-lived token for a long-lived one (~60 days).
 * Body: { token: "short-lived-token" }
 */
export async function exchangeToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body as { token: string };

    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required in request body' });
      return;
    }

    const result = await storeAndExchangeToken(token);
    logger.info('WhatsApp token exchanged via API', { type: result.type });

    res.json({
      success: true,
      data: {
        type: result.type,
        expiresAt: result.expiresAt,
        expiresInDays: result.expiresAt
          ? Math.round((result.expiresAt.getTime() - Date.now()) / (86400 * 1000))
          : undefined,
      },
      message: result.type === 'long_lived'
        ? `Token exchanged successfully. Expires in ~${Math.round((result.expiresAt!.getTime() - Date.now()) / (86400 * 1000))} days.`
        : 'Token stored as short-lived (exchange failed).',
    });
  } catch (error) {
    logger.error('Token exchange failed', { error: (error as Error).message });
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

/**
 * POST /api/whatsapp-token/refresh
 * Force refresh the current token (extends by another ~60 days).
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const result = await forceRefreshToken();
    logger.info('WhatsApp token force-refreshed via API', { type: result.type });

    res.json({
      success: true,
      data: {
        type: result.type,
        expiresAt: result.expiresAt,
        expiresInDays: result.expiresAt
          ? Math.round((result.expiresAt.getTime() - Date.now()) / (86400 * 1000))
          : undefined,
      },
      message: 'Token refreshed successfully.',
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: (error as Error).message });
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

/**
 * POST /api/whatsapp-token/system-user
 * Store a permanent system user token (never expires).
 * Body: { token: "permanent-token" }
 */
export async function setSystemUserToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body as { token: string };

    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required in request body' });
      return;
    }

    await storeSystemUserToken(token);
    logger.info('WhatsApp system user token stored via API');

    res.json({
      success: true,
      message: 'Permanent system user token stored. This token never expires.',
    });
  } catch (error) {
    logger.error('Failed to store system user token', { error: (error as Error).message });
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

/**
 * GET /api/whatsapp-token/query
 * Public endpoint to check token expiry. Secured by app_secret query param.
 * Usage: /api/whatsapp-token/query?secret=YOUR_APP_SECRET
 */
export async function queryTokenExpiry(req: Request, res: Response): Promise<void> {
  const secret = req.query.secret as string;

  if (!secret || secret !== env.WHATSAPP_APP_SECRET) {
    res.status(403).json({ success: false, message: 'Invalid secret' });
    return;
  }

  try {
    const status = await getTokenStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Failed to query token expiry', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Failed to check token status' });
  }
}

/**
 * GET /api/whatsapp-token/exchange-now
 * Public endpoint to exchange current token for long-lived. Secured by app_secret.
 * Usage: /api/whatsapp-token/exchange-now?secret=YOUR_APP_SECRET
 * Optionally pass &token=NEW_SHORT_LIVED_TOKEN to exchange a specific token.
 */
export async function exchangeTokenNow(req: Request, res: Response): Promise<void> {
  const secret = req.query.secret as string;

  if (!secret || secret !== env.WHATSAPP_APP_SECRET) {
    res.status(403).json({ success: false, message: 'Invalid secret' });
    return;
  }

  try {
    const tokenParam = req.query.token as string | undefined;
    let result;

    if (tokenParam) {
      result = await storeAndExchangeToken(tokenParam);
    } else {
      result = await forceRefreshToken();
    }

    logger.info('WhatsApp token exchanged via public endpoint', { type: result.type });

    res.json({
      success: true,
      data: {
        type: result.type,
        expiresAt: result.expiresAt,
        expiresInDays: result.expiresAt
          ? Math.round((result.expiresAt.getTime() - Date.now()) / (86400 * 1000))
          : undefined,
      },
    });
  } catch (error) {
    logger.error('Token exchange via public endpoint failed', { error: (error as Error).message });
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}
