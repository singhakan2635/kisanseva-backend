/**
 * Translation service supporting Bhashini (primary) + Azure Translator (fallback).
 *
 * Bhashini API (Dhruva):
 *   - Registration: https://bhashini.gov.in/ulca/user/register
 *   - Base URL: https://dhruva-api.bhashini.gov.in/services/inference/pipeline
 *   - Auth: Authorization header with API key, userID header
 *   - Docs: https://bhashini.gitbook.io/bhashini-apis
 *
 * Azure Translator (fallback):
 *   - Base URL: https://api.cognitive.microsofttranslator.com/translate?api-version=3.0
 *   - Auth: Ocp-Apim-Subscription-Key + Ocp-Apim-Subscription-Region headers
 *
 * Supported BCP-47 language codes (22 Indian languages):
 *   hi, bn, ta, te, mr, gu, kn, ml, pa, or, as, ur, sa, mai, kok, doi, mni, sat, sd, ne, bo, ks
 */

import { env } from '../config/env';
import logger from '../utils/logger';
import { Disease } from '../models/Disease';
import type { IChemicalTreatment, IDiseaseTranslation } from '../models/Disease';

// ---------------------------------------------------------------------------
// Language definitions
// ---------------------------------------------------------------------------

export interface LanguageInfo {
  /** BCP-47 code used across both APIs */
  code: string;
  /** English name */
  name: string;
  /** Native script name */
  nativeName: string;
  /** Bhashini uses ISO 639-1/639-3 codes internally */
  bhashiniCode: string;
  /** Azure uses BCP-47 */
  azureCode: string;
}

/**
 * All 22 scheduled Indian languages (8th Schedule of the Constitution)
 * plus English as source.
 */
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'hi', name: 'Hindi', nativeName: '\u0939\u093f\u0928\u094d\u0926\u0940', bhashiniCode: 'hi', azureCode: 'hi' },
  { code: 'bn', name: 'Bengali', nativeName: '\u09ac\u09be\u0982\u09b2\u09be', bhashiniCode: 'bn', azureCode: 'bn' },
  { code: 'ta', name: 'Tamil', nativeName: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd', bhashiniCode: 'ta', azureCode: 'ta' },
  { code: 'te', name: 'Telugu', nativeName: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41', bhashiniCode: 'te', azureCode: 'te' },
  { code: 'mr', name: 'Marathi', nativeName: '\u092e\u0930\u093e\u0920\u0940', bhashiniCode: 'mr', azureCode: 'mr' },
  { code: 'gu', name: 'Gujarati', nativeName: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0', bhashiniCode: 'gu', azureCode: 'gu' },
  { code: 'kn', name: 'Kannada', nativeName: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', bhashiniCode: 'kn', azureCode: 'kn' },
  { code: 'ml', name: 'Malayalam', nativeName: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02', bhashiniCode: 'ml', azureCode: 'ml' },
  { code: 'pa', name: 'Punjabi', nativeName: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40', bhashiniCode: 'pa', azureCode: 'pa' },
  { code: 'or', name: 'Odia', nativeName: '\u0b13\u0b21\u0b3c\u0b3f\u0b06', bhashiniCode: 'or', azureCode: 'or' },
  { code: 'as', name: 'Assamese', nativeName: '\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be', bhashiniCode: 'as', azureCode: 'as' },
  { code: 'ur', name: 'Urdu', nativeName: '\u0627\u0631\u062f\u0648', bhashiniCode: 'ur', azureCode: 'ur' },
  { code: 'sa', name: 'Sanskrit', nativeName: '\u0938\u0902\u0938\u094d\u0915\u0943\u0924\u092e\u094d', bhashiniCode: 'sa', azureCode: 'sa' },
  { code: 'mai', name: 'Maithili', nativeName: '\u092e\u0948\u0925\u093f\u0932\u0940', bhashiniCode: 'mai', azureCode: 'mai' },
  { code: 'kok', name: 'Konkani', nativeName: '\u0915\u094b\u0902\u0915\u0923\u0940', bhashiniCode: 'kok', azureCode: 'kok' },
  { code: 'doi', name: 'Dogri', nativeName: '\u0921\u094b\u0917\u0930\u0940', bhashiniCode: 'doi', azureCode: 'doi' },
  { code: 'mni', name: 'Manipuri', nativeName: '\u09ae\u09a3\u09bf\u09aa\u09c1\u09b0\u09c0', bhashiniCode: 'mni', azureCode: 'mni' },
  { code: 'sat', name: 'Santali', nativeName: '\u1c65\u1c5f\u1c71\u1c5b\u1c5f\u1c63\u1c64', bhashiniCode: 'sat', azureCode: 'sat' },
  { code: 'sd', name: 'Sindhi', nativeName: '\u0633\u0646\u068c\u064a', bhashiniCode: 'sd', azureCode: 'sd' },
  { code: 'ne', name: 'Nepali', nativeName: '\u0928\u0947\u092a\u093e\u0932\u0940', bhashiniCode: 'ne', azureCode: 'ne' },
  { code: 'bo', name: 'Bodo', nativeName: '\u092c\u094b\u0921\u094b', bhashiniCode: 'brx', azureCode: 'brx' },
  { code: 'ks', name: 'Kashmiri', nativeName: '\u0643\u0634\u0645\u06cc\u0631\u06cc', bhashiniCode: 'ks', azureCode: 'ks' },
];

const LANGUAGE_MAP = new Map<string, LanguageInfo>(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l])
);

// ---------------------------------------------------------------------------
// Rate limiter (simple token bucket for Bhashini: ~2 req/sec)
// ---------------------------------------------------------------------------

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(maxPerSecond: number) {
    this.maxTokens = maxPerSecond;
    this.tokens = maxPerSecond;
    this.refillRate = maxPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const bhashiniLimiter = new RateLimiter(2);

// ---------------------------------------------------------------------------
// Bhashini Translation
// ---------------------------------------------------------------------------

const BHASHINI_BASE_URL = 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';

interface BhashiniPipelineResponse {
  pipelineResponse: Array<{
    taskType: string;
    output: Array<{ source: string; target: string }>;
  }>;
}

async function translateViaBhashini(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!env.BHASHINI_API_KEY || !env.BHASHINI_USER_ID) {
    throw new Error('Bhashini API credentials not configured');
  }

  const srcInfo = LANGUAGE_MAP.get(sourceLang);
  const tgtInfo = LANGUAGE_MAP.get(targetLang);
  const srcCode = srcInfo?.bhashiniCode ?? sourceLang;
  const tgtCode = tgtInfo?.bhashiniCode ?? targetLang;

  await bhashiniLimiter.acquire();

  const body = {
    pipelineTasks: [
      {
        taskType: 'translation',
        config: {
          language: {
            sourceLanguage: srcCode,
            targetLanguage: tgtCode,
          },
        },
      },
    ],
    inputData: {
      input: [{ source: text }],
    },
  };

  const response = await fetch(BHASHINI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: env.BHASHINI_API_KEY,
      userID: env.BHASHINI_USER_ID,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    logger.error('Bhashini API error', {
      status: response.status,
      error: errorText,
      sourceLang: srcCode,
      targetLang: tgtCode,
    });
    throw new Error(`Bhashini API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BhashiniPipelineResponse;
  const output = data.pipelineResponse?.[0]?.output?.[0]?.target;

  if (!output) {
    throw new Error('Bhashini returned empty translation output');
  }

  return output;
}

// ---------------------------------------------------------------------------
// Azure Translator (fallback)
// ---------------------------------------------------------------------------

const AZURE_BASE_URL = 'https://api.cognitive.microsofttranslator.com/translate';

interface AzureTranslateResult {
  translations: Array<{ text: string; to: string }>;
}

async function translateViaAzure(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!env.AZURE_TRANSLATOR_KEY) {
    throw new Error('Azure Translator key not configured');
  }

  const srcInfo = LANGUAGE_MAP.get(sourceLang);
  const tgtInfo = LANGUAGE_MAP.get(targetLang);
  const srcCode = srcInfo?.azureCode ?? sourceLang;
  const tgtCode = tgtInfo?.azureCode ?? targetLang;

  const url = `${AZURE_BASE_URL}?api-version=3.0&from=${srcCode}&to=${tgtCode}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': env.AZURE_TRANSLATOR_KEY,
      'Ocp-Apim-Subscription-Region': env.AZURE_TRANSLATOR_REGION,
    },
    body: JSON.stringify([{ Text: text }]),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    logger.error('Azure Translator API error', {
      status: response.status,
      error: errorText,
      sourceLang: srcCode,
      targetLang: tgtCode,
    });
    throw new Error(`Azure Translator error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AzureTranslateResult[];
  const translated = data?.[0]?.translations?.[0]?.text;

  if (!translated) {
    throw new Error('Azure Translator returned empty result');
  }

  return translated;
}

// ---------------------------------------------------------------------------
// Public API: translateText (Bhashini primary, Azure fallback, English last resort)
// ---------------------------------------------------------------------------

/**
 * Translate text from source to target language.
 * Tries Bhashini first, falls back to Azure, returns original text on total failure.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'en'
): Promise<string> {
  if (!text.trim()) return '';
  if (sourceLang === targetLang) return text;

  // Try Bhashini (primary)
  try {
    const result = await translateViaBhashini(text, sourceLang, targetLang);
    return result;
  } catch (bhashiniErr) {
    logger.warn('Bhashini translation failed, trying Azure fallback', {
      error: (bhashiniErr as Error).message,
      targetLang,
    });
  }

  // Try Azure (fallback)
  try {
    const result = await translateViaAzure(text, sourceLang, targetLang);
    return result;
  } catch (azureErr) {
    logger.warn('Azure translation also failed, returning original English text', {
      error: (azureErr as Error).message,
      targetLang,
    });
  }

  // Both failed - return original text
  return text;
}

// ---------------------------------------------------------------------------
// Public API: batchTranslate
// ---------------------------------------------------------------------------

/**
 * Translate an array of texts to the target language.
 * Processes sequentially to respect rate limits.
 */
export async function batchTranslate(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'en'
): Promise<string[]> {
  const results: string[] = [];
  for (const text of texts) {
    const translated = await translateText(text, targetLang, sourceLang);
    results.push(translated);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API: translateDiseaseTreatments
// ---------------------------------------------------------------------------

/**
 * Translate all translatable fields of a disease document and persist to the
 * `translations` map in MongoDB. Skips languages that are already translated
 * (resume-safe).
 */
export async function translateDiseaseTreatments(
  diseaseId: string,
  targetLangs: string[]
): Promise<{ translated: string[]; skipped: string[]; failed: string[] }> {
  const disease = await Disease.findById(diseaseId);
  if (!disease) {
    throw new Error(`Disease not found: ${diseaseId}`);
  }

  const translated: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const lang of targetLangs) {
    // Skip if already translated (resume-safe)
    const existing = disease.translations?.get(lang);
    if (existing && existing.symptoms && existing.symptoms.length > 0) {
      logger.debug('Skipping already-translated language', { diseaseId, lang, diseaseName: disease.name });
      skipped.push(lang);
      continue;
    }

    try {
      logger.info('Translating disease', { diseaseId, lang, diseaseName: disease.name });

      // Translate disease name
      const translatedName = await translateText(disease.name, lang);

      // Translate symptoms
      const translatedSymptoms = await batchTranslate(disease.symptoms ?? [], lang);

      // Translate treatments
      const translatedMechanical = await batchTranslate(
        disease.treatments?.mechanical ?? [],
        lang
      );
      const translatedPhysical = await batchTranslate(
        disease.treatments?.physical ?? [],
        lang
      );
      const translatedBiological = await batchTranslate(
        disease.treatments?.biological ?? [],
        lang
      );

      // Translate chemical treatments (each has multiple fields)
      const translatedChemical: IChemicalTreatment[] = [];
      for (const chem of disease.treatments?.chemical ?? []) {
        const [name, dosage, applicationMethod, frequency] = await Promise.all([
          translateText(chem.name, lang),
          translateText(chem.dosage, lang),
          translateText(chem.applicationMethod, lang),
          translateText(chem.frequency, lang),
        ]);
        translatedChemical.push({ name, dosage, applicationMethod, frequency });
      }

      // Translate prevention tips
      const translatedPrevention = await batchTranslate(
        disease.preventionTips ?? [],
        lang
      );

      const translation: IDiseaseTranslation = {
        name: translatedName,
        symptoms: translatedSymptoms,
        mechanical: translatedMechanical,
        physical: translatedPhysical,
        chemical: translatedChemical,
        biological: translatedBiological,
        preventionTips: translatedPrevention,
      };

      // Persist to MongoDB
      if (!disease.translations) {
        disease.translations = new Map();
      }
      disease.translations.set(lang, translation);
      await disease.save();

      translated.push(lang);
      logger.info('Disease translation complete', { diseaseId, lang, diseaseName: disease.name });
    } catch (err) {
      logger.error('Failed to translate disease', {
        diseaseId,
        lang,
        diseaseName: disease.name,
        error: (err as Error).message,
      });
      failed.push(lang);
    }
  }

  return { translated, skipped, failed };
}

// ---------------------------------------------------------------------------
// Public API: getAvailableLanguages
// ---------------------------------------------------------------------------

/**
 * Returns list of all supported languages with metadata.
 */
export function getAvailableLanguages(): LanguageInfo[] {
  return [...SUPPORTED_LANGUAGES];
}

/**
 * Validate a language code is supported.
 */
export function isLanguageSupported(code: string): boolean {
  return LANGUAGE_MAP.has(code);
}
