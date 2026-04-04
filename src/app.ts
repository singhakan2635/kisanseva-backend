import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import marketRoutes from './routes/markets';
import diagnosisRoutes from './routes/diagnosis';
import languageRoutes from './routes/language';
import whatsappRoutes from './routes/whatsapp';
import whatsappTokenRoutes from './routes/whatsappToken';
import schemeRoutes from './routes/schemes';

const app = express();

// Trust proxy (Heroku uses reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = [
  env.FRONTEND_URL,
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, server-to-server, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// Body parsing (capture raw body for WhatsApp signature verification)
app.use(express.json({
  limit: '1mb',
  verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging & tracing
app.use(requestLogger);

// Rate limiting
const rateLimitingEnabled = process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true';
if (rateLimitingEnabled) {
  const ipKey = (req: express.Request) => ipKeyGenerator(req.ip ?? '127.0.0.1');

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: ipKey,
    message: { success: false, message: 'Too many requests, please try again later' },
  });

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: ipKey,
    message: { success: false, message: 'Too many requests, please try again later' },
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', generalLimiter);
}

// Health check (before auth - public endpoint)
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'KisanSeva server is running' });
});

// WhatsApp webhook routes (before auth - Meta calls these directly)
app.use('/api/whatsapp', whatsappRoutes);

// Public token query endpoints (secured by app_secret param, not JWT)
import { queryTokenExpiry, exchangeTokenNow } from './controllers/whatsappTokenController';
app.get('/api/whatsapp-token/query', queryTokenExpiry);
app.get('/api/whatsapp-token/exchange-now', exchangeTokenNow);

// Public scheme routes (GET endpoints are public, POST/PATCH/DELETE check auth internally via requireRole)
app.use('/api/schemes', schemeRoutes);

// JWT auth - applied globally, exempts login/register internally
app.use(authMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/language', languageRoutes);
app.use('/api/whatsapp-token', whatsappTokenRoutes);

// Error handler
app.use(errorHandler);

export default app;
