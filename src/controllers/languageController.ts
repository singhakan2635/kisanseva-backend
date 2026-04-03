import { Request, Response } from 'express';
import * as sarvamService from '../services/sarvamService';
import { SUPPORTED_LANGUAGES } from '../types/sarvam';
import type { SupportedLanguage } from '../types/sarvam';
import logger from '../utils/logger';

/**
 * POST /language/translate
 * Translate text between Indian languages.
 */
export async function translate(req: Request, res: Response): Promise<void> {
  try {
    const { text, sourceLang, targetLang } = req.body as {
      text: string;
      sourceLang: SupportedLanguage;
      targetLang: SupportedLanguage;
    };

    const translated = await sarvamService.translateText(text, sourceLang, targetLang);

    res.json({
      success: true,
      data: { translatedText: translated, sourceLang, targetLang },
      message: 'Translation successful',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Translation failed';
    logger.error('Translation endpoint error', { error: message });
    const status = message.includes('not configured') ? 503 : 500;
    res.status(status).json({ success: false, message });
  }
}

/**
 * POST /language/tts
 * Convert text to speech. Returns audio file (MP3).
 */
export async function textToSpeech(req: Request, res: Response): Promise<void> {
  try {
    const { text, language, gender } = req.body as {
      text: string;
      language: SupportedLanguage;
      gender?: 'male' | 'female';
    };

    const audioBuffer = await sarvamService.textToSpeech(text, language, gender);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.length),
      'Content-Disposition': 'attachment; filename="speech.mp3"',
    });
    res.send(audioBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text-to-speech failed';
    logger.error('TTS endpoint error', { error: message });
    const status = message.includes('not configured') ? 503 : 500;
    res.status(status).json({ success: false, message });
  }
}

/**
 * POST /language/stt
 * Transcribe speech to text. Accepts multipart audio file.
 */
export async function speechToText(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Audio file is required. Upload as "audio" field.' });
      return;
    }

    const language = req.body.language as SupportedLanguage;
    if (!language) {
      res.status(400).json({ success: false, message: 'Language parameter is required.' });
      return;
    }

    const transcript = await sarvamService.speechToText(file.buffer, language);

    res.json({
      success: true,
      data: { transcript, language },
      message: 'Transcription successful',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speech-to-text failed';
    logger.error('STT endpoint error', { error: message });
    const status = message.includes('not configured') ? 503 : 500;
    res.status(status).json({ success: false, message });
  }
}

/**
 * GET /language/supported
 * List all supported languages.
 */
export function getSupportedLanguages(_req: Request, res: Response): void {
  const languages = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
    code,
    name,
  }));

  res.json({
    success: true,
    data: { languages },
    message: 'Supported languages retrieved',
  });
}
