import { Request, Response } from 'express';
import * as authService from '../services/authService';
import type { AuthRequest } from '../types';
import logger from '../utils/logger';

const isProd = process.env.NODE_ENV === 'production';

/** Cookie options for the refresh token - httpOnly so JS cannot read it */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  };
}

/** Set refresh token as httpOnly cookie; return short-lived access token in body */
function sendAuthResponse(
  res: Response,
  status: number,
  user: Record<string, unknown>,
  accessToken: string,
  refreshToken: string,
  message: string
): void {
  res.cookie('refresh_token', refreshToken, refreshCookieOptions());
  res.status(status).json({ success: true, data: { user, token: accessToken }, message });
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { firstName, lastName, email, password, phone } = req.body;
    const result = await authService.register({
      firstName, lastName, email, password, phone,
    });
    sendAuthResponse(res, 201, result.user, result.accessToken, result.refreshToken, 'Registration successful');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    const isDuplicate = message.includes('already exists') || message.includes('already registered');
    const status = isDuplicate ? 409 : 500;
    res.status(status).json({ success: false, message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    sendAuthResponse(res, 200, result.user, result.accessToken, result.refreshToken, 'Login successful');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({ success: false, message });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: 0 });
  res.json({ success: true, message: 'Logged out successfully' });
}

/** Silently issue a new access token using the httpOnly refresh cookie */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token' });
      return;
    }

    const payload = authService.verifyRefreshToken(token);
    const user = await authService.getCurrentUser(payload.id);
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    // Rotate: issue new access token + new refresh token
    const { accessToken, refreshToken } = authService.generateTokenPair(payload.id, payload.role);
    res.cookie('refresh_token', refreshToken, refreshCookieOptions());
    res.json({ success: true, data: { token: accessToken } });
  } catch {
    res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: 0 });
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
}

export async function firebaseAuth(req: Request, res: Response): Promise<void> {
  try {
    const { firebaseToken, phone, role } = req.body;
    const result = await authService.authenticateWithFirebase(firebaseToken, phone, role);
    sendAuthResponse(res, 200, result.user, result.accessToken, result.refreshToken, 'Authentication successful');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Firebase authentication failed';
    const isConfig = message.includes('not configured');
    const status = isConfig ? 503 : 401;
    logger.error('Firebase auth failed', { error: message });
    res.status(status).json({ success: false, message });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const { firstName, lastName, phone: newPhone } = req.body;
    const update: Record<string, string> = {};
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (newPhone !== undefined) update.phone = newPhone;

    const { User } = await import('../models/User');
    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    logger.info('Profile updated', { userId: req.user.id });
    res.json({ success: true, data: user, message: 'Profile updated' });
  } catch (error) {
    logger.error('Profile update failed', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
}

export async function getCurrentUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const user = await authService.getCurrentUser(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to get current user' });
  }
}
