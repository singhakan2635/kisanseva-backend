/**
 * Batch translate all disease data in MongoDB into multiple Indian languages.
 *
 * Uses Bhashini API (primary) with Azure Translator fallback.
 * Respects rate limits (2 req/sec for Bhashini).
 * Resume-safe: skips diseases that are already translated for a given language.
 *
 * Usage:
 *   npx tsx scripts/batchTranslateDiseases.ts --lang hi
 *   npx tsx scripts/batchTranslateDiseases.ts --lang hi,ta,bn
 *   npx tsx scripts/batchTranslateDiseases.ts --lang all
 *   npx tsx scripts/batchTranslateDiseases.ts --lang all --dry-run
 */

import mongoose from 'mongoose';
import { env } from '../src/config/env';
import { Disease } from '../src/models/Disease';
import {
  translateDiseaseTreatments,
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
} from '../src/services/translationService';

// Winston logger is tied to the app — use a simple logger for scripts
const log = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${new Date().toISOString()} ${msg}${metaStr}`);
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${new Date().toISOString()} ${msg}${metaStr}`);
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${new Date().toISOString()} ${msg}${metaStr}`);
  },
};

function parseArgs(): { langs: string[]; dryRun: boolean } {
  const args = process.argv.slice(2);
  let langArg = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      langArg = args[i + 1];
      i++;
    }
    if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!langArg) {
    log.error('Usage: npx tsx scripts/batchTranslateDiseases.ts --lang <hi|hi,ta,bn|all> [--dry-run]');
    process.exit(1);
  }

  let langs: string[];
  if (langArg === 'all') {
    langs = SUPPORTED_LANGUAGES.map((l) => l.code);
  } else {
    langs = langArg.split(',').map((l) => l.trim());
    for (const lang of langs) {
      if (!isLanguageSupported(lang)) {
        log.error(`Unsupported language code: "${lang}"`);
        log.info('Supported codes', {
          codes: SUPPORTED_LANGUAGES.map((l) => `${l.code} (${l.name})`).join(', '),
        });
        process.exit(1);
      }
    }
  }

  return { langs, dryRun };
}

async function main(): Promise<void> {
  const { langs, dryRun } = parseArgs();

  log.info('Starting batch disease translation', {
    languages: langs.join(', '),
    dryRun,
  });

  // Connect to MongoDB
  if (!env.MONGODB_URI) {
    log.error('MONGODB_URI is not set in environment variables');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  log.info('Connected to MongoDB');

  try {
    const diseases = await Disease.find({}).lean(false);
    log.info(`Found ${diseases.length} diseases to process`);

    if (dryRun) {
      log.info('DRY RUN - no translations will be performed');
      for (const disease of diseases) {
        const existingLangs = disease.translations
          ? Array.from(disease.translations.keys())
          : [];
        const needsTranslation = langs.filter((l) => !existingLangs.includes(l));
        log.info(`Disease: ${disease.name}`, {
          existingTranslations: existingLangs.join(', ') || 'none',
          willTranslate: needsTranslation.join(', ') || 'already done',
        });
      }
      return;
    }

    // Check API credentials
    if (!env.BHASHINI_API_KEY && !env.AZURE_TRANSLATOR_KEY) {
      log.error('No translation API keys configured. Set BHASHINI_API_KEY or AZURE_TRANSLATOR_KEY.');
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
      log.info(`[${i + 1}/${diseases.length}] Processing: ${disease.name}`);

      const result = await translateDiseaseTreatments(
        disease._id.toString(),
        langs
      );

      summary.translated += result.translated.length;
      summary.skipped += result.skipped.length;
      summary.failed += result.failed.length;

      if (result.translated.length > 0) {
        log.info(`  Translated: ${result.translated.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        log.info(`  Skipped (already done): ${result.skipped.join(', ')}`);
      }
      if (result.failed.length > 0) {
        log.warn(`  Failed: ${result.failed.join(', ')}`);
      }
    }

    log.info('Batch translation complete', summary);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }
}

main().catch((err) => {
  log.error('Fatal error in batch translation', { error: (err as Error).message });
  process.exit(1);
});
