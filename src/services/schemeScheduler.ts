import cron from 'node-cron';
import { GovernmentScheme } from '../models/GovernmentScheme';
import * as schemeService from './schemeService';
import logger from '../utils/logger';

/**
 * Weekly scheme update scheduler.
 *
 * Runs every Sunday at 2:00 AM IST (= Saturday 20:30 UTC).
 * - Deactivates schemes past their endDate
 * - Updates lastVerified for all active schemes
 * - Logs a summary
 */

const CRON_SCHEDULE = '30 20 * * 6'; // Saturday 20:30 UTC = Sunday 2:00 AM IST

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Execute the weekly scheme review.
 * Exported separately so it can be called manually or in tests.
 */
export async function runSchemeReview(): Promise<{
  totalActive: number;
  newlyExpired: number;
  needsReview: number;
}> {
  logger.info('Scheme scheduler: starting weekly review');

  try {
    // 1. Deactivate expired schemes
    const newlyExpired = await schemeService.deactivateExpiredSchemes();

    // 2. Update lastVerified for all active schemes
    const verifyResult = await GovernmentScheme.updateMany(
      { active: true },
      { $set: { lastVerified: new Date() } }
    );

    // 3. Count active schemes and those needing review (no lastVerified or older than 30 days)
    const totalActive = await GovernmentScheme.countDocuments({ active: true });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const needsReview = await GovernmentScheme.countDocuments({
      active: true,
      $or: [
        { lastVerified: { $exists: false } },
        { lastVerified: null },
        { lastVerified: { $lt: thirtyDaysAgo } },
      ],
    });

    const summary = {
      totalActive,
      newlyExpired,
      needsReview,
      lastVerifiedUpdated: verifyResult.modifiedCount,
    };

    logger.info('Scheme scheduler: weekly review complete', summary);

    return { totalActive, newlyExpired, needsReview };
  } catch (error) {
    logger.error('Scheme scheduler: weekly review failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Start the weekly cron scheduler.
 * Call this once from server.ts after the DB is connected.
 */
export function startSchemeScheduler(): void {
  if (scheduledTask) {
    logger.warn('Scheme scheduler: already running, skipping duplicate start');
    return;
  }

  scheduledTask = cron.schedule(CRON_SCHEDULE, () => {
    runSchemeReview().catch((err) => {
      logger.error('Scheme scheduler: unhandled error in cron job', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('Scheme scheduler: initialized (runs every Sunday at 2:00 AM IST)');
}

/**
 * Stop the scheduler (for graceful shutdown or testing).
 */
export function stopSchemeScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheme scheduler: stopped');
  }
}
