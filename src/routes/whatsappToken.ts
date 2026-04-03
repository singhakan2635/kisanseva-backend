import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import {
  tokenStatus,
  exchangeToken,
  refreshToken,
  setSystemUserToken,
} from '../controllers/whatsappTokenController';

const router = Router();

// GET /api/whatsapp-token/status - Check token health
router.get('/status', tokenStatus);

// POST /api/whatsapp-token/exchange - Exchange short-lived → long-lived
router.post(
  '/exchange',
  [body('token').isString().notEmpty().withMessage('Token is required')],
  validate,
  exchangeToken
);

// POST /api/whatsapp-token/refresh - Force refresh current token
router.post('/refresh', refreshToken);

// POST /api/whatsapp-token/system-user - Store permanent token
router.post(
  '/system-user',
  [body('token').isString().notEmpty().withMessage('Token is required')],
  validate,
  setSystemUserToken
);

export default router;
