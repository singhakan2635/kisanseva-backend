import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types';
import logger from '../utils/logger';

/**
 * Rate limit: 10 diagnoses per day per authenticated user.
 *
 * Uses an in-memory Map keyed by userId. Counts reset at midnight IST (UTC+05:30).
 * For horizontal scaling, replace with a MongoDB or Redis counter.
 */

const MAX_SCANS_PER_DAY = 10;

interface ScanRecord {
  count: number;
  /** ISO date string (YYYY-MM-DD) in IST */
  date: string;
}

const scanCounts = new Map<string, ScanRecord>();

/** Get current date string in IST (Asia/Kolkata) as YYYY-MM-DD */
function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function scanRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.user?.id;

  // If no authenticated user, skip rate limiting (auth middleware handles access)
  if (!userId) {
    next();
    return;
  }

  const todayIST = getTodayIST();
  const record = scanCounts.get(userId);

  if (!record || record.date !== todayIST) {
    // New day or first scan — reset counter
    scanCounts.set(userId, { count: 1, date: todayIST });
    next();
    return;
  }

  if (record.count >= MAX_SCANS_PER_DAY) {
    logger.warn('Scan rate limit exceeded', {
      userId,
      count: record.count,
      limit: MAX_SCANS_PER_DAY,
    });
    res.status(429).json({
      success: false,
      message: `Daily scan limit reached (${MAX_SCANS_PER_DAY}/day). Try again tomorrow.`,
    });
    return;
  }

  record.count += 1;
  next();
}
