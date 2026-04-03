import { env } from '../config/env';
import logger from '../utils/logger';
import type {
  SupportedLanguage,
  TranslateRequest,
  TranslateResponse,
  TTSRequest,
  TTSResponse,
  STTResponse,
  TranslatedDiagnosis,
  TranslationCacheEntry,
} from '../types/sarvam';
import type { DiagnosisResult } from '../types/diagnosis';

const SARVAM_API_BASE = 'https://api.sarvam.ai';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory translation cache: key = "srcLang|tgtLang|text" -> translated text
const translationCache = new Map<string, TranslationCacheEntry>();

function getCacheKey(text: string, sourceLang: string, targetLang: string): string {
  return `${sourceLang}|${targetLang}|${text}`;
}

function getCachedTranslation(key: string): string | null {
  const entry = translationCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    translationCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedTranslation(key: string, value: string): void {
  translationCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Periodically clean expired cache entries (every hour) */
const cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of translationCache) {
    if (now > entry.expiresAt) {
      translationCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('Cleaned expired translation cache entries', { cleaned, remaining: translationCache.size });
  }
}, 60 * 60 * 1000);
cacheCleanupInterval.unref(); // Don't block process exit

function ensureApiKey(): void {
  if (!env.SARVAM_API_KEY) {
    throw new Error('SARVAM_API_KEY is not configured. Set it in environment variables to enable language services.');
  }
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-subscription-key': env.SARVAM_API_KEY,
  };
}

async function handleApiResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    if (response.status === 429) {
      logger.warn('Sarvam API rate limit exceeded', { operation });
      throw new Error('Language service rate limit exceeded. Please try again in a moment.');
    }
    logger.error('Sarvam API error', { operation, status: response.status, error: errorText });
    throw new Error(`Language service error: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Translate text between Indian languages using Sarvam AI.
 */
export async function translateText(
  text: string,
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage
): Promise<string> {
  ensureApiKey();

  if (sourceLang === targetLang) return text;
  if (!text.trim()) return '';

  // Check cache
  const cacheKey = getCacheKey(text, sourceLang, targetLang);
  const cached = getCachedTranslation(cacheKey);
  if (cached !== null) {
    logger.debug('Translation cache hit', { sourceLang, targetLang, textLength: text.length });
    return cached;
  }

  logger.info('Translating text via Sarvam AI', { sourceLang, targetLang, textLength: text.length });

  const body: TranslateRequest = {
    input: text,
    source_language_code: sourceLang,
    target_language_code: targetLang,
    model: 'mayura:v1',
    mode: 'formal',
  };

  const response = await fetch(`${SARVAM_API_BASE}/translate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await handleApiResponse<TranslateResponse>(response, 'translate');
  const translated = data.translated_text;

  // Cache the result
  setCachedTranslation(cacheKey, translated);

  logger.info('Translation successful', { sourceLang, targetLang, requestId: data.request_id });
  return translated;
}

/**
 * Convert text to speech using Sarvam AI.
 * Returns a Buffer of the audio data (base64-decoded).
 */
export async function textToSpeech(
  text: string,
  language: SupportedLanguage,
  gender?: 'male' | 'female'
): Promise<Buffer> {
  ensureApiKey();

  if (!text.trim()) {
    throw new Error('Text cannot be empty for text-to-speech conversion.');
  }

  // Select speaker based on gender preference
  const speaker = gender === 'male' ? 'arvind' : 'meera';

  logger.info('Converting text to speech via Sarvam AI', { language, textLength: text.length, speaker });

  // bulbul:v2 supports max 1500 chars; trim if needed
  const trimmedText = text.length > 1500 ? text.slice(0, 1497) + '...' : text;

  const body: TTSRequest = {
    text: trimmedText,
    target_language_code: language,
    speaker,
    model: 'bulbul:v2',
    output_audio_codec: 'mp3',
    speech_sample_rate: 22050,
  };

  const response = await fetch(`${SARVAM_API_BASE}/text-to-speech`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await handleApiResponse<TTSResponse>(response, 'text-to-speech');

  if (!data.audios || data.audios.length === 0) {
    throw new Error('No audio returned from text-to-speech service.');
  }

  const audioBuffer = Buffer.from(data.audios[0], 'base64');
  logger.info('Text-to-speech successful', { language, requestId: data.request_id, audioSizeBytes: audioBuffer.length });
  return audioBuffer;
}

/**
 * Transcribe audio to text using Sarvam AI Speech-to-Text.
 * Accepts an audio Buffer and language code, returns transcribed text.
 */
export async function speechToText(
  audioBuffer: Buffer,
  language: SupportedLanguage
): Promise<string> {
  ensureApiKey();

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio buffer cannot be empty for speech-to-text conversion.');
  }

  logger.info('Transcribing audio via Sarvam AI', { language, audioSizeBytes: audioBuffer.length });

  // Sarvam STT uses multipart form data
  const formData = new FormData();
  const arrayBuf = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
  const audioBlob = new Blob([arrayBuf], { type: 'audio/wav' });
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('language_code', language);
  formData.append('model', 'saarika:v2.5');

  const response = await fetch(`${SARVAM_API_BASE}/speech-to-text`, {
    method: 'POST',
    headers: {
      'api-subscription-key': env.SARVAM_API_KEY,
      // Do not set Content-Type - fetch sets it with boundary for FormData
    },
    body: formData,
  });

  const data = await handleApiResponse<STTResponse>(response, 'speech-to-text');

  if (!data.transcript) {
    throw new Error('No transcript returned from speech-to-text service.');
  }

  logger.info('Speech-to-text successful', {
    language,
    requestId: data.request_id,
    transcriptLength: data.transcript.length,
    detectedLang: data.language_code,
  });

  return data.transcript;
}

/**
 * Translate all text fields of a diagnosis result to the target language.
 * Batches translations for efficiency.
 */
export async function translateDiagnosis(
  diagnosis: DiagnosisResult,
  targetLang: SupportedLanguage
): Promise<TranslatedDiagnosis> {
  ensureApiKey();

  if (targetLang === 'en-IN') {
    // No translation needed for English - map directly
    return mapDiagnosisToTranslated(diagnosis, 'en-IN');
  }

  logger.info('Translating diagnosis to target language', { targetLang });

  // Collect all strings that need translation
  const textsToTranslate: string[] = [];

  // Primary diagnosis name
  textsToTranslate.push(diagnosis.primaryDiagnosis.name);
  textsToTranslate.push(diagnosis.primaryDiagnosis.severity);
  textsToTranslate.push(diagnosis.primaryDiagnosis.type);

  // Symptoms
  textsToTranslate.push(...diagnosis.visibleSymptoms);

  // Affected part
  textsToTranslate.push(diagnosis.affectedPart);

  // Treatments
  textsToTranslate.push(...diagnosis.treatments.mechanical);
  textsToTranslate.push(...diagnosis.treatments.physical);
  textsToTranslate.push(...diagnosis.treatments.biological);

  // Chemical treatments
  for (const chem of diagnosis.treatments.chemical) {
    textsToTranslate.push(chem.name);
    textsToTranslate.push(chem.dosage);
    textsToTranslate.push(chem.applicationMethod);
    textsToTranslate.push(chem.frequency);
  }

  // Prevention tips
  textsToTranslate.push(...diagnosis.preventionTips);

  // Disclaimer
  textsToTranslate.push(diagnosis.disclaimer);

  // Batch translate all strings (translate individually since API takes single string)
  const translatedTexts = await Promise.all(
    textsToTranslate.map((t) => translateText(t, 'en-IN', targetLang))
  );

  // Reconstruct the translated diagnosis
  let idx = 0;
  const next = (): string => translatedTexts[idx++];

  const translated: TranslatedDiagnosis = {
    primaryDiagnosis: {
      name: next(),
      severity: next(),
      type: next(),
      confidence: diagnosis.primaryDiagnosis.confidence,
    },
    visibleSymptoms: diagnosis.visibleSymptoms.map(() => next()),
    affectedPart: next(),
    treatments: {
      mechanical: diagnosis.treatments.mechanical.map(() => next()),
      physical: diagnosis.treatments.physical.map(() => next()),
      biological: diagnosis.treatments.biological.map(() => next()),
      chemical: diagnosis.treatments.chemical.map(() => ({
        name: next(),
        dosage: next(),
        applicationMethod: next(),
        frequency: next(),
      })),
    },
    preventionTips: diagnosis.preventionTips.map(() => next()),
    disclaimer: next(),
    language: targetLang,
  };

  logger.info('Diagnosis translation complete', { targetLang, fieldsTranslated: idx });
  return translated;
}

function mapDiagnosisToTranslated(diagnosis: DiagnosisResult, lang: SupportedLanguage): TranslatedDiagnosis {
  return {
    primaryDiagnosis: {
      name: diagnosis.primaryDiagnosis.name,
      type: diagnosis.primaryDiagnosis.type,
      confidence: diagnosis.primaryDiagnosis.confidence,
      severity: diagnosis.primaryDiagnosis.severity,
    },
    visibleSymptoms: [...diagnosis.visibleSymptoms],
    affectedPart: diagnosis.affectedPart,
    treatments: {
      mechanical: [...diagnosis.treatments.mechanical],
      physical: [...diagnosis.treatments.physical],
      biological: [...diagnosis.treatments.biological],
      chemical: diagnosis.treatments.chemical.map((c) => ({
        name: c.name,
        dosage: c.dosage,
        applicationMethod: c.applicationMethod,
        frequency: c.frequency,
      })),
    },
    preventionTips: [...diagnosis.preventionTips],
    disclaimer: diagnosis.disclaimer,
    language: lang,
  };
}
