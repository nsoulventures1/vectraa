import { useEffect, useMemo, useRef, useState } from 'react';
import { useObjectUrl } from './hooks/useObjectUrl';
import { analyzeImage } from './vector/analyzeImage';
import { assessVectorResult } from './vector/benchmark';
import { browserSupportMessage, detectBrowserCapabilities } from './vector/capabilities';
import { downloadSvg, svgFilename } from './vector/exportSvg';
import type { FidelityResult } from './vector/fidelity';
import { preprocessLogoForRescue, recommendedLogoRescueOptions } from './vector/logoRescue';
import { vectorizeBestOf } from './vector/multipass';
import { NeplexVectorEngine } from './vector/NeplexVectorEngine';
import { DEFAULT_OPTIONS } from './vector/presets';
import { assessPurpose, PURPOSES, type ProductionPurpose } from './vector/purpose';
import { purposeLabel, recommendVectorWorkflow, type VectorRecommendation } from './vector/recommendation';
import { RunGuard } from './vector/runGuard';
import type { ImageAnalysis, VectorPreset, VectorResult } from './vector/types';
import { addConversionHistoryItem, clearConversionHistory, createHistoryItem, readConversionHistory, type ConversionHistoryItem } from './workspace/history';
import { WorkspacePanel } from './workspace/WorkspacePanel';

const engine = new NeplexVectorEngine();
const PRESETS: Array<{ id: VectorPreset; label: string }> = [
  { id: 'logo', label: 'Logo' }, { id: 'illustration', label: 'Illustration' }, { id: 'line-art', label: 'Line art' }, { id: 'signature', label: 'Signature' }, { id: 'high-detail', label: 'High detail' },
];

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(new RunGuard());
  const conversionRun = useRef(new RunGuard());
  const capabilities = useMemo(() => detectBrowserCapabilities(), []);
  const supportError = browserSupportMessage(capabilities);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<VectorPreset>('logo');
  const [purpose, setPurpose] = useState<ProductionPurpose>('general');
  const [recommendation, setRecommendation] = useState<VectorRecommendation | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [logoRescue, setLogoRescue] = useState(false);
  const [result, setResult] = useState<VectorResult | null>(null);
  const [fidelity, setFidelity] = useState<FidelityResult | null>(null);
  const [selectedPass, setSelectedPass] = useState<string | null>(null);
  const [passCount, setPassCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(50);
  const [history, setHistory] = useState<ConversionHistoryItem[]>(() => readConversionHistory());
  const sourceUrl = useObjectUrl(file);
  const svgBlob = useMemo(() => result ? new Blob([result.svg], { type: 'image/svg+xml' }) : null, [result]);
  const svgUrl = useObjectUrl(svgBlob);
  const benchmark = useMemo(() => result ? assessVectorResult(result) : null, [result]);
  const purposeProfile = PURPOSES.find((item) => item.id === purpose) ?? PURPOSES[0];
  const purposeAssessment = useMemo(() => result ? assessPurpose(result.svg, purpose) : null, [result, purpose]);

  useEffect(() => {
    if (!capabilities.supported) return;
    function onPaste(event: ClipboardEvent) {
      const image = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!image) return;
      event.preventDefault(); void choose(image);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [capabilities.supported]);

  async function choose(next?: File) {
    if (!next || !capabilities.supported) return;
    const run = analysisRun.current.next();
    conversionRun.current.invalidate();
    setFile(next); setAnalysis(null); setRecommendation(null); setAnalyzing(true); setRunning(false); setResult(null); setFidelity(null); setSelectedPass(null); setPassCount(0); setLogoRescue(false); setPurpose('general'); setError(null); setZoom(1); setCompare(50);
    try {
      const nextAnalysis = await analyzeImage(next);
      if (!analysisRun.current.isCurrent(run)) return;
      const nextRecommendation = recommendVectorWorkflow(nextAnalysis);
      setAnalysis(nextAnalysis); setRecommendation(nextRecommendation); setPreset(nextRecommendation.preset); setPurpose(nextRecommendation.purpose); setLogoRescue(nextRecommendation.logoRescue);
    } catch (err) { if (analysisRun.current.isCurrent(run)) setError(err instanceof Error ? err.message : 'Image analysis failed. Try another image or refresh the page.'); }
    finally { if (analysisRun.current.isCurrent(run)) setAnalyzing(false); }
  }

  async function vectorize() {
    if (!file || running || !capabilities.supported) return;
    const run = conversionRun.current.next();
    const sourceFile = file;
    setRunning(true); setError(null); setFidelity(null); setSelectedPass(null);
    try {
      const processingFile = logoRescue && analysis ? await preprocessLogoForRescue(sourceFile, recommendedLogoRescueOptions(analysis)) : sourceFile;
      if (!conversionRun.current.isCurrent(run)) return;
      const base = logoRescue ? { ...DEFAULT_OPTIONS.logo, transparentBackground: true } : DEFAULT_OPTIONS[preset];
      const multi = await vectorizeBestOf(engine, processingFile, base, 3);
      if (!conversionRun.current.isCurrent(run)) return;
      setResult(multi.best.result); setFidelity(multi.best.fidelity); setSelectedPass(multi.best.id); setPassCount(multi.candidates.length);
      setHistory(addConversionHistoryItem(createHistoryItem({
        fileName: sourceFile.name,
        preset,
        purpose,
        qualityScore: multi.best.result.quality.score,
        fidelityScore: multi.best.fidelity.score,
        paths: multi.best.result.quality.paths,
        bytes: multi.best.result.quality.bytes,
      })));
    } catch (err) {
      if (conversionRun.current.isCurrent(run)) { setResult(null); setError(err instanceof Error ? `${err.message} Try a smaller or simpler image, or refresh and retry.` : 'Vectorization failed. Try a smaller or simpler image, or refresh and retry.'); }
    } finally { if (conversionRun.current.isCurrent(run)) setRunning(false); }
  }

  function download() {
    if (!result) return;
    downloadSvg(result.svg, svgFilename(file?.name, `${logoRescue ? '-rescued' : ''}${purposeProfile.suffix}`));
  }

  function clearHistory() {
    clearConversionHistory();
    setHistory([]);
  }

  return <main>
    <header className="nav"><a className="brand" href="/">Vectraa<span>.</span></a><nav className="navLinks"><a href="#workspace">Workspace</a><a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a></nav><div className="privacy">Private by design · processed on your device</div></header>
    <section className="hero"><p className="eyebrow">FREE AI VECTOR STUDIO</p><h1>Anything <span>→</span> Vector.</h1><p className="lead">Turn JPG, PNG and WebP artwork into clean, scalable SVG — directly in your browser.</p><div className="modeRow"><button className="mode active">Upload an image</button><button className="mode" disabled>Describe what you want <b>Soon</b></button></div></section>
    {supportError && <div role="alert" className="error">{supportError}</div>}
    <section className="studio"><input ref={inputRef} hidden disabled={!capabilities.supported} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void choose(e.target.files?.[0]); e.currentTarget.value = ''; }} /><div className="source card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (capabilities.supported) void choose(e.dataTransfer.files[0]); }}><div className="cardHead"><span>ORIGINAL</span>{file && <button onClick={() => inputRef.current?.click()}>Replace</button>}</div>{sourceUrl ? <div className="canvas checker"><img style={{ transform: `scale(${zoom})` }} src={sourceUrl} alt="Uploaded original" /></div> : <button className="drop" disabled={!capabilities.supported} onClick={() => inputRef.current?.click()}><span className="uploadIcon">↑</span><strong>{capabilities.supported ? 'Drop your image here' : 'Browser upgrade required'}</strong><small>{capabilities.supported ? 'click to browse or paste from clipboard · JPG, PNG, WebP · up to 20 MB' : 'Use a current Chrome, Edge, Firefox or Safari browser to run local conversion.'}</small></button>}</div><div className="result card"><div className="cardHead"><span>VECTOR</span>{result && <span className="score">Quality {result.quality.score}/100</span>}</div>{svgUrl ? <div className="canvas checker"><img style={{ transform: `scale(${zoom})` }} src={svgUrl} alt="Vectorized result" /></div> : <div className="empty"><span>◇</span><strong>Your vector will appear here</strong><small>Real SVG paths — not a raster image wrapped in an SVG file.</small></div>}</div></section>
    {(sourceUrl || svgUrl) && <section className="inspectionBar"><span>Inspect</span><div className="zoomButtons">{[1, 2, 4].map((level) => <button key={level} className={zoom === level ? 'selected' : ''} onClick={() => setZoom(level)}>{level}×</button>)}</div>{result && <span className="hint">Use 4× to inspect edge smoothness and tracing detail.</span>}</section>}
    {result && sourceUrl && svgUrl && <section className="comparison card"><div className="cardHead"><span>BEFORE / VECTOR COMPARISON</span><span className="score">{compare}% vector reveal</span></div><div className="compareCanvas checker"><img src={sourceUrl} alt="Original comparison" /><div className="vectorReveal" style={{ width: `${compare}%` }}><img src={svgUrl} alt="Vector comparison" /></div><div className="compareLine" style={{ left: `${compare}%` }} /></div><label className="compareControl"><span>Original</span><input aria-label="Compare original and vector" type="range" min="0" max="100" value={compare} onChange={(e) => setCompare(Number(e.target.value))} /><span>Vector</span></label></section>}
    {file && <section className="analysisBar" aria-live="polite">{analyzing ? <span className="analysisLoading">Inspecting artwork locally…</span> : analysis && <><span className="analysisBadge">Recommended: <b>{PRESETS.find((item) => item.id === analysis.likelyKind)?.label}</b> · {analysis.confidence}% confidence</span><span>{analysis.width}×{analysis.height} · {analysis.megapixels.toFixed(1)} MP{analysis.hasAlpha ? ' · transparency detected' : ''}</span>{analysis.warnings[0] && <span className="analysisWarning">{analysis.warnings[0]}</span>}</>}</section>}
    {recommendation && <section className="analysisBar"><span className="analysisBadge"><b>Smart setup applied:</b> {PRESETS.find((item) => item.id === recommendation.preset)?.label} tracing · {purposeLabel(recommendation.purpose)}{recommendation.logoRescue ? ' · Logo Rescue' : ''}</span>{recommendation.reasons.map((reason) => <span key={reason}>{reason}</span>)}</section>}
    <section className="controls"><div><label>Optimize tracing for {analysis ? '· smart setup applied, fully adjustable' : ''}</label><div className="pills">{PRESETS.map((item) => <button key={item.id} className={preset === item.id && !logoRescue ? 'selected' : ''} onClick={() => { setPreset(item.id); setLogoRescue(false); }}>{item.label}{analysis?.likelyKind === item.id ? ' · Recommended' : ''}</button>)}{analysis?.likelyKind === 'logo' && <button className={logoRescue ? 'selected' : ''} onClick={() => setLogoRescue((value) => !value)}>Logo Rescue · clean poor JPG</button>}</div></div><div className="actions"><button className="primary" disabled={!file || running || analyzing || !capabilities.supported} onClick={vectorize}>{running ? 'Finding best vector…' : analyzing ? 'Analyzing…' : logoRescue ? 'Rescue & Vectorize' : 'Make Best Vector'}</button><button className="secondary" disabled={!result} onClick={download}>Download SVG</button></div></section>
    {logoRescue && <div className="analysisBar"><span className="analysisBadge"><b>Logo Rescue on</b> · local denoise, contrast cleanup, color simplification and near-white background removal before tracing</span></div>}
    {error && <div role="alert" className="error">{error}</div>}
    {result && benchmark && <section className="metrics">{fidelity && <span><b>{fidelity.score}/100</b> visual fidelity</span>}<span><b>{benchmark.overallScore}/100</b> vector health</span>{selectedPass && <span><b>{selectedPass}</b> winning pass · best of {passCount}</span>}<span><b>{result.quality.paths}</b> paths</span><span><b>{result.quality.nodesApprox}</b> approx. nodes</span><span><b>{Math.round(result.quality.bytes / 1024)}</b> KB SVG</span></section>}
    {result && <section className="purposePanel"><div className="purposeIntro"><span className="sectionKicker">PREPARE FOR USE</span><h2>What will you use this vector for?</h2><p>Vectraa checks the SVG for workflow-specific risks. These presets guide preparation; they do not replace vendor or machine-specific production checks.</p></div><div className="purposeGrid">{PURPOSES.map((item) => <button key={item.id} className={purpose === item.id ? 'purposeCard selected' : 'purposeCard'} onClick={() => setPurpose(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}</div><div className="purposeReport"><div><strong>{purposeProfile.label}</strong><span>{purposeProfile.description}</span></div>{purposeAssessment?.warnings.map((warning) => <p className="purposeWarning" key={warning}>⚠ {warning}</p>)}{purposeAssessment?.notes.map((note) => <p key={note}>✓ {note}</p>)}{purposeProfile.disclaimer && <p className="purposeDisclaimer">{purposeProfile.disclaimer}</p>}<button className="primary" onClick={download}>Download {purposeProfile.label} SVG</button></div></section>}
    <WorkspacePanel items={history} onClear={clearHistory} />
    <section className="trust"><div><b>01</b><strong>Local processing</strong><p>Your basic conversion runs on your device.</p></div><div><b>02</b><strong>Smart adaptive tracing</strong><p>Vectraa spends extra passes only when the quality data says they are useful.</p></div><div><b>03</b><strong>No account. No watermark.</strong><p>Convert and download without creating an account.</p></div></section>
    <section id="how-it-works" className="contentSection"><span className="sectionKicker">HOW IT WORKS</span><h2>From raster image to genuine SVG paths.</h2><div className="contentGrid"><article><b>1</b><h3>Analyze</h3><p>Vectraa inspects the image locally and recommends a tracing workflow based on detail, colors, transparency and edge structure.</p></article><article><b>2</b><h3>Trace intelligently</h3><p>Adaptive passes balance visual similarity against clean, editable vector structure instead of blindly returning the first trace.</p></article><article><b>3</b><h3>Inspect and export</h3><p>Compare the original with the SVG, review vector health, choose the intended use, and download a clean SVG file.</p></article></div></section>
    <section id="privacy" className="contentSection privacySection"><span className="sectionKicker">PRIVACY</span><h2>Your artwork stays on your device for basic conversion.</h2><p className="sectionLead">Vectraa’s core JPG, PNG and WebP conversion is designed to run in your browser. The basic converter does not require an account and does not upload normal conversion artwork to a Vectraa image-storage service.</p><div className="privacyFacts"><span>No account required</span><span>No watermark</span><span>No basic-conversion image storage</span><span>SVG output is sanitized before use</span></div></section>
    <section id="faq" className="contentSection"><span className="sectionKicker">FAQ</span><h2>Questions before you convert.</h2><div className="faqGrid"><details><summary>Is the downloaded file a real vector?</summary><p>Yes. Vectraa generates SVG geometry such as paths and shapes, not a raster image hidden inside an SVG wrapper.</p></details><details><summary>Does Vectraa upload my image?</summary><p>The basic raster-to-vector workflow is designed for local browser processing. Future AI generation features may require a separate provider and will be clearly disclosed before use.</p></details><details><summary>Can every photograph become a clean logo-style vector?</summary><p>No. Highly detailed photographs can require thousands of shapes. Vectraa measures complexity and warns when an input is better treated as high-detail artwork.</p></details><details><summary>Is a laser or Cricut export machine-ready?</summary><p>No. Vectraa checks common vector risks, but final scale, open paths, kerf, material settings and machine requirements must be verified in production software.</p></details><details><summary>What is Logo Rescue?</summary><p>Logo Rescue is optional preprocessing for poor raster logos. It can reduce noise, simplify colors and remove near-white backgrounds before tracing.</p></details><details><summary>Is Vectraa free?</summary><p>The core converter is being built as a genuinely useful free service with no watermark. Premium usage or future AI-generation features may be introduced separately later.</p></details></div></section>
    <footer className="footer"><a className="brand" href="/">Vectraa<span>.</span></a><p>Anything → Vector. Private, local-first SVG conversion.</p><nav><a href="#workspace">Workspace</a><a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a></nav></footer>
  </main>;
}
