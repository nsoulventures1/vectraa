import { PURPOSES, type ProductionPurpose } from './purpose';
import type { ImageAnalysis, VectorPreset } from './types';

export interface VectorRecommendation {
  preset: VectorPreset;
  purpose: ProductionPurpose;
  logoRescue: boolean;
  reasons: string[];
}

export function recommendVectorWorkflow(analysis: ImageAnalysis): VectorRecommendation {
  const reasons: string[] = [];
  const preset = analysis.likelyKind;
  let purpose: ProductionPurpose = 'general';

  if (preset === 'logo') {
    purpose = 'branding';
    reasons.push('Logo-like geometry detected, so reusable brand output is prioritized.');
  } else if (preset === 'line-art' || preset === 'signature') {
    purpose = 'cricut';
    reasons.push('Sparse line artwork detected; cutting-style inspection can expose open or overly complex paths.');
  } else if (preset === 'illustration') {
    purpose = 'print';
    reasons.push('Illustration-like artwork detected, so detail-preserving print handoff is a useful default.');
  } else {
    reasons.push('High-detail artwork detected; general SVG keeps the workflow neutral until you choose a destination.');
  }

  const logoRescue = preset === 'logo' && !analysis.hasAlpha && analysis.signals.lightBackground > 0.35;
  if (logoRescue) reasons.push('A light raster background was detected, so Logo Rescue can improve tracing before vectorization.');
  if (analysis.megapixels > 12) reasons.push('Large source detected; Vectraa will keep processing local but vectorization may take longer.');

  return { preset, purpose, logoRescue, reasons };
}

export function purposeLabel(purpose: ProductionPurpose): string {
  return PURPOSES.find((item) => item.id === purpose)?.label ?? 'General SVG';
}
