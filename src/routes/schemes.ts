import { Router } from 'express';
import { query, param, body } from 'express-validator';
import { validate } from '../middleware/validate';
import { requireRole } from '../middleware/requireRole';
import * as schemeController from '../controllers/schemeController';

const router = Router();

// ─── Public routes (mounted before auth in app.ts) ───────────────────────────

router.get(
  '/',
  [
    query('state').optional().trim().isString().withMessage('state must be a string'),
    query('category')
      .optional()
      .trim()
      .isIn(['subsidy', 'insurance', 'loan', 'training', 'market', 'equipment', 'other'])
      .withMessage('Invalid category'),
    query('crop').optional().trim().isString().withMessage('crop must be a string'),
    query('issueType')
      .optional()
      .trim()
      .isIn(['disease', 'loss', 'equipment', 'irrigation', 'organic'])
      .withMessage('Invalid issueType'),
  ],
  validate,
  schemeController.listSchemes
);

router.get(
  '/recommend',
  [
    query('state').optional().trim().isString().withMessage('state must be a string'),
    query('crop').optional().trim().isString().withMessage('crop must be a string'),
    query('issue')
      .optional()
      .trim()
      .isIn(['disease', 'loss', 'equipment', 'irrigation', 'organic'])
      .withMessage('Invalid issue type'),
  ],
  validate,
  schemeController.recommendSchemes
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
    query('language').optional().trim().isIn(['en', 'hi']).withMessage('Language must be en or hi'),
  ],
  validate,
  schemeController.searchSchemes
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid scheme ID')],
  validate,
  schemeController.getScheme
);

// ─── Admin routes (require authentication + admin role) ──────────────────────

router.post(
  '/',
  requireRole('admin', 'team_member'),
  [
    body('name').trim().notEmpty().withMessage('Scheme name is required'),
    body('category')
      .trim()
      .isIn(['subsidy', 'insurance', 'loan', 'training', 'market', 'equipment', 'other'])
      .withMessage('Invalid category'),
    body('applicableFor')
      .optional()
      .isArray()
      .withMessage('applicableFor must be an array'),
    body('applicableFor.*')
      .optional()
      .isIn(['crop_disease', 'crop_loss', 'equipment', 'irrigation', 'organic', 'general'])
      .withMessage('Invalid applicableFor value'),
    body('states').optional().isArray().withMessage('states must be an array'),
    body('applicableCrops').optional().isArray().withMessage('applicableCrops must be an array'),
    body('documentsRequired').optional().isArray().withMessage('documentsRequired must be an array'),
    body('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
    body('endDate').optional().isISO8601().withMessage('endDate must be a valid date'),
  ],
  validate,
  schemeController.createScheme
);

router.patch(
  '/:id',
  requireRole('admin', 'team_member'),
  [
    param('id').isMongoId().withMessage('Invalid scheme ID'),
    body('category')
      .optional()
      .trim()
      .isIn(['subsidy', 'insurance', 'loan', 'training', 'market', 'equipment', 'other'])
      .withMessage('Invalid category'),
    body('applicableFor')
      .optional()
      .isArray()
      .withMessage('applicableFor must be an array'),
    body('applicableFor.*')
      .optional()
      .isIn(['crop_disease', 'crop_loss', 'equipment', 'irrigation', 'organic', 'general'])
      .withMessage('Invalid applicableFor value'),
  ],
  validate,
  schemeController.updateScheme
);

router.delete(
  '/:id',
  requireRole('admin', 'team_member'),
  [param('id').isMongoId().withMessage('Invalid scheme ID')],
  validate,
  schemeController.deleteScheme
);

export default router;
