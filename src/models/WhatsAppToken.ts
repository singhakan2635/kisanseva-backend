import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppToken extends Document {
  accessToken: string;
  tokenType: 'short_lived' | 'long_lived' | 'system_user';
  expiresAt?: Date;
  appId: string;
  createdAt: Date;
  updatedAt: Date;
}

const whatsAppTokenSchema = new Schema<IWhatsAppToken>(
  {
    accessToken: { type: String, required: true },
    tokenType: {
      type: String,
      enum: ['short_lived', 'long_lived', 'system_user'],
      default: 'short_lived',
    },
    expiresAt: { type: Date },
    appId: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Redact token in JSON output (show last 10 chars only)
        if (typeof ret.accessToken === 'string') {
          ret.accessToken = '****' + ret.accessToken.slice(-10);
        }
      },
    },
  }
);

export const WhatsAppToken = mongoose.model<IWhatsAppToken>('WhatsAppToken', whatsAppTokenSchema);
