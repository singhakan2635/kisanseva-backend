import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { Disease, IDisease } from '../models/Disease';
import { Deficiency, IDeficiency } from '../models/Deficiency';
import { Pesticide } from '../models/Pesticide';
import { Crop } from '../models/Crop';
import logger from '../utils/logger';
import type {
  DiagnosisResult,
  AIAnalysisResponse,
  RecommendedPesticide,
  ChemicalTreatmentInfo,
} from '../types/diagnosis';

const DISCLAIMER =
  'This is an AI-assisted diagnosis. Please consult a local agricultural expert or Krishi Vigyan Kendra (KVK) for confirmation before applying any treatment.';

const VISION_PROMPT = `You are an expert agricultural plant pathologist with deep knowledge of crop diseases prevalent in India and South Asia. Analyze this plant image carefully and provide a structured diagnosis.

Your analysis must include:
1. **Primary Diagnosis**: The most likely disease, deficiency, or pest issue.
   - Common name (in English, as used in Indian agriculture)
   - Scientific name of the pathogen/cause (if applicable)
   - Type: one of "fungal", "bacterial", "viral", "deficiency", "pest", or "unknown"
   - Confidence level: 0-100 (be honest; if the image is unclear, lower the confidence)
   - Severity: one of "mild", "moderate", "severe", "critical"

2. **Differential Diagnoses**: Top 3 alternative possibilities, each with a name and confidence (0-100). These must be different from the primary diagnosis.

3. **Visible Symptoms**: List each distinct symptom you observe in the image (e.g., "yellow chlorotic spots on upper leaf surface", "brown necrotic lesions with concentric rings").

4. **Affected Plant Part**: Which part of the plant is affected (e.g., "leaves", "stem", "fruit", "roots", "whole plant").

IMPORTANT RULES:
- If the image does not appear to be a plant or crop, set confidence to 0 and type to "unknown".
- If the plant appears healthy, say so with the primary diagnosis name as "Healthy Plant" and confidence at your certainty level.
- Focus on diseases common in Indian agriculture: rice blast, wheat rust, late blight of potato/tomato, bacterial leaf blight, downy mildew, powdery mildew, citrus canker, etc.
- Be specific about symptoms - farmers need to verify against what they see in the field.
- Never hallucinate diseases that don't match the visible symptoms.

Return ONLY valid JSON in this exact format (no markdown, no explanation outside the JSON):
{
  "primaryDiagnosis": {
    "name": "string",
    "scientificName": "string",
    "type": "fungal|bacterial|viral|deficiency|pest|unknown",
    "confidence": number,
    "severity": "mild|moderate|severe|critical"
  },
  "differentialDiagnoses": [
    { "name": "string", "confidence": number }
  ],
  "visibleSymptoms": ["string"],
  "affectedPart": "string"
}`;

function buildPromptWithCrop(cropName: string): string {
  return `${VISION_PROMPT}

ADDITIONAL CONTEXT: The farmer has indicated this is a "${cropName}" crop. Narrow your analysis to diseases and deficiencies that commonly affect ${cropName} in Indian agricultural conditions. If the image clearly shows a different crop, note that discrepancy but still provide your best diagnosis.`;
}

function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function detectMediaType(
  buffer: Buffer
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  // Check magic bytes
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return 'image/png';
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  )
    return 'image/webp';
  // Default to jpeg
  return 'image/jpeg';
}

async function callClaudeVision(
  imageBuffer: Buffer,
  cropName?: string
): Promise<AIAnalysisResponse> {
  const client = getAnthropicClient();
  const mediaType = detectMediaType(imageBuffer);
  const base64Image = imageBuffer.toString('base64');
  const prompt = cropName ? buildPromptWithCrop(cropName) : VISION_PROMPT;

  logger.info('Calling Claude Vision API for plant disease analysis', {
    imageSize: imageBuffer.length,
    mediaType,
    cropName: cropName || 'not specified',
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude Vision API');
  }

  const rawText = textBlock.text.trim();
  logger.debug('Claude Vision raw response', { rawText });

  // Parse JSON - handle potential markdown code blocks
  let jsonStr = rawText;
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as AIAnalysisResponse;

  // Validate required fields
  if (
    !parsed.primaryDiagnosis ||
    typeof parsed.primaryDiagnosis.confidence !== 'number'
  ) {
    throw new Error('Invalid AI response structure: missing primaryDiagnosis');
  }

  return parsed;
}

function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function findMatchingDisease(
  diseaseName: string
): Promise<IDisease | null> {
  const normalized = normalizeForSearch(diseaseName);

  // Try exact match first
  let disease = await Disease.findOne({
    name: { $regex: new RegExp(`^${normalized.replace(/\s+/g, '\\s+')}$`, 'i') },
  });
  if (disease) return disease;

  // Try partial match - check if disease name contains our query or vice versa
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    const regexPattern = words.map((w) => `(?=.*${w})`).join('');
    disease = await Disease.findOne({
      name: { $regex: new RegExp(regexPattern, 'i') },
    });
    if (disease) return disease;
  }

  // Try text search as last resort
  try {
    const results = await Disease.find(
      { $text: { $search: diseaseName } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(1);
    if (results.length > 0) return results[0];
  } catch {
    logger.debug('Text search failed for disease', { diseaseName });
  }

  return null;
}

async function findMatchingDeficiency(
  diseaseName: string
): Promise<IDeficiency | null> {
  const normalized = normalizeForSearch(diseaseName);

  let deficiency = await Deficiency.findOne({
    name: { $regex: new RegExp(`^${normalized.replace(/\s+/g, '\\s+')}$`, 'i') },
  });
  if (deficiency) return deficiency;

  // Try partial match
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    const regexPattern = words.map((w) => `(?=.*${w})`).join('');
    deficiency = await Deficiency.findOne({
      name: { $regex: new RegExp(regexPattern, 'i') },
    });
    if (deficiency) return deficiency;
  }

  // Text search fallback
  try {
    const results = await Deficiency.find(
      { $text: { $search: diseaseName } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(1);
    if (results.length > 0) return results[0];
  } catch {
    logger.debug('Text search failed for deficiency', { diseaseName });
  }

  return null;
}

async function findRecommendedPesticides(
  diseaseId: string
): Promise<RecommendedPesticide[]> {
  const pesticides = await Pesticide.find({
    targetDiseases: diseaseId,
    banned: { $ne: true },
  }).limit(5);

  return pesticides.map((p) => ({
    name: p.name,
    tradeName: p.tradeName,
    dosage: {
      perLiter: p.dosage?.perLiter || 'Consult label',
      perAcre: p.dosage?.perAcre || 'Consult label',
    },
    safetyPrecautions: p.safetyPrecautions,
  }));
}

export async function analyzePlantImage(
  imageBuffer: Buffer,
  cropName?: string
): Promise<DiagnosisResult> {
  // Validate API key availability
  if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) {
    throw new Error(
      'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.'
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'Only Anthropic Claude Vision is currently supported. Please set ANTHROPIC_API_KEY.'
    );
  }

  // Step 1: Get AI analysis
  const aiAnalysis = await callClaudeVision(imageBuffer, cropName);
  logger.info('AI analysis complete', {
    diagnosis: aiAnalysis.primaryDiagnosis.name,
    confidence: aiAnalysis.primaryDiagnosis.confidence,
    type: aiAnalysis.primaryDiagnosis.type,
  });

  // Step 2: Cross-reference with our database
  let dbDisease: IDisease | null = null;
  let dbDeficiency: IDeficiency | null = null;
  let pesticides: RecommendedPesticide[] = [];

  if (aiAnalysis.primaryDiagnosis.type === 'deficiency') {
    dbDeficiency = await findMatchingDeficiency(
      aiAnalysis.primaryDiagnosis.name
    );
    if (dbDeficiency) {
      logger.info('Matched deficiency in database', {
        deficiency: dbDeficiency.name,
      });
    }
  } else {
    dbDisease = await findMatchingDisease(aiAnalysis.primaryDiagnosis.name);
    if (dbDisease) {
      logger.info('Matched disease in database', { disease: dbDisease.name });
      pesticides = await findRecommendedPesticides(
        String(dbDisease._id)
      );
    }
  }

  // Also try cross-checking: if disease not found, maybe it's a deficiency
  if (!dbDisease && !dbDeficiency && aiAnalysis.primaryDiagnosis.type !== 'deficiency') {
    dbDeficiency = await findMatchingDeficiency(
      aiAnalysis.primaryDiagnosis.name
    );
  }

  // Step 3: Build enriched result
  const treatments = buildTreatments(dbDisease, dbDeficiency);
  const sampleImages = buildSampleImages(dbDisease, dbDeficiency);
  const preventionTips = buildPreventionTips(dbDisease, dbDeficiency);

  const result: DiagnosisResult = {
    primaryDiagnosis: {
      name: dbDisease?.name || dbDeficiency?.name || aiAnalysis.primaryDiagnosis.name,
      nameHi: dbDisease?.nameHi || dbDeficiency?.nameHi || '',
      scientificName:
        dbDisease?.scientificName || aiAnalysis.primaryDiagnosis.scientificName || '',
      type: aiAnalysis.primaryDiagnosis.type,
      confidence: aiAnalysis.primaryDiagnosis.confidence,
      severity: aiAnalysis.primaryDiagnosis.severity,
    },
    differentialDiagnoses: aiAnalysis.differentialDiagnoses || [],
    visibleSymptoms: aiAnalysis.visibleSymptoms || [],
    affectedPart: aiAnalysis.affectedPart || 'unknown',
    treatments,
    recommendedPesticides: pesticides,
    preventionTips,
    sampleImages,
    disclaimer: DISCLAIMER,
  };

  return result;
}

function buildTreatments(
  disease: IDisease | null,
  deficiency: IDeficiency | null
): DiagnosisResult['treatments'] {
  if (disease?.treatments) {
    return {
      mechanical: disease.treatments.mechanical || [],
      physical: disease.treatments.physical || [],
      chemical: (disease.treatments.chemical || []).map(
        (c): ChemicalTreatmentInfo => ({
          name: c.name,
          dosage: c.dosage,
          applicationMethod: c.applicationMethod,
          frequency: c.frequency,
        })
      ),
      biological: disease.treatments.biological || [],
    };
  }

  if (deficiency?.treatments) {
    return {
      mechanical: [],
      physical: [],
      chemical: (deficiency.treatments.chemical || []).map(
        (c): ChemicalTreatmentInfo => ({
          name: c.name,
          dosage: c.dosage,
          applicationMethod: c.applicationMethod,
          frequency: 'As recommended by agricultural expert',
        })
      ),
      biological: deficiency.treatments.organic || [],
    };
  }

  return {
    mechanical: [],
    physical: [],
    chemical: [],
    biological: [],
  };
}

function buildSampleImages(
  disease: IDisease | null,
  deficiency: IDeficiency | null
): Array<{ url: string; caption: string }> {
  if (disease?.images?.length) {
    return disease.images.map((img) => ({
      url: img.url,
      caption: img.caption || `${disease.name} - ${img.stage} stage`,
    }));
  }

  if (deficiency?.images?.length) {
    return deficiency.images.map((img) => ({
      url: img.url,
      caption: img.caption || deficiency.name,
    }));
  }

  return [];
}

function buildPreventionTips(
  disease: IDisease | null,
  deficiency: IDeficiency | null
): string[] {
  if (disease?.preventionTips?.length) {
    return disease.preventionTips;
  }
  if (deficiency?.preventionTips?.length) {
    return deficiency.preventionTips;
  }
  return [];
}

export async function getDiseaseByCrop(
  cropName: string
): Promise<Array<{ name: string; nameHi: string; type: string; severity: string }>> {
  const crop = await Crop.findOne({
    name: { $regex: new RegExp(`^${cropName}$`, 'i') },
  });

  if (!crop) {
    logger.debug('Crop not found', { cropName });
    return [];
  }

  const diseases = await Disease.find({
    'affectedCrops.crop': crop._id,
  }).select('name nameHi type affectedCrops');

  return diseases.map((d) => {
    const cropEntry = d.affectedCrops.find(
      (ac) => ac.crop.toString() === String(crop._id)
    );
    return {
      name: d.name,
      nameHi: d.nameHi || '',
      type: d.type,
      severity: cropEntry?.severity || 'unknown',
    };
  });
}

export async function searchDiseases(
  query: string
): Promise<
  Array<{
    name: string;
    nameHi: string;
    type: string;
    scientificName: string;
    source: 'disease' | 'deficiency';
  }>
> {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedQuery, 'i');

  const [diseases, deficiencies] = await Promise.all([
    Disease.find({
      $or: [
        { name: regex },
        { nameHi: regex },
        { scientificName: regex },
        { symptoms: regex },
      ],
    })
      .select('name nameHi type scientificName')
      .limit(20),
    Deficiency.find({
      $or: [{ name: regex }, { nameHi: regex }, { symptoms: regex }],
    })
      .select('name nameHi nutrient')
      .limit(10),
  ]);

  const results: Array<{
    name: string;
    nameHi: string;
    type: string;
    scientificName: string;
    source: 'disease' | 'deficiency';
  }> = [];

  for (const d of diseases) {
    results.push({
      name: d.name,
      nameHi: d.nameHi || '',
      type: d.type,
      scientificName: d.scientificName || '',
      source: 'disease',
    });
  }

  for (const d of deficiencies) {
    results.push({
      name: d.name,
      nameHi: d.nameHi || '',
      type: d.nutrient,
      scientificName: '',
      source: 'deficiency',
    });
  }

  return results;
}
