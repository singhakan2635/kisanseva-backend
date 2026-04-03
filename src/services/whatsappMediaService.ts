import { env } from '../config/env';
import logger from '../utils/logger';

interface MediaDownloadResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Download media (images, documents) from WhatsApp via Meta's Cloud API.
 *
 * Step 1: Retrieve the media URL from the Graph API using the media ID.
 * Step 2: Download the actual file bytes from that URL.
 */
export async function downloadMedia(mediaId: string): Promise<MediaDownloadResult> {
  const token = env.WHATSAPP_ACCESS_TOKEN;

  // Step 1: Get the media URL from the Graph API
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const errorBody = await metaRes.text();
    logger.error('Failed to retrieve media URL', { mediaId, status: metaRes.status, body: errorBody });
    throw new Error(`Failed to retrieve media URL for mediaId ${mediaId}: ${metaRes.status} - ${errorBody}`);
  }

  const metaData = (await metaRes.json()) as { url: string };

  if (!metaData.url) {
    throw new Error(`No URL returned from Graph API for mediaId ${mediaId}`);
  }

  // Step 2: Download the actual file bytes
  const fileRes = await fetch(metaData.url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    throw new Error(`Failed to download media from ${metaData.url}: ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine MIME type from the response content-type header
  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
  const mimeType = contentType.split(';')[0].trim();

  logger.info('Media downloaded successfully', { mediaId, mimeType, sizeBytes: buffer.length });

  return { buffer, mimeType };
}
