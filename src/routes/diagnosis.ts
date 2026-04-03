import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validate';
import * as diagnosisController from '../controllers/diagnosisController';
import logger from '../utils/logger';

const router = Router();

// Multer error handler middleware
function handleMulterError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err.message?.includes('Unsupported file type')) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }
  if (err.message?.includes('File too large')) {
    res.status(400).json({
      success: false,
      message: 'Image file is too large. Maximum size is 10MB.',
    });
    return;
  }
  if ('code' in err && (err as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      message: 'Image file is too large. Maximum size is 10MB.',
    });
    return;
  }
  logger.error('Unexpected upload error', {
    error: err.message,
    stack: err.stack,
  });
  next(err);
}

// POST /diagnosis/analyze - upload image, get AI diagnosis
router.post(
  '/analyze',
  diagnosisController.upload.single('image'),
  handleMulterError,
  diagnosisController.analyzeImage
);

// GET /diagnosis/diseases?crop=Rice - list diseases for a crop
router.get(
  '/diseases',
  [query('crop').trim().notEmpty().withMessage('Crop name is required')],
  validate,
  diagnosisController.getDiseasesByCrop
);

// GET /diagnosis/search?q=blight - search diseases and deficiencies
router.get(
  '/search',
  [
    query('q')
      .trim()
      .notEmpty()
      .withMessage('Search query is required')
      .isLength({ min: 2 })
      .withMessage('Search query must be at least 2 characters'),
  ],
  validate,
  diagnosisController.searchDiseases
);

export default router;
