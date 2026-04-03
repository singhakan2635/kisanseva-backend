import { Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import * as diseaseDetectionService from '../services/diseaseDetectionService';
import logger from '../utils/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are allowed.`
      )
    );
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

export async function analyzeImage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No image file provided. Please upload an image using the "image" field.',
      });
      return;
    }

    const cropName = req.body.cropName as string | undefined;

    logger.info('Starting plant disease analysis', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      cropName: cropName || 'not specified',
    });

    const result = await diseaseDetectionService.analyzePlantImage(
      req.file.buffer,
      cropName
    );

    logger.info('Plant disease analysis complete', {
      diagnosis: result.primaryDiagnosis.name,
      confidence: result.primaryDiagnosis.confidence,
    });

    res.json({
      success: true,
      data: result,
      message: 'Image analyzed successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image analysis failed';

    if (message.includes('API key')) {
      logger.error('AI API key not configured', { error: message });
      res.status(503).json({
        success: false,
        message: 'Disease detection service is temporarily unavailable. Please try again later.',
      });
      return;
    }

    logger.error('Plant disease analysis failed', {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to analyze image. Please try again with a clearer photo of the affected plant.',
    });
  }
}

export async function getDiseasesByCrop(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const cropName = req.query.crop as string;
    if (!cropName) {
      res.status(400).json({
        success: false,
        message: 'Query parameter "crop" is required.',
      });
      return;
    }

    const diseases = await diseaseDetectionService.getDiseaseByCrop(cropName);

    res.json({
      success: true,
      data: diseases,
      message: `Found ${diseases.length} diseases for ${cropName}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch diseases';
    logger.error('Failed to fetch diseases by crop', { error: message });
    res.status(500).json({ success: false, message });
  }
}

export async function searchDiseases(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required.',
      });
      return;
    }

    const results = await diseaseDetectionService.searchDiseases(query);

    res.json({
      success: true,
      data: results,
      message: `Found ${results.length} results for "${query}"`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Search failed';
    logger.error('Disease search failed', { error: message });
    res.status(500).json({ success: false, message });
  }
}
