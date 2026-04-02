import mongoose from 'mongoose';
import { env } from './env';
import logger from '../utils/logger';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error', { error: (error as Error).message });
    process.exit(1);
  }
}
