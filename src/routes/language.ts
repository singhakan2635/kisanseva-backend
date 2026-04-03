import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import { validate } from '../middleware/validate';
import * as languageController from '../controllers/languageController';
import { SUPPORTED_LANGUAGES } from '../types/sarvam';

const router = Router();

const validLangCodes = Object.keys(SUPPORTED_LANGUAGES);

// Multer config for audio uploads (STT): 25MB max, audio types
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/mpeg', 'audio/mp3',
      'audio/ogg', 'audio/opus',
      'audio/webm',
      'audio/aac', 'audio/mp4', 'audio/x-m4a',
      'audio/flac',
      'audio/amr',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}. Supported: wav, mp3, ogg, webm, aac, flac, amr`));
    }
  },
});

// POST /language/translate
router.post(
  '/translate',
  [
    body('text').trim().notEmpty().withMessage('Text is required').isLength({ max: 2000 }).withMessage('Text must be 2000 characters or less'),
    body('sourceLang').isIn(validLangCodes).withMessage(`sourceLang must be one of: ${validLangCodes.join(', ')}`),
    body('targetLang').isIn(validLangCodes).withMessage(`targetLang must be one of: ${validLangCodes.join(', ')}`),
  ],
  validate,
  languageController.translate
);

// POST /language/tts
router.post(
  '/tts',
  [
    body('text').trim().notEmpty().withMessage('Text is required').isLength({ max: 1500 }).withMessage('Text must be 1500 characters or less'),
    body('language').isIn(validLangCodes).withMessage(`language must be one of: ${validLangCodes.join(', ')}`),
    body('gender').optional().isIn(['male', 'female']).withMessage('gender must be "male" or "female"'),
  ],
  validate,
  languageController.textToSpeech
);

// POST /language/stt
router.post(
  '/stt',
  audioUpload.single('audio'),
  languageController.speechToText
);

// GET /language/supported
router.get('/supported', languageController.getSupportedLanguages);

export default router;
