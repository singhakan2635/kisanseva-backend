import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '3002', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'default-refresh-secret',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
};

// Warn if refresh token secret is missing or same as JWT secret
if (!env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET === env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('WARNING: REFRESH_TOKEN_SECRET should be set and different from JWT_SECRET. Falling back to JWT_SECRET.');
}
