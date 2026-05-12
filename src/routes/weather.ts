import { Router } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate';
import * as weatherController from '../controllers/weatherController';

const router = Router();

router.get(
  '/current',
  [
    query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90'),
    query('lon').optional().isFloat({ min: -180, max: 180 }).withMessage('lon must be between -180 and 180'),
    query('city').optional().trim().isString().isLength({ min: 2 }).withMessage('city must be at least 2 characters'),
  ],
  validate,
  weatherController.getCurrentWeather
);

router.get(
  '/forecast',
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat is required and must be between -90 and 90'),
    query('lon').isFloat({ min: -180, max: 180 }).withMessage('lon is required and must be between -180 and 180'),
  ],
  validate,
  weatherController.getForecast
);

router.get(
  '/disease-risk',
  [
    query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90'),
    query('lon').optional().isFloat({ min: -180, max: 180 }).withMessage('lon must be between -180 and 180'),
    query('city').optional().trim().isString().isLength({ min: 2 }).withMessage('city must be at least 2 characters'),
  ],
  validate,
  weatherController.getDiseaseRisk
);

export default router;
