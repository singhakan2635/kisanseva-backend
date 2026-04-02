import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';

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

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging & tracing
app.use(requestLogger);

// Rate limiting
const rateLimitingEnabled = process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true';
if (rateLimitingEnabled) {
  const ipKey = (req: express.Request) => (req.ip || '').replace(/^::ffff:/, '');

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

// JWT auth - applied globally, exempts login/register internally
app.use(authMiddleware);

// Routes
app.use('/api/auth', authRoutes);

// Error handler
app.use(errorHandler);

export default app;
