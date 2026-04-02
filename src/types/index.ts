import { Request } from 'express';

export type UserRole = 'farmer' | 'expert' | 'admin' | 'team_member';

export interface JwtPayload {
  id: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
