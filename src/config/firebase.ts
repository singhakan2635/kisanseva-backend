import * as firebaseAdmin from 'firebase-admin';
import { env } from './env';
import logger from '../utils/logger';

let admin: firebaseAdmin.app.App | null = null;

try {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    admin = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
    logger.info('Firebase Admin initialized with service account');
  } else {
    admin = firebaseAdmin.initializeApp();
    logger.warn('Firebase Admin initialized without service account (using default credentials)');
  }
} catch (error) {
  logger.warn('Firebase Admin initialization failed — Firebase auth will be unavailable', {
    error: (error as Error).message,
  });
  admin = null;
}

export function getFirebaseAdmin(): firebaseAdmin.app.App {
  if (!admin) {
    throw new Error('Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT env var.');
  }
  return admin;
}

export { admin };
