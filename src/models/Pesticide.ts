import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPesticideDosage {
  perLiter: string;
  perAcre: string;
}

export type PesticideType =
  | 'fungicide'
  | 'insecticide'
  | 'herbicide'
  | 'bactericide'
  | 'nematicide'
  | 'rodenticide'
  | 'bio-pesticide';

export type ToxicityClass =
  | 'extremely_toxic'
  | 'highly_toxic'
  | 'moderately_toxic'
  | 'slightly_toxic'
  | 'unlikely_toxic';

export interface IPesticide extends Document {
  name: string;
  nameHi?: string;
  tradeName: string[];
  type: PesticideType;
  activeIngredient?: string;
  chemicalGroup?: string;
  targetDiseases: Types.ObjectId[];
  targetPests: string[];
  applicableCrops: Types.ObjectId[];
  dosage: IPesticideDosage;
  applicationMethod?: string;
  frequency?: string;
  waitingPeriod?: string;
  toxicityClass?: ToxicityClass;
  safetyPrecautions: string[];
  safetyPrecautionsHi: string[];
  banned: boolean;
  approvedBy: string[];
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pesticideSchema = new Schema<IPesticide>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameHi: { type: String, trim: true },
    tradeName: [{ type: String }],
    type: {
      type: String,
      enum: [
        'fungicide',
        'insecticide',
        'herbicide',
        'bactericide',
        'nematicide',
        'rodenticide',
        'bio-pesticide',
      ],
      required: true,
    },
    activeIngredient: { type: String },
    chemicalGroup: { type: String },
    targetDiseases: [{ type: Schema.Types.ObjectId, ref: 'Disease' }],
    targetPests: [{ type: String }],
    applicableCrops: [{ type: Schema.Types.ObjectId, ref: 'Crop' }],
    dosage: {
      perLiter: { type: String },
      perAcre: { type: String },
    },
    applicationMethod: { type: String },
    frequency: { type: String },
    waitingPeriod: { type: String },
    toxicityClass: {
      type: String,
      enum: [
        'extremely_toxic',
        'highly_toxic',
        'moderately_toxic',
        'slightly_toxic',
        'unlikely_toxic',
      ],
    },
    safetyPrecautions: [{ type: String }],
    safetyPrecautionsHi: [{ type: String }],
    banned: { type: Boolean, default: false },
    approvedBy: [{ type: String }],
    source: { type: String },
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
pesticideSchema.index({ name: 'text' });
pesticideSchema.index({ type: 1 });
pesticideSchema.index({ targetDiseases: 1 });
pesticideSchema.index({ applicableCrops: 1 });

export const Pesticide = mongoose.model<IPesticide>(
  'Pesticide',
  pesticideSchema
);
