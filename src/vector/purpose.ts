export type ProductionPurpose = 'general' | 'web' | 'print' | 'branding' | 'packaging' | 'signage' | 'cricut' | 'laser' | 'embroidery';

export interface PurposeProfile {
  id: ProductionPurpose;
  label: string;
  description: string;
  suffix: string;
  disclaimer?: string;
}

export interface PurposeAssessment {
  warnings: string[];
  notes: string[];
}

export const PURPOSES: PurposeProfile[] = [
  { id: 'general', label: 'General SVG', description: 'Balanced editable SVG for normal use.', suffix: '' },
  { id: 'web', label: 'Website', description: 'Prioritize compact, clean SVG output.', suffix: '-web' },
  { id: 'print', label: 'Printing', description: 'Preserve detail and geometry for artwork handoff.', suffix: '-print', disclaimer: 'Optimized for print handoff; not a printer-certified file.' },
  { id: 'branding', label: 'Branding / Logo', description: 'Prefer clean reusable logo geometry.', suffix: '-brand' },
  { id: 'packaging', label: 'Packaging', description: 'Preserve artwork detail for packaging workflows.', suffix: '-packaging', disclaimer: 'Final production checks should be completed by your printer or packaging vendor.' },
  { id: 'signage', label: 'Signage', description: 'Favor scalable geometry and manageable complexity.', suffix: '-signage' },
  { id: 'cricut', label: 'Cricut', description: 'Flag excessive complexity and tiny isolated shapes.', suffix: '-cricut', disclaimer: 'Optimized for Cricut-style workflows; verify cut settings in your cutting software.' },
  { id: 'laser', label: 'Laser Cutting', description: 'Flag open paths, tiny details and excessive complexity.', suffix: '-laser', disclaimer: 'Not machine-certified. Verify closed paths, scale, kerf and material settings before cutting.' },
  { id: 'embroidery', label: 'Embroidery', description: 'Flag excessive colors and tiny detail before digitizing.', suffix: '-embroidery', disclaimer: 'SVG is not an embroidery machine file. Professional digitizing is still required.' },
];

export function assessPurpose(svg: string, purpose: ProductionPurpose): PurposeAssessment {
  const warnings: string[] = [];
  const notes: string[] = [];
  const paths = (svg.match(/<path\b/gi) ?? []).length;
  const fills = new Set(Array.from(svg.matchAll(/\bfill=(?:"|')([^"']+)(?:"|')/gi), (match) => match[1].toLowerCase()));
  const openPathLikely = Array.from(svg.matchAll(/<path\b[^>]*\bd=(?:"|')([^"']+)(?:"|')[^>]*>/gi), (match) => match[1])
    .filter((d) => !/[zZ]\s*$/.test(d.trim())).length;

  if (purpose === 'web') {
    if (svg.length > 1_000_000) warnings.push('Large SVG for web use; further simplification may improve load time.');
    notes.push('Metadata and unnecessary export markup will be removed on download.');
  }

  if (purpose === 'laser' || purpose === 'cricut') {
    if (paths > 800) warnings.push('High path count may make cutting software slow or difficult to edit.');
    if (openPathLikely > 0) warnings.push(`${openPathLikely} path${openPathLikely === 1 ? '' : 's'} may be open; inspect before cutting.`);
    notes.push('Inspect overlaps, scale and tiny isolated details in your production software.');
  }

  if (purpose === 'embroidery') {
    if (fills.size > 12) warnings.push('Many colors detected; embroidery usually benefits from fewer thread-color regions.');
    if (paths > 500) warnings.push('High geometric detail may need simplification during embroidery digitizing.');
    notes.push('Use the SVG as artwork input for digitizing, not as a direct machine file.');
  }

  if (purpose === 'print' || purpose === 'packaging' || purpose === 'signage') {
    notes.push('Confirm final physical dimensions, color requirements and vendor specifications before production.');
  }

  if (purpose === 'branding') {
    if (paths > 700) warnings.push('This logo contains many paths; a simpler master logo may be easier to reuse consistently.');
    notes.push('Keep this SVG as a scalable brand master alongside your original source artwork.');
  }

  return { warnings, notes };
}
