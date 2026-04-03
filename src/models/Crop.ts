import mongoose, { Schema, Document } from 'mongoose';

export interface ICrop extends Document {
  name: string;
  nameHi?: string;
  scientificName?: string;
  category:
    | 'cereal'
    | 'pulse'
    | 'vegetable'
    | 'fruit'
    | 'oilseed'
    | 'spice'
    | 'fiber'
    | 'other';
  growingSeason: 'kharif' | 'rabi' | 'zaid' | 'perennial';
  description?: string;
  descriptionHi?: string;
  imageUrl?: string;
  commonRegions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const cropSchema = new Schema<ICrop>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameHi: { type: String, trim: true },
    scientificName: { type: String, trim: true },
    category: {
      type: String,
      enum: [
        'cereal',
        'pulse',
        'vegetable',
        'fruit',
        'oilseed',
        'spice',
        'fiber',
        'other',
      ],
      required: true,
    },
    growingSeason: {
      type: String,
      enum: ['kharif', 'rabi', 'zaid', 'perennial'],
      required: true,
    },
    description: { type: String },
    descriptionHi: { type: String },
    imageUrl: { type: String },
    commonRegions: [{ type: String }],
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = (ret._id as mongoose.Types.ObjectId).toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
cropSchema.index({ name: 'text' });
cropSchema.index({ category: 1 });
cropSchema.index({ growingSeason: 1 });

export const Crop = mongoose.model<ICrop>('Crop', cropSchema);
