/**
 * Seed script for KisanSeva database.
 *
 * Loads crops, diseases, deficiencies, pesticides, and government schemes
 * from JSON data files into MongoDB, resolving cross-references (crop names
 * to ObjectIds, disease names to ObjectIds) along the way.
 *
 * Usage:
 *   MONGODB_URI=mongodb://localhost:27017/kisanseva-db npx tsx scripts/seedData.ts
 */

import mongoose, { Types } from 'mongoose';
import path from 'path';
import fs from 'fs';
import winston from 'winston';

// ---------------------------------------------------------------------------
// Logger (Winston only, never console.log)
// ---------------------------------------------------------------------------
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Models (import directly from src)
// ---------------------------------------------------------------------------
import { Crop } from '../src/models/Crop';
import { Disease } from '../src/models/Disease';
import { Deficiency } from '../src/models/Deficiency';
import { Pesticide } from '../src/models/Pesticide';
import { GovernmentScheme } from '../src/models/GovernmentScheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(__dirname, 'data');

function loadJSON<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// Valid crop categories per the Mongoose schema
const VALID_CROP_CATEGORIES = new Set([
  'cereal',
  'pulse',
  'vegetable',
  'fruit',
  'oilseed',
  'spice',
  'fiber',
  'other',
]);

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

/**
 * Seed crops and return a Map<cropName, ObjectId> for resolving references.
 */
async function seedCrops(): Promise<Map<string, Types.ObjectId>> {
  const rawCrops = loadJSON<Record<string, unknown>[]>('crops.json');
  logger.info(`Loaded ${rawCrops.length} crops from JSON`);

  const cropMap = new Map<string, Types.ObjectId>();

  for (const raw of rawCrops) {
    // Map unsupported categories to 'other'
    const category = VALID_CROP_CATEGORIES.has(raw.category as string)
      ? (raw.category as string)
      : 'other';

    const doc = await Crop.findOneAndUpdate(
      { name: raw.name as string },
      {
        name: raw.name,
        nameHi: raw.nameHi,
        scientificName: raw.scientificName,
        category,
        growingSeason: raw.growingSeason,
        description: raw.description,
        descriptionHi: raw.descriptionHi,
        commonRegions: raw.commonRegions ?? [],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    cropMap.set(doc.name, doc._id as Types.ObjectId);
  }

  logger.info(`Seeded ${cropMap.size} crops`);
  return cropMap;
}

/**
 * Resolve an array of crop name strings to ObjectIds using the crop map.
 * Skips names that cannot be resolved (with a warning).
 */
function resolveCropIds(
  names: string[],
  cropMap: Map<string, Types.ObjectId>,
  context: string,
): Types.ObjectId[] {
  const ids: Types.ObjectId[] = [];
  for (const name of names) {
    const id = cropMap.get(name);
    if (id) {
      ids.push(id);
    } else {
      logger.warn(`Crop "${name}" not found in crop map (context: ${context})`);
    }
  }
  return ids;
}

/**
 * Seed diseases. Returns a Map<diseaseName, ObjectId> for pesticide references.
 */
async function seedDiseases(
  cropMap: Map<string, Types.ObjectId>,
): Promise<Map<string, Types.ObjectId>> {
  const rawDiseases = loadJSON<Record<string, unknown>[]>('diseases.json');
  logger.info(`Loaded ${rawDiseases.length} diseases from JSON`);

  const diseaseMap = new Map<string, Types.ObjectId>();

  for (const raw of rawDiseases) {
    const cropNames = (raw.affectedCrops as string[]) ?? [];

    // Build affectedCrops array with ObjectIds; default severity to 'medium'
    const affectedCrops = cropNames
      .map((name) => {
        const cropId = cropMap.get(name);
        if (!cropId) {
          logger.warn(
            `Crop "${name}" not found for disease "${raw.name}" — skipping`,
          );
          return null;
        }
        return { crop: cropId, severity: 'medium' };
      })
      .filter(Boolean);

    const doc = await Disease.findOneAndUpdate(
      { name: raw.name as string },
      {
        name: raw.name,
        nameHi: raw.nameHi,
        scientificName: raw.scientificName,
        type: raw.type,
        affectedCrops,
        symptoms: raw.symptoms ?? [],
        symptomsHi: raw.symptomsHi ?? [],
        causativeAgent: raw.causativeAgent,
        favorableConditions: raw.favorableConditions,
        images: raw.images ?? [],
        treatments: raw.treatments ?? { mechanical: [], physical: [], chemical: [], biological: [] },
        preventionTips: raw.preventionTips ?? [],
        preventionTipsHi: raw.preventionTipsHi ?? [],
        source: raw.source,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    diseaseMap.set(doc.name, doc._id as Types.ObjectId);
  }

  logger.info(`Seeded ${diseaseMap.size} diseases`);
  return diseaseMap;
}

/**
 * Seed deficiencies.
 */
async function seedDeficiencies(
  cropMap: Map<string, Types.ObjectId>,
): Promise<number> {
  const rawDefs = loadJSON<Record<string, unknown>[]>('deficiencies.json');
  logger.info(`Loaded ${rawDefs.length} deficiencies from JSON`);

  let count = 0;
  for (const raw of rawDefs) {
    const cropNames = (raw.affectedCrops as string[]) ?? [];

    const affectedCrops = cropNames
      .map((name) => {
        const cropId = cropMap.get(name);
        if (!cropId) {
          logger.warn(
            `Crop "${name}" not found for deficiency "${raw.name}" — skipping`,
          );
          return null;
        }
        return { crop: cropId, severity: 'medium' };
      })
      .filter(Boolean);

    await Deficiency.findOneAndUpdate(
      { name: raw.name as string },
      {
        name: raw.name,
        nameHi: raw.nameHi,
        nutrient: raw.nutrient,
        affectedCrops,
        symptoms: raw.symptoms ?? [],
        symptomsHi: raw.symptomsHi ?? [],
        images: raw.images ?? [],
        treatments: raw.treatments ?? { organic: [], chemical: [] },
        preventionTips: raw.preventionTips ?? [],
        preventionTipsHi: raw.preventionTipsHi ?? [],
        source: raw.source,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    count++;
  }

  logger.info(`Seeded ${count} deficiencies`);
  return count;
}

/**
 * Seed pesticides, resolving both applicableCrops and targetDiseases.
 */
async function seedPesticides(
  cropMap: Map<string, Types.ObjectId>,
  diseaseMap: Map<string, Types.ObjectId>,
): Promise<number> {
  const rawPesticides = loadJSON<Record<string, unknown>[]>('pesticides.json');
  logger.info(`Loaded ${rawPesticides.length} pesticides from JSON`);

  let count = 0;
  for (const raw of rawPesticides) {
    const cropNames = (raw.applicableCrops as string[]) ?? [];
    const diseaseNames = (raw.targetDiseases as string[]) ?? [];

    const applicableCrops = resolveCropIds(
      cropNames,
      cropMap,
      `pesticide "${raw.name}"`,
    );

    const targetDiseases: Types.ObjectId[] = [];
    for (const dName of diseaseNames) {
      const id = diseaseMap.get(dName);
      if (id) {
        targetDiseases.push(id);
      } else {
        logger.warn(
          `Disease "${dName}" not found for pesticide "${raw.name}" — skipping`,
        );
      }
    }

    await Pesticide.findOneAndUpdate(
      { name: raw.name as string },
      {
        name: raw.name,
        nameHi: raw.nameHi,
        tradeName: raw.tradeName ?? [],
        type: raw.type,
        activeIngredient: raw.activeIngredient,
        chemicalGroup: raw.chemicalGroup,
        targetDiseases,
        targetPests: raw.targetPests ?? [],
        applicableCrops,
        dosage: raw.dosage ?? {},
        applicationMethod: raw.applicationMethod,
        frequency: raw.frequency,
        waitingPeriod: raw.waitingPeriod,
        toxicityClass: raw.toxicityClass,
        safetyPrecautions: raw.safetyPrecautions ?? [],
        safetyPrecautionsHi: raw.safetyPrecautionsHi ?? [],
        banned: raw.banned ?? false,
        approvedBy: raw.approvedBy ?? [],
        source: raw.source,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    count++;
  }

  logger.info(`Seeded ${count} pesticides`);
  return count;
}

/**
 * Seed government schemes (no cross-references needed).
 */
async function seedGovernmentSchemes(): Promise<number> {
  const rawSchemes = loadJSON<Record<string, unknown>[]>(
    'governmentSchemes.json',
  );
  logger.info(`Loaded ${rawSchemes.length} government schemes from JSON`);

  let count = 0;
  for (const raw of rawSchemes) {
    // JSON has benefits/eligibility as arrays — join into strings for the model
    const benefits = Array.isArray(raw.benefits)
      ? (raw.benefits as string[]).join('\n')
      : (raw.benefits as string) ?? undefined;

    const eligibility = Array.isArray(raw.eligibility)
      ? (raw.eligibility as string[]).join('\n')
      : (raw.eligibility as string) ?? undefined;

    await GovernmentScheme.findOneAndUpdate(
      { name: raw.name as string },
      {
        name: raw.name,
        nameHi: raw.nameHi,
        description: raw.description,
        descriptionHi: raw.descriptionHi,
        ministry: raw.ministry,
        eligibility,
        benefits,
        applicationUrl: raw.website,
        states: [],
        category: 'other', // JSON doesn't specify category; default to 'other'
        active: raw.active ?? true,
        source: raw.source,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    count++;
  }

  logger.info(`Seeded ${count} government schemes`);
  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mongoUri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/kisanseva-db';

  logger.info(`Connecting to MongoDB at ${mongoUri}`);
  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  try {
    // 1. Crops first (others reference them)
    const cropMap = await seedCrops();

    // 2. Diseases (reference crops, and pesticides reference diseases)
    const diseaseMap = await seedDiseases(cropMap);

    // 3. Deficiencies (reference crops)
    await seedDeficiencies(cropMap);

    // 4. Pesticides (reference crops AND diseases)
    await seedPesticides(cropMap, diseaseMap);

    // 5. Government schemes (no references)
    await seedGovernmentSchemes();

    // Summary
    const cropCount = await Crop.countDocuments();
    const diseaseCount = await Disease.countDocuments();
    const deficiencyCount = await Deficiency.countDocuments();
    const pesticideCount = await Pesticide.countDocuments();
    const schemeCount = await GovernmentScheme.countDocuments();

    logger.info('--- Seed Summary ---');
    logger.info(`  Crops:              ${cropCount}`);
    logger.info(`  Diseases:           ${diseaseCount}`);
    logger.info(`  Deficiencies:       ${deficiencyCount}`);
    logger.info(`  Pesticides:         ${pesticideCount}`);
    logger.info(`  Government Schemes: ${schemeCount}`);
    logger.info('Seeding complete!');
  } catch (err) {
    logger.error(`Seeding failed: ${(err as Error).message}`);
    logger.error((err as Error).stack ?? '');
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

main();
