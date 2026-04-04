import mongoose, { Schema, Document } from 'mongoose';

export type SchemeCategory =
  | 'subsidy'
  | 'insurance'
  | 'loan'
  | 'training'
  | 'market'
  | 'equipment'
  | 'other';

export type SchemeApplicableFor =
  | 'crop_disease'
  | 'crop_loss'
  | 'equipment'
  | 'irrigation'
  | 'organic'
  | 'general';

export interface IGovernmentScheme extends Document {
  name: string;
  nameHi?: string;
  description?: string;
  descriptionHi?: string;
  ministry?: string;
  eligibility?: string;
  eligibilityHi?: string;
  benefits?: string;
  benefitsHi?: string;
  applicationUrl?: string;
  states: string[];
  category: SchemeCategory;
  active: boolean;
  source?: string;

  // Region targeting (empty arrays = all India)
  region: {
    states: string[];
    districts: string[];
  };
  applicableCrops: string[];
  applicableFor: SchemeApplicableFor[];

  // Dates
  startDate?: Date;
  endDate?: Date;
  lastVerified?: Date;

  // Additional metadata
  sourceUrl?: string;
  helpline?: string;
  applicationProcess?: string;
  applicationProcessHi?: string;
  documentsRequired: string[];
  maxBenefit?: string;

  createdAt: Date;
  updatedAt: Date;
}

const governmentSchemeSchema = new Schema<IGovernmentScheme>(
  {
    name: { type: String, required: true, trim: true },
    nameHi: { type: String, trim: true },
    description: { type: String },
    descriptionHi: { type: String },
    ministry: { type: String },
    eligibility: { type: String },
    eligibilityHi: { type: String },
    benefits: { type: String },
    benefitsHi: { type: String },
    applicationUrl: { type: String },
    states: [{ type: String }],
    category: {
      type: String,
      enum: [
        'subsidy',
        'insurance',
        'loan',
        'training',
        'market',
        'equipment',
        'other',
      ],
      required: true,
    },
    active: { type: Boolean, default: true },
    source: { type: String },

    // Region targeting
    region: {
      states: [{ type: String }],
      districts: [{ type: String }],
    },
    applicableCrops: [{ type: String }],
    applicableFor: [{
      type: String,
      enum: ['crop_disease', 'crop_loss', 'equipment', 'irrigation', 'organic', 'general'],
    }],

    // Dates
    startDate: { type: Date },
    endDate: { type: Date },
    lastVerified: { type: Date },

    // Additional metadata
    sourceUrl: { type: String },
    helpline: { type: String },
    applicationProcess: { type: String },
    applicationProcessHi: { type: String },
    documentsRequired: [{ type: String }],
    maxBenefit: { type: String },
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
governmentSchemeSchema.index({ name: 'text', nameHi: 'text', description: 'text' });
governmentSchemeSchema.index({ category: 1 });
governmentSchemeSchema.index({ active: 1 });
governmentSchemeSchema.index({ states: 1 });
governmentSchemeSchema.index({ 'region.states': 1 });
governmentSchemeSchema.index({ applicableFor: 1 });
governmentSchemeSchema.index({ applicableCrops: 1 });
governmentSchemeSchema.index({ endDate: 1 });

export const GovernmentScheme = mongoose.model<IGovernmentScheme>(
  'GovernmentScheme',
  governmentSchemeSchema
);
