import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthRequest, UserRole, JwtPayload } from '../types';

/**
 * Middleware factory that restricts access to users with one of the specified roles.
 *
 * If req.user is not already populated (e.g. route is mounted before the global
 * authMiddleware), this will attempt to parse the Bearer token from the
 * Authorization header. This allows routes to be mounted in the public section
 * of app.ts while still protecting write endpoints.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // If user not already set by authMiddleware, try to parse JWT
    if (!req.user) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

      if (token) {
        try {
          const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
          req.user = { id: decoded.id, role: decoded.role };
        } catch {
          res.status(401).json({ success: false, message: 'Invalid or expired token' });
          return;
        }
      } else {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
