import { env } from '../config/env';
import { WhatsAppToken } from '../models/WhatsAppToken';
import logger from '../utils/logger';

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Get the current valid access token.
 * Priority: DB-stored token (auto-refreshed) > env var fallback.
 */
export async function getAccessToken(): Promise<string> {
  const stored = await WhatsAppToken.findOne().sort({ updatedAt: -1 });

  if (stored) {
    // If long-lived token is expiring within 1 hour, auto-refresh
    if (stored.expiresAt && stored.tokenType === 'long_lived') {
      const oneHour = 60 * 60 * 1000;
      if (stored.expiresAt.getTime() - Date.now() < oneHour) {
        logger.info('WhatsApp long-lived token expiring soon, auto-refreshing...');
        const refreshed = await refreshLongLivedToken(stored.accessToken);
        if (refreshed) return refreshed;
        logger.warn('WhatsApp token auto-refresh failed, using existing token');
      }
    }
    return stored.accessToken;
  }

  // Fallback to env var
  return env.WHATSAPP_ACCESS_TOKEN;
}

/**
 * Store a new short-lived token and exchange it for a long-lived one.
 * Short-lived tokens (~1-24hr) → long-lived (~60 days).
 */
export async function storeAndExchangeToken(shortLivedToken: string): Promise<{
  token: string;
  type: string;
  expiresAt?: Date;
}> {
  if (!env.WHATSAPP_APP_ID || !env.WHATSAPP_APP_SECRET) {
    throw new Error('WHATSAPP_APP_ID and WHATSAPP_APP_SECRET are required for token exchange');
  }

  const exchangeUrl = `${GRAPH_API_URL}/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${env.WHATSAPP_APP_ID}` +
    `&client_secret=${env.WHATSAPP_APP_SECRET}` +
    `&fb_exchange_token=${shortLivedToken}`;

  let tokenToStore = shortLivedToken;
  let tokenType: 'short_lived' | 'long_lived' | 'system_user' = 'short_lived';
  let expiresAt: Date | undefined;

  try {
    const res = await fetch(exchangeUrl);
    const data = await res.json() as Record<string, unknown>;

    if (data.access_token) {
      tokenToStore = data.access_token as string;
      tokenType = 'long_lived';
      if (data.expires_in) {
        expiresAt = new Date(Date.now() + (data.expires_in as number) * 1000);
      }
      logger.info('WhatsApp token exchanged for long-lived', {
        expiresAt: expiresAt?.toISOString(),
        expiresInDays: data.expires_in ? Math.round((data.expires_in as number) / 86400) : undefined,
      });
    } else {
      const errorMsg = (data.error as Record<string, unknown>)?.message as string || 'Unknown error';
      logger.warn('WhatsApp token exchange failed, storing as short-lived', { error: errorMsg });
    }
  } catch (err) {
    logger.error('WhatsApp token exchange request failed', { error: (err as Error).message });
  }

  // Upsert: replace any existing token
  await WhatsAppToken.findOneAndUpdate(
    {},
    {
      accessToken: tokenToStore,
      tokenType,
      expiresAt,
      appId: env.WHATSAPP_APP_ID,
    },
    { upsert: true, new: true }
  );

  return { token: tokenToStore, type: tokenType, expiresAt };
}

/**
 * Store a permanent system user token (never expires).
 */
export async function storeSystemUserToken(token: string): Promise<void> {
  await WhatsAppToken.findOneAndUpdate(
    {},
    {
      accessToken: token,
      tokenType: 'system_user',
      expiresAt: undefined,
      appId: env.WHATSAPP_APP_ID,
    },
    { upsert: true, new: true }
  );
  logger.info('WhatsApp permanent system user token stored');
}

/**
 * Get current token status (type, expiry, health).
 */
export async function getTokenStatus(): Promise<{
  hasToken: boolean;
  source: 'database' | 'env_var' | 'none';
  tokenType?: string;
  expiresAt?: Date;
  expiresInHours?: number;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
}> {
  const stored = await WhatsAppToken.findOne().sort({ updatedAt: -1 });

  if (stored) {
    const now = Date.now();
    const isExpired = stored.expiresAt ? stored.expiresAt.getTime() < now : false;
    const expiresInMs = stored.expiresAt ? stored.expiresAt.getTime() - now : undefined;
    const expiresInHours = expiresInMs ? Math.round(expiresInMs / (60 * 60 * 1000)) : undefined;
    const isExpiringSoon = expiresInHours !== undefined ? expiresInHours < 24 : false;

    return {
      hasToken: true,
      source: 'database',
      tokenType: stored.tokenType,
      expiresAt: stored.expiresAt,
      expiresInHours,
      isExpired,
      isExpiringSoon,
    };
  }

  if (env.WHATSAPP_ACCESS_TOKEN) {
    return {
      hasToken: true,
      source: 'env_var',
      tokenType: 'unknown',
    };
  }

  return { hasToken: false, source: 'none' };
}

/**
 * Force refresh the current long-lived token.
 * Returns new token info or throws if refresh fails.
 */
export async function forceRefreshToken(): Promise<{
  token: string;
  type: string;
  expiresAt?: Date;
}> {
  const stored = await WhatsAppToken.findOne().sort({ updatedAt: -1 });
  const currentToken = stored?.accessToken || env.WHATSAPP_ACCESS_TOKEN;

  if (!currentToken) {
    throw new Error('No token available to refresh');
  }

  // Try exchange (works for both short-lived and long-lived tokens)
  return storeAndExchangeToken(currentToken);
}

/**
 * Refresh a long-lived token (extends by another ~60 days).
 */
async function refreshLongLivedToken(currentToken: string): Promise<string | null> {
  if (!env.WHATSAPP_APP_ID || !env.WHATSAPP_APP_SECRET) {
    logger.warn('Cannot refresh token: WHATSAPP_APP_ID or WHATSAPP_APP_SECRET not set');
    return null;
  }

  try {
    const url = `${GRAPH_API_URL}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${env.WHATSAPP_APP_ID}` +
      `&client_secret=${env.WHATSAPP_APP_SECRET}` +
      `&fb_exchange_token=${currentToken}`;

    const res = await fetch(url);
    const data = await res.json() as Record<string, unknown>;

    if (data.access_token) {
      const expiresAt = data.expires_in
        ? new Date(Date.now() + (data.expires_in as number) * 1000)
        : undefined;

      await WhatsAppToken.findOneAndUpdate(
        {},
        {
          accessToken: data.access_token as string,
          tokenType: 'long_lived',
          expiresAt,
          appId: env.WHATSAPP_APP_ID,
        },
        { upsert: true }
      );

      logger.info('WhatsApp long-lived token refreshed', {
        expiresAt: expiresAt?.toISOString(),
        expiresInDays: data.expires_in ? Math.round((data.expires_in as number) / 86400) : undefined,
      });

      return data.access_token as string;
    }

    const errorMsg = (data.error as Record<string, unknown>)?.message as string || 'Unknown error';
    logger.warn('WhatsApp token refresh failed', { error: errorMsg });
    return null;
  } catch (err) {
    logger.error('WhatsApp token refresh error', { error: (err as Error).message });
    return null;
  }
}
