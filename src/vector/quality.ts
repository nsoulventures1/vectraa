import type { VectorQuality } from './types';

const SCRIPT_OR_EVENT = /<script\b|\son[a-z]+\s*=|javascript:/i;

export function inspectSvg(svg: string): VectorQuality {
  const warnings: string[] = [];
  const validSvg = /^\s*<svg\b[\s\S]*<\/svg>\s*$/i.test(svg) && !SCRIPT_OR_EVENT.test(svg);
  const paths = (svg.match(/<path\b/gi) ?? []).length;
  const commands = svg.match(/[MLHVCSQTAZmlhvcsqtaz]/g) ?? [];
  const nodesApprox = commands.length;
  const bytes = new TextEncoder().encode(svg).byteLength;

  if (!validSvg) warnings.push('SVG failed structural or active-content validation.');
  if (paths > 2000) warnings.push('Very high path count may make the file difficult to edit.');
  if (nodesApprox > 20000) warnings.push('Very high node count may indicate over-tracing.');
  if (bytes > 5_000_000) warnings.push('SVG is unusually large for browser use.');

  let score = validSvg ? 100 : 0;
  if (paths > 500) score -= Math.min(25, Math.round((paths - 500) / 100));
  if (nodesApprox > 5000) score -= Math.min(25, Math.round((nodesApprox - 5000) / 1000));
  if (bytes > 1_000_000) score -= Math.min(20, Math.round((bytes - 1_000_000) / 250_000));

  return { validSvg, paths, nodesApprox, bytes, score: Math.max(0, score), warnings };
}

export function assertSafeSvg(svg: string): string {
  const report = inspectSvg(svg);
  if (!report.validSvg) throw new Error('Vectraa rejected an unsafe or malformed SVG result.');
  return svg;
}
