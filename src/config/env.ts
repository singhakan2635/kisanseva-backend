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
  DATA_GOV_API_KEY: process.env.DATA_GOV_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // WhatsApp Cloud API
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '',
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || '',
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID || '',
  WHATSAPP_APP_ID: process.env.WHATSAPP_APP_ID || '',

  // Sarvam AI (Indian language support)
  SARVAM_API_KEY: process.env.SARVAM_API_KEY || '',

  // ML Inference Service (Python FastAPI for plant disease CNN)
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:8000',
};

// Warn if refresh token secret is missing or same as JWT secret
if (!env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET === env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('WARNING: REFRESH_TOKEN_SECRET should be set and different from JWT_SECRET. Falling back to JWT_SECRET.');
}
