/**
 * Batch translate all disease data into multiple Indian languages.
 *
 * Translates disease names, symptoms, prevention tips, and treatments
 * using Sarvam AI (primary), Azure Translator (fallback), and Bhashini (tertiary).
 *
 * Populates both the `translations` Map AND the dedicated Hindi fields
 * (nameHi, symptomsHi, preventionTipsHi) for backward compatibility.
 *
 * Resume-safe: skips diseases that already have translations for a given language.
 *
 * Usage:
 *   npx tsx src/scripts/translateDiseases.ts              # defaults: hi, bn, ta, te, mr
 *   npx tsx src/scripts/translateDiseases.ts hi            # Hindi only
 *   npx tsx src/scripts/translateDiseases.ts hi bn ta      # specific languages
 *   npx tsx src/scripts/translateDiseases.ts --dry-run     # preview without translating
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { Disease } from '../models/Disease';
import {
  translateDiseaseTreatments,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
} from '../services/translationService';
import logger from '../utils/logger';

const DEFAULT_LANGUAGES = ['hi', 'bn', 'ta', 'te', 'mr'];

function parseArgs(): { langs: string[]; dryRun: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;
  const langArgs: string[] = [];

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (!arg.startsWith('--')) {
      langArgs.push(arg.trim());
    }
  }

  const langs = langArgs.length > 0 ? langArgs : DEFAULT_LANGUAGES;

  for (const lang of langs) {
    if (!isLanguageSupported(lang)) {
      logger.error(`Unsupported language code: "${lang}"`, {
        supported: SUPPORTED_LANGUAGES.map((l) => `${l.code} (${l.name})`).join(', '),
      });
      process.exit(1);
    }
  }

  return { langs, dryRun };
}

async function main(): Promise<void> {
  const { langs, dryRun } = parseArgs();

  logger.info('Starting batch disease translation', {
    languages: langs.join(', '),
    dryRun,
  });

  if (!env.MONGODB_URI) {
    logger.error('MONGODB_URI is not set in environment variables');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  try {
    const diseases = await Disease.find({});
    logger.info(`Found ${diseases.length} diseases to process`);

    if (dryRun) {
      logger.info('DRY RUN - no translations will be performed');
      for (const disease of diseases) {
        const existingLangs = disease.translations
          ? Array.from(disease.translations.keys())
          : [];
        const needsTranslation = langs.filter((l) => !existingLangs.includes(l));
        const hasHindiFields = !!(disease.nameHi || disease.symptomsHi?.length || disease.preventionTipsHi?.length);
        logger.info(`Disease: ${disease.name}`, {
          existingTranslations: existingLangs.join(', ') || 'none',
          willTranslate: needsTranslation.join(', ') || 'already done',
          hasHindiFields,
        });
      }
      return;
    }

    // Check that at least one translation API is configured
    if (!env.SARVAM_API_KEY && !env.AZURE_TRANSLATOR_KEY && !env.BHASHINI_API_KEY) {
      logger.error('No translation API keys configured. Set SARVAM_API_KEY, AZURE_TRANSLATOR_KEY, or BHASHINI_API_KEY.');
      process.exit(1);
    }

    const summary = {
      totalDiseases: diseases.length,
      totalLanguages: langs.length,
      translated: 0,
      skipped: 0,
      failed: 0,
    };

    for (let i = 0; i < diseases.length; i++) {
      const disease = diseases[i];
      logger.info(`Translating ${i + 1}/${diseases.length}: ${disease.name}`);

      try {
        const result = await translateDiseaseTreatments(
          disease._id.toString(),
          langs
        );

        summary.translated += result.translated.length;
        summary.skipped += result.skipped.length;
        summary.failed += result.failed.length;

        if (result.translated.length > 0) {
          logger.info(`  Translated: ${result.translated.join(', ')}`);
        }
        if (result.skipped.length > 0) {
          logger.info(`  Skipped (already done): ${result.skipped.join(', ')}`);
        }
        if (result.failed.length > 0) {
          logger.warn(`  Failed: ${result.failed.join(', ')}`);
        }

        // If Hindi was translated, also populate the dedicated Hindi fields
        if (result.translated.includes('hi') || result.skipped.includes('hi')) {
          const refreshed = await Disease.findById(disease._id);
          const hiTranslation = refreshed?.translations?.get('hi');
          if (refreshed && hiTranslation) {
            let needsSave = false;

            if (hiTranslation.name && !refreshed.nameHi) {
              refreshed.nameHi = hiTranslation.name;
              needsSave = true;
            }
            if (hiTranslation.symptoms?.length && !refreshed.symptomsHi?.length) {
              refreshed.symptomsHi = hiTranslation.symptoms;
              needsSave = true;
            }
            if (hiTranslation.preventionTips?.length && !refreshed.preventionTipsHi?.length) {
              refreshed.preventionTipsHi = hiTranslation.preventionTips;
              needsSave = true;
            }

            if (needsSave) {
              await refreshed.save();
              logger.info(`  Updated Hindi dedicated fields for: ${disease.name}`);
            }
          }
        }
      } catch (err) {
        logger.error(`Failed to process disease: ${disease.name}`, {
          error: (err as Error).message,
        });
        summary.failed += langs.length;
      }
    }

    logger.info('Batch translation complete', summary);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

main().catch((err) => {
  logger.error('Fatal error in batch translation', { error: (err as Error).message });
  process.exit(1);
});
