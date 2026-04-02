import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({
        field: 'path' in e ? (e as any).path : 'param' in e ? (e as any).param : 'unknown',
        message: e.msg,
      })),
    });
    return;
  }
  next();
}
