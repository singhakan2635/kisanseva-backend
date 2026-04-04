import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthRequest, JwtPayload } from '../types';

/** Routes that do not require authentication at all */
const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'POST', path: '/api/auth/firebase' },
];

/**
 * Routes where auth is OPTIONAL - unauthenticated requests pass through,
 * but a valid Bearer token is still parsed and sets req.user when present.
 */
const OPTIONAL_AUTH_PREFIXES: Array<{ method: string; prefix: string }> = [];

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const isPublic = PUBLIC_ROUTES.some(
    (route) => req.method === route.method && req.path === route.path
  );

  if (isPublic) {
    next();
    return;
  }

  const isOptional = OPTIONAL_AUTH_PREFIXES.some(
    (route) => req.method === route.method && req.path.startsWith(route.prefix)
  );

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = { id: decoded.id, role: decoded.role };
    } catch {
      if (!isOptional) {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
        return;
      }
      // Optional route with bad token - proceed unauthenticated
    }
  } else if (!isOptional) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  next();
}
