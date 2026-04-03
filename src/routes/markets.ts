import { Router } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate';
import * as marketController from '../controllers/marketController';

const router = Router();

router.get(
  '/prices',
  [
    query('commodity').optional().trim().isString().withMessage('commodity must be a string'),
    query('state').optional().trim().isString().withMessage('state must be a string'),
    query('market').optional().trim().isString().withMessage('market must be a string'),
  ],
  validate,
  marketController.getMandiPrices
);

router.get(
  '/production',
  [
    query('state').optional().trim().isString().withMessage('state must be a string'),
    query('crop').optional().trim().isString().withMessage('crop must be a string'),
    query('year')
      .optional()
      .trim()
      .matches(/^\d{4}(-\d{2})?$/)
      .withMessage('year must be in format YYYY or YYYY-YY'),
  ],
  validate,
  marketController.getCropProduction
);

router.get(
  '/search',
  [
    query('q')
      .trim()
      .notEmpty()
      .withMessage('Search query (q) is required')
      .isLength({ min: 2 })
      .withMessage('Search query must be at least 2 characters'),
  ],
  validate,
  marketController.searchMarkets
);

export default router;
