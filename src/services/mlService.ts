import { env } from '../config/env';
import logger from '../utils/logger';

/**
 * A single prediction from the ML inference service.
 */
export interface MLPrediction {
  class_name: string;
  crop: string;
  disease: string;
  healthy: boolean;
  confidence: number;
}

/**
 * Response shape from the ML inference service /predict endpoint.
 */
interface MLPredictResponse {
  predictions: MLPrediction[];
  inference_time_ms: number;
}

/**
 * Call the Python ML inference service to classify a plant disease image.
 *
 * Sends the image buffer as multipart/form-data to the FastAPI /predict
 * endpoint and returns the top-5 predictions.
 */
export async function callMLService(
  imageBuffer: Buffer
): Promise<MLPrediction[]> {
  const baseUrl = env.ML_SERVICE_URL;
  const url = `${baseUrl}/predict`;

  logger.info('Calling ML inference service', {
    url,
    imageSize: imageBuffer.length,
  });

  const formData = new FormData();
  const arrayBuffer = imageBuffer.buffer.slice(
    imageBuffer.byteOffset,
    imageBuffer.byteOffset + imageBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
  formData.append('file', blob, 'image.jpg');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `ML service returned ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as MLPredictResponse;

    logger.info('ML service prediction received', {
      topPrediction: data.predictions[0]?.class_name,
      topConfidence: data.predictions[0]?.confidence,
      inferenceTimeMs: data.inference_time_ms,
      numPredictions: data.predictions.length,
    });

    return data.predictions;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('ML service request timed out after 30s', { url });
      throw new Error('ML inference service request timed out');
    }
    logger.error('ML service request failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the ML inference service is available.
 */
export async function isMLServiceHealthy(): Promise<boolean> {
  const baseUrl = env.ML_SERVICE_URL;
  const url = `${baseUrl}/health`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { status: string; model_loaded: boolean };
    return data.status === 'healthy' && data.model_loaded;
  } catch {
    return false;
  }
}
