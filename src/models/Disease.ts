import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDiseaseImage {
  url: string;
  caption?: string;
  stage: 'early' | 'mid' | 'advanced';
}

export interface IChemicalTreatment {
  name: string;
  dosage: string;
  applicationMethod: string;
  frequency: string;
}

export interface IDiseaseTreatments {
  mechanical: string[];
  physical: string[];
  chemical: IChemicalTreatment[];
  biological: string[];
}

export interface IAffectedCropEntry {
  crop: Types.ObjectId;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface IDiseaseTranslation {
  name?: string;
  symptoms: string[];
  mechanical: string[];
  physical: string[];
  chemical: IChemicalTreatment[];
  biological: string[];
  preventionTips: string[];
  disclaimer?: string;
}

export interface IDisease extends Document {
  name: string;
  nameHi?: string;
  scientificName?: string;
  type: 'fungal' | 'bacterial' | 'viral' | 'nematode' | 'parasitic' | 'other';
  affectedCrops: IAffectedCropEntry[];
  symptoms: string[];
  symptomsHi: string[];
  causativeAgent?: string;
  favorableConditions?: string;
  images: IDiseaseImage[];
  treatments: IDiseaseTreatments;
  preventionTips: string[];
  preventionTipsHi: string[];
  translations: Map<string, IDiseaseTranslation>;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const diseaseSchema = new Schema<IDisease>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameHi: { type: String, trim: true },
    scientificName: { type: String, trim: true },
    type: {
      type: String,
      enum: ['fungal', 'bacterial', 'viral', 'nematode', 'parasitic', 'pest', 'deficiency', 'other'],
      required: true,
    },
    affectedCrops: [
      {
        crop: {
          type: Schema.Types.ObjectId,
          ref: 'Crop',
          required: true,
        },
        severity: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical'],
          required: true,
        },
      },
    ],
    symptoms: [{ type: String }],
    symptomsHi: [{ type: String }],
    causativeAgent: { type: String },
    favorableConditions: { type: String },
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        stage: {
          type: String,
          enum: ['early', 'mid', 'advanced'],
          required: true,
        },
      },
    ],
    treatments: {
      mechanical: [{ type: String }],
      physical: [{ type: String }],
      chemical: [
        {
          name: { type: String, required: true },
          dosage: { type: String, required: true },
          applicationMethod: { type: String, required: true },
          frequency: { type: String, required: true },
        },
      ],
      biological: [{ type: String }],
    },
    preventionTips: [{ type: String }],
    preventionTipsHi: [{ type: String }],
    translations: {
      type: Map,
      of: {
        name: { type: String },
        symptoms: [{ type: String }],
        mechanical: [{ type: String }],
        physical: [{ type: String }],
        chemical: [
          {
            name: { type: String, required: true },
            dosage: { type: String, required: true },
            applicationMethod: { type: String, required: true },
            frequency: { type: String, required: true },
          },
        ],
        biological: [{ type: String }],
        preventionTips: [{ type: String }],
        disclaimer: { type: String },
      },
      default: {},
    },
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
diseaseSchema.index({ name: 'text' });
diseaseSchema.index({ type: 1 });
diseaseSchema.index({ 'affectedCrops.crop': 1 });

export const Disease = mongoose.model<IDisease>('Disease', diseaseSchema);
