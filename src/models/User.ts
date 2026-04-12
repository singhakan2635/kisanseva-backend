import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { UserRole } from '../types';

export type SupportedLanguage =
  | 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa'
  | 'or' | 'as' | 'ur' | 'sa' | 'mai' | 'kok' | 'doi' | 'mni' | 'sat'
  | 'sd' | 'ne' | 'bo' | 'ks';

export const SUPPORTED_LANGUAGE_CODES: SupportedLanguage[] = [
  'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa',
  'or', 'as', 'ur', 'sa', 'mai', 'kok', 'doi', 'mni', 'sat',
  'sd', 'ne', 'bo', 'ks',
];

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  firebaseUid?: string;
  preferredLanguage: SupportedLanguage;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: function (this: IUser) {
        return !this.firebaseUid;
      },
      select: false,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['farmer', 'expert', 'admin', 'team_member'],
      required: true,
    },
    phone: { type: String, trim: true },
    firebaseUid: { type: String, unique: true, sparse: true },
    preferredLanguage: {
      type: String,
      enum: SUPPORTED_LANGUAGE_CODES,
      default: 'en',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as mongoose.Types.ObjectId).toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.firebaseUid;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Indexes
userSchema.index({ firstName: 'text', lastName: 'text' });
userSchema.index({ phone: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
