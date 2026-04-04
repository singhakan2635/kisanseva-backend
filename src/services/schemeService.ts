import { FilterQuery } from 'mongoose';
import { GovernmentScheme, IGovernmentScheme, SchemeApplicableFor } from '../models/GovernmentScheme';
import logger from '../utils/logger';

/**
 * Map issue types to relevant scheme categories and applicableFor values.
 * Used for smart recommendations.
 */
const ISSUE_TO_SCHEME_MAP: Record<string, { applicableFor: SchemeApplicableFor[]; categories: string[] }> = {
  disease: {
    applicableFor: ['crop_disease', 'general'],
    categories: ['insurance', 'subsidy'],
  },
  loss: {
    applicableFor: ['crop_loss', 'general'],
    categories: ['insurance', 'subsidy', 'loan'],
  },
  equipment: {
    applicableFor: ['equipment', 'general'],
    categories: ['subsidy', 'loan', 'equipment'],
  },
  irrigation: {
    applicableFor: ['irrigation', 'general'],
    categories: ['subsidy', 'loan'],
  },
  organic: {
    applicableFor: ['organic', 'general'],
    categories: ['subsidy', 'training'],
  },
};

/**
 * Get relevant schemes with smart filtering based on farmer context.
 */
export async function getRelevantSchemes(
  state?: string,
  crop?: string,
  issueType?: string
): Promise<IGovernmentScheme[]> {
  const filter: FilterQuery<IGovernmentScheme> = { active: true };

  // Filter by state - show schemes for the state or all-India schemes
  if (state) {
    filter.$or = [
      { 'region.states': { $size: 0 } },
      { 'region.states': state },
      { states: state },
      { states: { $size: 0 } },
    ];
  }

  // Filter by crop
  if (crop) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { applicableCrops: { $size: 0 } },
        { applicableCrops: crop },
      ],
    });
  }

  // Filter by issue type - map to relevant applicableFor + categories
  if (issueType) {
    const mapping = ISSUE_TO_SCHEME_MAP[issueType];
    if (mapping) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { applicableFor: { $in: mapping.applicableFor } },
          { category: { $in: mapping.categories } },
          { applicableFor: { $size: 0 } },
        ],
      });
    }
  }

  // Exclude expired schemes
  filter.$and = filter.$and || [];
  filter.$and.push({
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gte: new Date() } },
    ],
  });

  const schemes = await GovernmentScheme.find(filter).sort({ createdAt: -1 }).lean();

  logger.debug('getRelevantSchemes', {
    state,
    crop,
    issueType,
    resultCount: schemes.length,
  });

  return schemes as unknown as IGovernmentScheme[];
}

/**
 * Get schemes filtered by category.
 */
export async function getSchemesByCategory(category: string): Promise<IGovernmentScheme[]> {
  const schemes = await GovernmentScheme.find({ category, active: true })
    .sort({ createdAt: -1 })
    .lean();
  return schemes as unknown as IGovernmentScheme[];
}

/**
 * Full-text search across scheme name, nameHi, and description.
 */
export async function searchSchemes(
  query: string,
  language?: string
): Promise<IGovernmentScheme[]> {
  const filter: FilterQuery<IGovernmentScheme> = {
    active: true,
    $text: { $search: query },
  };

  // If language specified, boost results based on language-specific fields
  const projection = language === 'hi'
    ? { score: { $meta: 'textScore' } }
    : { score: { $meta: 'textScore' } };

  const schemes = await GovernmentScheme.find(filter, projection)
    .sort({ score: { $meta: 'textScore' } })
    .lean();

  logger.debug('searchSchemes', { query, language, resultCount: schemes.length });

  return schemes as unknown as IGovernmentScheme[];
}

/**
 * Find all schemes that have passed their endDate but are still marked active.
 */
export async function getExpiredSchemes(): Promise<IGovernmentScheme[]> {
  const schemes = await GovernmentScheme.find({
    active: true,
    endDate: { $exists: true, $ne: null, $lt: new Date() },
  }).lean();
  return schemes as unknown as IGovernmentScheme[];
}

/**
 * Mark expired schemes as inactive. Returns the count of deactivated schemes.
 */
export async function deactivateExpiredSchemes(): Promise<number> {
  const result = await GovernmentScheme.updateMany(
    {
      active: true,
      endDate: { $exists: true, $ne: null, $lt: new Date() },
    },
    {
      $set: { active: false },
    }
  );

  const count = result.modifiedCount;

  if (count > 0) {
    logger.info('Deactivated expired schemes', { count });
  }

  return count;
}

/**
 * Get a single scheme by ID.
 */
export async function getSchemeById(id: string): Promise<IGovernmentScheme | null> {
  return GovernmentScheme.findById(id).lean() as unknown as IGovernmentScheme | null;
}

/**
 * List schemes with optional filters.
 */
export async function listSchemes(filters: {
  state?: string;
  category?: string;
  crop?: string;
  issueType?: string;
  active?: boolean;
}): Promise<IGovernmentScheme[]> {
  const filter: FilterQuery<IGovernmentScheme> = {};

  if (filters.active !== undefined) {
    filter.active = filters.active;
  } else {
    filter.active = true;
  }

  if (filters.state) {
    filter.$or = [
      { 'region.states': { $size: 0 } },
      { 'region.states': filters.state },
      { states: filters.state },
      { states: { $size: 0 } },
    ];
  }

  if (filters.category) {
    filter.category = filters.category;
  }

  if (filters.crop) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { applicableCrops: { $size: 0 } },
        { applicableCrops: filters.crop },
      ],
    });
  }

  const schemes = await GovernmentScheme.find(filter).sort({ createdAt: -1 }).lean();
  return schemes as unknown as IGovernmentScheme[];
}

/**
 * Create a new scheme.
 */
export async function createScheme(
  data: Partial<IGovernmentScheme>
): Promise<IGovernmentScheme> {
  const scheme = new GovernmentScheme(data);
  await scheme.save();
  logger.info('Created new scheme', { schemeId: scheme._id, name: scheme.name });
  return scheme;
}

/**
 * Update an existing scheme.
 */
export async function updateScheme(
  id: string,
  data: Partial<IGovernmentScheme>
): Promise<IGovernmentScheme | null> {
  const scheme = await GovernmentScheme.findByIdAndUpdate(id, data, { new: true }).lean();
  if (scheme) {
    logger.info('Updated scheme', { schemeId: id });
  }
  return scheme as IGovernmentScheme | null;
}

/**
 * Soft-delete (deactivate) a scheme.
 */
export async function deactivateScheme(id: string): Promise<IGovernmentScheme | null> {
  const scheme = await GovernmentScheme.findByIdAndUpdate(
    id,
    { active: false },
    { new: true }
  ).lean();
  if (scheme) {
    logger.info('Deactivated scheme', { schemeId: id });
  }
  return scheme as IGovernmentScheme | null;
}
