import mongoose, { Schema, Document, Types } from 'mongoose';
import { ConversationState } from '../types/whatsapp';

export interface IWhatsAppSession extends Document {
  phoneNumber: string;
  state: ConversationState;
  language: string;
  lastCropMentioned: string | null;
  lastDiagnosisId: Types.ObjectId | null;
  context: Map<string, string>;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

const whatsAppSessionSchema = new Schema<IWhatsAppSession>(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    state: {
      type: String,
      enum: Object.values(ConversationState),
      default: ConversationState.IDLE,
    },
    language: {
      type: String,
      default: 'hi-IN',
    },
    lastCropMentioned: {
      type: String,
      default: null,
    },
    lastDiagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    context: {
      type: Map,
      of: String,
      default: new Map(),
    },
    lastActive: {
      type: Date,
      default: Date.now,
      index: { expires: 86400 }, // TTL: 24 hours
    },
  },
  {
    timestamps: true,
  }
);

export const WhatsAppSession = mongoose.model<IWhatsAppSession>(
  'WhatsAppSession',
  whatsAppSessionSchema
);
