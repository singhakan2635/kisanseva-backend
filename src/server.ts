import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import logger from './utils/logger';

async function start() {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info(`KisanSeva server running on port ${env.PORT}`, { env: env.NODE_ENV });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
