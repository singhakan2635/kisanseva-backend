import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import * as authController from '../controllers/authController';

const router = Router();

router.post(
  '/register',
  [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').optional().trim(),
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

router.post(
  '/firebase',
  [
    body('firebaseToken').notEmpty().withMessage('Firebase token is required'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('role').optional().trim(),
  ],
  validate,
  authController.firebaseAuth
);

router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.get('/me', authController.getCurrentUser);

export default router;
