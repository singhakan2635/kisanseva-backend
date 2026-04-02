import * as firebaseAdmin from 'firebase-admin';
import { env } from './env';
import logger from '../utils/logger';

let admin: firebaseAdmin.app.App;

try {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    admin = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
    logger.info('Firebase Admin initialized');
  } else {
    admin = firebaseAdmin.initializeApp();
    logger.warn('Firebase Admin initialized without service account (using default credentials)');
  }
} catch (error) {
  logger.warn('Firebase Admin initialization skipped', { error: (error as Error).message });
  admin = firebaseAdmin.initializeApp();
}

export { admin };
