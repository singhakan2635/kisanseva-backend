// Sarvam AI API types
// Docs: https://docs.sarvam.ai/

export type SupportedLanguage =
  | 'hi-IN'  // Hindi
  | 'bn-IN'  // Bengali
  | 'ta-IN'  // Tamil
  | 'te-IN'  // Telugu
  | 'mr-IN'  // Marathi
  | 'gu-IN'  // Gujarati
  | 'kn-IN'  // Kannada
  | 'ml-IN'  // Malayalam
  | 'pa-IN'  // Punjabi
  | 'od-IN'  // Odia
  | 'as-IN'  // Assamese
  | 'ur-IN'  // Urdu
  | 'en-IN'; // English

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, string> = {
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'pa-IN': 'Punjabi',
  'od-IN': 'Odia',
  'as-IN': 'Assamese',
  'ur-IN': 'Urdu',
  'en-IN': 'English',
};

// --- Translate API ---

export interface TranslateRequest {
  input: string;
  source_language_code: SupportedLanguage | 'auto';
  target_language_code: SupportedLanguage;
  model?: 'mayura:v1' | 'sarvam-translate:v1';
  mode?: 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';
  speaker_gender?: 'Male' | 'Female';
  numerals_format?: 'international' | 'native';
}

export interface TranslateResponse {
  request_id: string;
  translated_text: string;
  source_language_code: string;
}

// --- Text-to-Speech API ---

export type TTSSpeaker =
  // bulbul:v3 voices
  | 'shubh' | 'aditya' | 'ritu' | 'priya' | 'neha' | 'rahul'
  | 'pooja' | 'rohan' | 'simran' | 'kavya' | 'amit' | 'dev'
  | 'ishita' | 'shreya' | 'ratan' | 'varun' | 'manan' | 'sumit'
  | 'roopa' | 'kabir' | 'aayan' | 'ashutosh' | 'advait'
  | 'meera' | 'arvind'
  // bulbul:v2 voices
  | 'anushka' | 'manisha' | 'vidya' | 'arya' | 'abhilash' | 'karun' | 'hitesh';

export interface TTSRequest {
  text: string;
  target_language_code: SupportedLanguage;
  speaker?: TTSSpeaker;
  model?: 'bulbul:v2' | 'bulbul:v3';
  pace?: number;
  speech_sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000;
  output_audio_codec?: 'mp3' | 'wav' | 'linear16' | 'mulaw' | 'alaw' | 'opus' | 'flac' | 'aac';
  enable_preprocessing?: boolean;
}

export interface TTSResponse {
  request_id: string;
  audios: string[]; // base64-encoded audio
}

// --- Speech-to-Text API ---

export interface STTResponse {
  request_id: string;
  transcript: string;
  language_code: string | null;
  language_probability: number | null;
}

// --- Translated Diagnosis ---

export interface TranslatedDiagnosis {
  primaryDiagnosis: {
    name: string;
    type: string;
    confidence: number;
    severity: string;
  };
  visibleSymptoms: string[];
  affectedPart: string;
  treatments: {
    mechanical: string[];
    physical: string[];
    chemical: Array<{
      name: string;
      dosage: string;
      applicationMethod: string;
      frequency: string;
    }>;
    biological: string[];
  };
  preventionTips: string[];
  disclaimer: string;
  language: SupportedLanguage;
}

// --- Cache entry ---

export interface TranslationCacheEntry {
  value: string;
  expiresAt: number;
}

// --- API Error ---

export interface SarvamApiError {
  error: {
    message: string;
    type: string;
  };
}
