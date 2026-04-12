export interface ChemicalTreatmentInfo {
  name: string;
  dosage: string;
  applicationMethod: string;
  frequency: string;
}

export interface RecommendedPesticide {
  name: string;
  tradeName: string[];
  dosage: { perLiter: string; perAcre: string };
  safetyPrecautions: string[];
}

export interface DiagnosisResult {
  primaryDiagnosis: {
    name: string;
    nameHi: string;
    scientificName: string;
    type: 'fungal' | 'bacterial' | 'viral' | 'deficiency' | 'pest' | 'unknown';
    confidence: number;
    severity: 'mild' | 'moderate' | 'severe' | 'critical' | 'healthy';
  };
  isHealthy: boolean;
  isUncertain?: boolean;
  isPlantImage: boolean;
  healthyMessage?: string;
  differentialDiagnoses: Array<{
    name: string;
    confidence: number;
  }>;
  visibleSymptoms: string[];
  affectedPart: string;
  treatments: {
    mechanical: string[];
    physical: string[];
    chemical: ChemicalTreatmentInfo[];
    biological: string[];
  };
  recommendedPesticides: RecommendedPesticide[];
  preventionTips: string[];
  farmerSummary?: string;
  sampleImages: Array<{ url: string; caption: string }>;
  disclaimer: string;
}

export interface AIAnalysisResponse {
  primaryDiagnosis: {
    name: string;
    scientificName: string;
    type: 'fungal' | 'bacterial' | 'viral' | 'deficiency' | 'pest' | 'unknown';
    confidence: number;
    severity: 'mild' | 'moderate' | 'severe' | 'critical';
  };
  differentialDiagnoses: Array<{
    name: string;
    confidence: number;
  }>;
  visibleSymptoms: string[];
  affectedPart: string;
}
