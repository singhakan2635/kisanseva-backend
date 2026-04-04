import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import type { UserRole } from '../types';
import logger from '../utils/logger';

export function generateTokenPair(userId: string, role: string): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign({ id: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
  const secret = env.REFRESH_TOKEN_SECRET || env.JWT_SECRET;
  const refreshToken = jwt.sign({ id: userId, role, type: 'refresh' }, secret, {
    expiresIn: '7d',
  });
  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): { id: string; role: string } {
  const secret = env.REFRESH_TOKEN_SECRET || env.JWT_SECRET;
  const decoded = jwt.verify(token, secret) as { id: string; role: string; type: string };
  if (decoded.type !== 'refresh') throw new Error('Invalid token type');
  return { id: decoded.id, role: decoded.role };
}

export async function register(data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}): Promise<{ user: Record<string, unknown>; accessToken: string; refreshToken: string }> {
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in.');
  }

  if (data.phone) {
    const normalizedPhone = data.phone.replace(/\D/g, '');
    if (normalizedPhone) {
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) {
        throw new Error('This phone number is already registered. Please sign in.');
      }
    }
  }

  const role = data.role || 'farmer';

  const user = await User.create({
    email: data.email,
    passwordHash: data.password,
    firstName: data.firstName,
    lastName: data.lastName,
    role,
    phone: data.phone,
  });

  logger.info('User registered', { userId: user._id.toString(), role });

  const { accessToken, refreshToken } = generateTokenPair(user._id.toString(), user.role);
  const userJson = user.toJSON();
  return { user: userJson as Record<string, unknown>, accessToken, refreshToken };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: Record<string, unknown>; accessToken: string; refreshToken: string }> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  logger.info('User logged in', { userId: user._id.toString(), role: user.role });

  const { accessToken, refreshToken } = generateTokenPair(user._id.toString(), user.role);
  const userJson = user.toJSON();
  return { user: userJson as Record<string, unknown>, accessToken, refreshToken };
}

export async function getCurrentUser(userId: string): Promise<Record<string, unknown> | null> {
  const user = await User.findById(userId);
  if (!user) return null;
  return user.toJSON() as Record<string, unknown>;
}

export async function authenticateWithFirebase(
  firebaseToken: string,
  phone: string,
  role: string
): Promise<{ user: Record<string, unknown>; accessToken: string; refreshToken: string }> {
  const firebaseApp = getFirebaseAdmin();
  const decoded = await firebaseApp.auth().verifyIdToken(firebaseToken);
  const firebaseUid = decoded.uid;

  // Phone from verified token takes priority, fall back to provided phone
  const verifiedPhone = decoded.phone_number || phone;
  const normalizedPhone = verifiedPhone.replace(/\D/g, '');

  // Try to find existing user by firebaseUid
  let user = await User.findOne({ firebaseUid });

  // Try by phone number if not found by firebaseUid
  if (!user && normalizedPhone) {
    user = await User.findOne({ phone: normalizedPhone });
    if (user) {
      // Link existing phone account to Firebase
      user.firebaseUid = firebaseUid;
      await user.save();
      logger.info('Linked existing phone account to Firebase', {
        userId: user._id.toString(),
        firebaseUid,
      });
    }
  }

  // Try by email if available from token
  if (!user && decoded.email) {
    user = await User.findOne({ email: decoded.email.toLowerCase() });
    if (user) {
      user.firebaseUid = firebaseUid;
      await user.save();
      logger.info('Linked existing email account to Firebase', {
        userId: user._id.toString(),
        firebaseUid,
      });
    }
  }

  if (user) {
    logger.info('Firebase login successful', { userId: user._id.toString(), role: user.role });
    const { accessToken, refreshToken } = generateTokenPair(user._id.toString(), user.role);
    return { user: user.toJSON() as Record<string, unknown>, accessToken, refreshToken };
  }

  // New user — create account
  const validRoles: UserRole[] = ['farmer', 'expert', 'admin', 'team_member'];
  const userRole: UserRole = validRoles.includes(role as UserRole) ? (role as UserRole) : 'farmer';

  const email = decoded.email || `phone_${firebaseUid}@placeholder.local`;

  const newUser = await User.create({
    email,
    firstName: 'Farmer',
    lastName: normalizedPhone ? normalizedPhone.slice(-4) : firebaseUid.slice(0, 6),
    role: userRole,
    phone: normalizedPhone || undefined,
    firebaseUid,
  });

  logger.info('New user registered via Firebase', {
    userId: newUser._id.toString(),
    role: userRole,
    firebaseUid,
  });

  const { accessToken, refreshToken } = generateTokenPair(newUser._id.toString(), newUser.role);
  return { user: newUser.toJSON() as Record<string, unknown>, accessToken, refreshToken };
}
