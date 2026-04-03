import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeficiencyImage {
  url: string;
  caption?: string;
}

export interface IDeficiencyChemicalTreatment {
  name: string;
  dosage: string;
  applicationMethod: string;
}

export interface IDeficiencyTreatments {
  organic: string[];
  chemical: IDeficiencyChemicalTreatment[];
}

export interface IDeficiencyAffectedCrop {
  crop: Types.ObjectId;
  severity: 'low' | 'medium' | 'high';
}

export type NutrientType =
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'calcium'
  | 'magnesium'
  | 'sulfur'
  | 'iron'
  | 'manganese'
  | 'zinc'
  | 'copper'
  | 'boron'
  | 'molybdenum';

export interface IDeficiency extends Document {
  name: string;
  nameHi?: string;
  nutrient: NutrientType;
  affectedCrops: IDeficiencyAffectedCrop[];
  symptoms: string[];
  symptomsHi: string[];
  images: IDeficiencyImage[];
  treatments: IDeficiencyTreatments;
  preventionTips: string[];
  preventionTipsHi: string[];
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deficiencySchema = new Schema<IDeficiency>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameHi: { type: String, trim: true },
    nutrient: {
      type: String,
      enum: [
        'nitrogen',
        'phosphorus',
        'potassium',
        'calcium',
        'magnesium',
        'sulfur',
        'iron',
        'manganese',
        'zinc',
        'copper',
        'boron',
        'molybdenum',
      ],
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
          enum: ['low', 'medium', 'high'],
          required: true,
        },
      },
    ],
    symptoms: [{ type: String }],
    symptomsHi: [{ type: String }],
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String },
      },
    ],
    treatments: {
      organic: [{ type: String }],
      chemical: [
        {
          name: { type: String, required: true },
          dosage: { type: String, required: true },
          applicationMethod: { type: String, required: true },
        },
      ],
    },
    preventionTips: [{ type: String }],
    preventionTipsHi: [{ type: String }],
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
deficiencySchema.index({ name: 'text' });
deficiencySchema.index({ nutrient: 1 });

export const Deficiency = mongoose.model<IDeficiency>(
  'Deficiency',
  deficiencySchema
);
