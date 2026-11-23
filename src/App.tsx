import { useEffect, useMemo, useRef, useState } from 'react';
import { useObjectUrl } from './hooks/useObjectUrl';
import { analyzeImage } from './vector/analyzeImage';
import { assessVectorResult } from './vector/benchmark';
import { browserSupportMessage, detectBrowserCapabilities } from './vector/capabilities';
import { downloadSvg, svgFilename } from './vector/exportSvg';
import type { FidelityResult } from './vector/fidelity';
import { preprocessLogoForRescue, recommendedLogoRescueOptions } from './vector/logoRescue';
import { vectorizeBestOf } from './vector/multipass';
import { JsVectorEngine } from './vector/JsVectorEngine';
import { DEFAULT_OPTIONS } from './vector/presets';
import { assessPurpose, PURPOSES, type ProductionPurpose } from './vector/purpose';
import { purposeLabel, recommendVectorWorkflow, type VectorRecommendation } from './vector/recommendation';
import { RunGuard } from './vector/runGuard';
import type { ImageAnalysis, VectorPreset, VectorResult } from './vector/types';
import { addConversionHistoryItem, clearConversionHistory, createHistoryItem, readConversionHistory, type ConversionHistoryItem } from './workspace/history';
import { WorkspacePanel } from './workspace/WorkspacePanel';
import './marketing.css';
import { trackGrowthEvent } from './marketing/analytics';
import { HOME_FAQS } from './marketing/faq';
import { currentGuidePage, GUIDE_PAGES, type GuidePage } from './marketing/guides';
import { InfoPageView, NotFoundPage } from './marketing/InfoPages';
import { currentInfoPage } from './marketing/info';
import { currentLandingPage, inlineLinkSegments, LANDING_PAGES } from './marketing/landing';
import { applyPageMetadata } from './marketing/metadata';
import { FaqList, SiteFooter } from './marketing/SiteChrome';

const engine = new JsVectorEngine();
const ENGINE_BUILD = '2026.11.22.1-shapes';
const PRESETS: Array<{ id: VectorPreset; label: string }> = [
  { id: 'logo', label: 'Logo' }, { id: 'illustration', label: 'Illustration' }, { id: 'line-art', label: 'Line art' }, { id: 'signature', label: 'Signature' }, { id: 'high-detail', label: 'High detail' },
];

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(new RunGuard());
  const conversionRun = useRef(new RunGuard());
  const capabilities = useMemo(() => detectBrowserCapabilities(), []);
  const pathname = useMemo(() => {
    const value = window.location.pathname;
    return value.length > 1 ? value.replace(/\/$/, '') : value;
  }, []);
  const landingPage = useMemo(() => currentLandingPage(pathname), [pathname]);
  const guidePage = useMemo(() => currentGuidePage(pathname), [pathname]);
  const infoPage = useMemo(() => currentInfoPage(pathname), [pathname]);
  const notFound = pathname !== '/' && !landingPage && !guidePage && !infoPage;
  const supportError = browserSupportMessage(capabilities);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<VectorPreset>('logo');
  const [detail, setDetail] = useState(DEFAULT_OPTIONS.logo.detail);
  const [smoothing, setSmoothing] = useState(DEFAULT_OPTIONS.logo.smoothing);
  const [colors, setColors] = useState(DEFAULT_OPTIONS.logo.colors);
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

  useEffect(() => applyPageMetadata({ guide: guidePage, landing: landingPage, info: infoPage, notFound }), [guidePage, landingPage, infoPage, notFound]);

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
    trackGrowthEvent('image_selected', { format: next.type, source_page: landingPage?.path ?? '/' });
    try {
      const nextAnalysis = await analyzeImage(next);
      if (!analysisRun.current.isCurrent(run)) return;
      const nextRecommendation = recommendVectorWorkflow(nextAnalysis);
      const defaults = DEFAULT_OPTIONS[nextRecommendation.preset];
      setAnalysis(nextAnalysis); setRecommendation(nextRecommendation); setPreset(nextRecommendation.preset); setDetail(defaults.detail); setSmoothing(defaults.smoothing); setColors(defaults.colors); setPurpose(nextRecommendation.purpose); setLogoRescue(nextRecommendation.logoRescue);
      trackGrowthEvent('analysis_completed', { preset: nextRecommendation.preset, confidence: nextAnalysis.confidence, logo_rescue: nextRecommendation.logoRescue });
    } catch (err) { if (analysisRun.current.isCurrent(run)) { setError(err instanceof Error ? err.message : 'Image analysis failed. Try another image or refresh the page.'); trackGrowthEvent('conversion_failed', { phase: 'analysis' }); } }
    finally { if (analysisRun.current.isCurrent(run)) setAnalyzing(false); }
  }

  async function vectorize() {
    if (!file || running || !capabilities.supported) return;
    const run = conversionRun.current.next();
    const sourceFile = file;
    setRunning(true); setError(null); setFidelity(null); setSelectedPass(null);
    trackGrowthEvent('conversion_started', { preset, purpose, logo_rescue: logoRescue });
    try {
      const processingFile = logoRescue && analysis ? await preprocessLogoForRescue(sourceFile, recommendedLogoRescueOptions(analysis)) : sourceFile;
      if (!conversionRun.current.isCurrent(run)) return;
      const activePreset = logoRescue ? 'logo' : preset;
      const base = { ...DEFAULT_OPTIONS[activePreset], preset: activePreset, detail, smoothing, colors, transparentBackground: logoRescue ? true : DEFAULT_OPTIONS[activePreset].transparentBackground };
      const multi = await vectorizeBestOf(engine, processingFile, base, 3);
      if (!conversionRun.current.isCurrent(run)) return;
      setResult(multi.best.result); setFidelity(multi.best.fidelity); setSelectedPass(multi.best.id); setPassCount(multi.candidates.length);
      trackGrowthEvent('conversion_completed', { preset, purpose, quality: multi.best.result.quality.score, fidelity: multi.best.fidelity?.score, paths: multi.best.result.quality.paths });
      setHistory(addConversionHistoryItem(createHistoryItem({ fileName: sourceFile.name, preset, purpose, qualityScore: multi.best.result.quality.score, fidelityScore: multi.best.fidelity?.score, paths: multi.best.result.quality.paths, bytes: multi.best.result.quality.bytes })));
    } catch (err) {
      if (conversionRun.current.isCurrent(run)) { setResult(null); setError(err instanceof Error ? `${err.message} Try a smaller or simpler image, or refresh and retry.` : 'Vectorization failed. Try a smaller or simpler image, or refresh and retry.'); trackGrowthEvent('conversion_failed', { phase: 'vectorization', preset }); }
    } finally { if (conversionRun.current.isCurrent(run)) setRunning(false); }
  }

  function download() { if (result) { downloadSvg(result.svg, svgFilename(file?.name, `${logoRescue ? '-rescued' : ''}${purposeProfile.suffix}`)); trackGrowthEvent('svg_downloaded', { preset, purpose, quality: result.quality.score }); } }
  function clearHistory() { clearConversionHistory(); setHistory([]); }
  async function shareSite() {
    const shareData = { title: 'Vectraa — Free private image to SVG converter', text: 'Convert JPG, PNG and WebP images into real SVG paths in your browser.', url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(window.location.href);
      trackGrowthEvent('site_shared', { source_page: landingPage?.path ?? '/' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Could not share this page. Copy the address from your browser and try again.');
    }
  }

  if (notFound) return <NotFoundPage />;
  if (infoPage) return <InfoPageView page={infoPage} />;
  if (guidePage) return <GuideView page={guidePage} />;

  return <main>
    <header className="nav"><a className="brand" href="/">Vectraa<span>.</span></a><nav className="navLinks"><a href="#workspace">Workspace</a><a href="#how-it-works">How it works</a><a href="/about">About</a><a href="/privacy">Privacy</a><a href="#faq">FAQ</a></nav><div className="privacy">Private by design · processed on your device</div></header>
    <section className="hero"><p className="eyebrow">{landingPage?.eyebrow ?? 'FREE PRIVATE VECTOR STUDIO'}</p><h1>{landingPage ? landingPage.heading : <>Anything <span>→</span> Vector.</>}</h1><p className="lead">{landingPage?.lead ?? 'Turn JPG, PNG and WebP artwork into clean, scalable SVG — directly in your browser.'}</p>{landingPage?.links && <HeroLinks source={landingPage.links} />}<div className="modeRow"><button className="mode active" onClick={() => inputRef.current?.click()}>Upload an image</button><button className="mode" disabled>Describe what you want <b>Soon</b></button></div></section>
    {supportError && <div role="alert" className="error">{supportError}</div>}
    <section className="studio"><input ref={inputRef} hidden disabled={!capabilities.supported} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void choose(e.target.files?.[0]); e.currentTarget.value = ''; }} /><div className="source card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (capabilities.supported) void choose(e.dataTransfer.files[0]); }}><div className="cardHead"><span>ORIGINAL</span>{file && <button onClick={() => inputRef.current?.click()}>Replace</button>}</div>{sourceUrl ? <div className="canvas checker"><img style={{ transform: `scale(${zoom})` }} src={sourceUrl} alt="Uploaded original" /></div> : <button className="drop" disabled={!capabilities.supported} onClick={() => inputRef.current?.click()}><span className="uploadIcon">↑</span><strong>{capabilities.supported ? 'Drop your image here' : 'Browser upgrade required'}</strong><small>{capabilities.supported ? 'click to browse or paste from clipboard · JPG, PNG, WebP · up to 20 MB' : 'Use a current Chrome, Edge, Firefox or Safari browser to run local conversion.'}</small></button>}</div><div className="result card"><div className="cardHead"><span>VECTOR</span>{result && <span className="score">Quality {result.quality.score}/100</span>}</div>{svgUrl ? <div className="canvas checker"><img style={{ transform: `scale(${zoom})` }} src={svgUrl} alt="Vectorized result" /></div> : <div className="empty"><span>◇</span><strong>Your vector will appear here</strong><small>Real SVG paths — not a raster image wrapped in an SVG file.</small></div>}</div></section>
    {(sourceUrl || svgUrl) && <section className="inspectionBar"><span>Inspect</span><div className="zoomButtons">{[1, 2, 4].map((level) => <button key={level} className={zoom === level ? 'selected' : ''} onClick={() => setZoom(level)}>{level}×</button>)}</div>{result && <span className="hint">Use 4× to inspect edge smoothness and tracing detail.</span>}</section>}
    {result && sourceUrl && svgUrl && <section className="comparison card"><div className="cardHead"><span>BEFORE / VECTOR COMPARISON</span><span className="score">{compare}% vector reveal</span></div><div className="compareCanvas checker"><img src={sourceUrl} alt="Original comparison" /><div className="vectorReveal" style={{ width: `${compare}%` }}><img src={svgUrl} alt="Vector comparison" /></div><div className="compareLine" style={{ left: `${compare}%` }} /></div><label className="compareControl"><span>Original</span><input aria-label="Compare original and vector" type="range" min="0" max="100" value={compare} onChange={(e) => setCompare(Number(e.target.value))} /><span>Vector</span></label></section>}
    {file && <section className="analysisBar" aria-live="polite" data-analysis={analysis ? JSON.stringify(analysis.signals) : undefined}>{analyzing ? <span className="analysisLoading">Inspecting artwork locally…</span> : analysis && <><span className="analysisBadge">Recommended: <b>{PRESETS.find((item) => item.id === analysis.likelyKind)?.label}</b> · {analysis.confidence}% confidence</span><span>{analysis.width}×{analysis.height} · {analysis.megapixels.toFixed(1)} MP{analysis.hasAlpha ? ' · transparency detected' : ''}</span>{analysis.warnings[0] && <span className="analysisWarning">{analysis.warnings[0]}</span>}</>}</section>}
    {recommendation && <section className="analysisBar"><span className="analysisBadge"><b>Smart setup applied:</b> {PRESETS.find((item) => item.id === recommendation.preset)?.label} tracing · {purposeLabel(recommendation.purpose)}{recommendation.logoRescue ? ' · Logo Rescue' : ''}</span>{recommendation.reasons.map((reason) => <span key={reason}>{reason}</span>)}</section>}
    <section className="controls"><div><label>Optimize tracing for {analysis ? '· smart setup applied, adjust anytime' : ''}</label><div className="pills">{PRESETS.map((item) => <button key={item.id} className={preset === item.id && !logoRescue ? 'selected' : ''} onClick={() => { const next = DEFAULT_OPTIONS[item.id]; setPreset(item.id); setLogoRescue(false); setDetail(next.detail); setSmoothing(next.smoothing); setColors(next.colors); }}>{item.label}{analysis?.likelyKind === item.id ? ' · Recommended' : ''}</button>)}{analysis?.likelyKind === 'logo' && <button className={logoRescue ? 'selected' : ''} onClick={() => setLogoRescue((value) => !value)}>Logo Rescue · clean poor JPG</button>}</div><div className="tuning"><label>Colours <b>{colors}</b><input aria-label="Colour count" type="range" min={2} max={32} value={colors} onChange={(event) => setColors(Number(event.target.value))} /></label><div className="swatches" aria-label={result ? 'Colours in this SVG' : 'Detected colours'}>{(result ? svgPalette(result.svg) : (analysis?.palette ?? []).slice(0, colors)).map((swatch) => <i key={swatch} style={{ background: swatch }} title={swatch} />)}</div><label>Detail <b>{detail}</b><input aria-label="Detail" type="range" min={0} max={100} value={detail} onChange={(event) => setDetail(Number(event.target.value))} /></label><label>Smoothing <b>{smoothing}</b><input aria-label="Smoothing" type="range" min={0} max={100} value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))} /></label></div></div><div className="actions"><button className="primary" disabled={!file || running || analyzing || !capabilities.supported} onClick={vectorize}>{running ? 'Finding best vector…' : analyzing ? 'Analyzing…' : logoRescue ? 'Rescue & Vectorize' : 'Make Best Vector'}</button><button className="secondary" disabled={!result} onClick={download}>Download SVG</button></div></section>
    {logoRescue && <div className="analysisBar"><span className="analysisBadge"><b>Logo Rescue on</b> · local denoise, contrast cleanup, color simplification and near-white background removal before tracing</span></div>}
    {error && <div role="alert" className="error">{error}</div>}
    {result && benchmark && <section className="metrics">{fidelity && <span><b>{fidelity.score}/100</b> visual fidelity</span>}<span><b>{benchmark.overallScore}/100</b> vector health</span>{selectedPass && <span><b>{selectedPass}</b> winning pass · best of {passCount}</span>}<span><b>{result.quality.paths}</b> paths</span><span><b>{result.quality.nodesApprox}</b> approx. nodes</span><span><b>{Math.round(result.quality.bytes / 1024)}</b> KB SVG</span><span><b>{ENGINE_BUILD}</b> engine build</span></section>}
    {result && <section className="purposePanel"><div className="purposeIntro"><span className="sectionKicker">PREPARE FOR USE</span><h2>What will you use this vector for?</h2><p>Vectraa checks the SVG for workflow-specific risks. These presets guide preparation; they do not replace vendor or machine-specific production checks.</p></div><div className="purposeGrid">{PURPOSES.map((item) => <button key={item.id} className={purpose === item.id ? 'purposeCard selected' : 'purposeCard'} onClick={() => setPurpose(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}</div><div className="purposeReport"><div><strong>{purposeProfile.label}</strong><span>{purposeProfile.description}</span></div>{purposeAssessment?.warnings.map((warning) => <p className="purposeWarning" key={warning}>⚠ {warning}</p>)}{purposeAssessment?.notes.map((note) => <p key={note}>✓ {note}</p>)}{purposeProfile.disclaimer && <p className="purposeDisclaimer">{purposeProfile.disclaimer}</p>}<button className="primary" onClick={download}>Download {purposeProfile.label} SVG</button></div></section>}
    <WorkspacePanel items={history} onClear={clearHistory} />
    <section className="trust"><div><b>01</b><strong>Local processing</strong><p>Your basic conversion runs on your device.</p></div><div><b>02</b><strong>Smart adaptive tracing</strong><p>Vectraa spends extra passes only when the quality data says they are useful.</p></div><div><b>03</b><strong>No account. No watermark.</strong><p>Convert and download without creating an account.</p></div></section>
    <section id="how-it-works" className="contentSection"><span className="sectionKicker">HOW IT WORKS</span><h2>From raster image to genuine SVG paths.</h2><div className="contentGrid"><article><b>1</b><h3>Analyze</h3><p>Vectraa inspects the image locally and recommends a tracing workflow based on detail, colors, transparency and edge structure.</p></article><article><b>2</b><h3>Trace intelligently</h3><p>Adaptive passes balance visual similarity against clean, editable vector structure instead of blindly returning the first trace.</p></article><article><b>3</b><h3>Inspect and export</h3><p>Compare the original with the SVG, review vector health, choose the intended use, and download a clean SVG file.</p></article></div></section>
    <section id="privacy" className="contentSection privacySection"><span className="sectionKicker">PRIVACY</span><h2>Your artwork stays in your browser.</h2><p className="sectionLead">Vectraa traces JPG, PNG and WebP files on your device. The image and the SVG are not uploaded. <a href="/privacy">Read the privacy policy</a>.</p><div className="privacyFacts"><span>No account required</span><span>No watermark</span><span>Images never leave the browser</span></div></section>
    <section id="faq" className="contentSection"><span className="sectionKicker">FAQ</span><h2>Useful answers before you export.</h2><FaqList items={HOME_FAQS} /></section>
    {landingPage && <section className="contentSection landingContent"><span className="sectionKicker">BUILT FOR THIS WORKFLOW</span><h2>{landingPage.heading}</h2><p className="sectionLead">{landingPage.intro}</p><div className="contentGrid">{landingPage.benefits.map((benefit, index) => <article key={benefit.title}><b>0{index + 1}</b><h3>{benefit.title}</h3><p>{benefit.body}</p></article>)}</div></section>}
    <GuideDirectory />
    <section className="contentSection converterDirectory"><span className="sectionKicker">EXPLORE CONVERTERS</span><h2>Start with the workflow that matches your artwork.</h2><nav>{LANDING_PAGES.map((page) => <a key={page.path} href={page.path}>{page.heading}</a>)}</nav></section>
    <SiteFooter extra={<button className="shareButton" onClick={() => void shareSite()}>Share Vectraa</button>} />
  </main>;
}

function svgPalette(svg: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of svg.matchAll(/(?:fill|stroke)="(rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|#[0-9a-fA-F]{3,8})"/g)) {
    const value = match[1].replace(/\s+/g, '');
    if (value === 'none' || /rgb\(255,255,255\)/i.test(value) || /^#f{3}(?:f{3})?$/i.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    found.push(value);
    if (found.length === 12) break;
  }
  return found;
}

function HeroLinks({ source }: { source: string }) {
  return <p className="heroLinks">{inlineLinkSegments(source).map((segment, index) => segment.href ? <a key={`${segment.href}-${index}`} href={segment.href}>{segment.text}</a> : <span key={index}>{segment.text}</span>)}</p>;
}

function GuideDirectory() {
  return <section className="contentSection guideDirectory"><span className="sectionKicker">VECTOR LEARNING CENTER</span><h2>Get a better result before you export.</h2><p className="sectionLead">Practical guidance for logo cleanup, printing, cutting machines and manageable SVG files.</p><div className="guideCards">{GUIDE_PAGES.map((guide) => <a key={guide.path} href={guide.path}><span>{guide.eyebrow}</span><strong>{guide.heading}</strong><small>{guide.readingTime}</small></a>)}</div></section>;
}

function GuideView({ page }: { page: GuidePage }) {
  return <main>
    <header className="nav"><a className="brand" href="/">Vectraa<span>.</span></a><nav className="navLinks"><a href="/">Converter</a><a href="#guide">Guide</a><a href="/about">About</a><a href="/privacy">Privacy</a></nav><div className="privacy">Free vector tools · private by design</div></header>
    <article id="guide" className="guidePage">
      <header className="guideHero"><p className="eyebrow">{page.eyebrow}</p><h1>{page.heading}</h1><p className="lead">{page.lead}</p><div className="guideMeta"><span>Updated {page.updated}</span><span>{page.readingTime}</span></div><a className="guideCta" href={page.relatedConverter.path}>{page.relatedConverter.label} <span aria-hidden="true">→</span></a></header>
      <div className="guideBody">{page.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.tips && <ul>{section.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>}</section>)}</div>
      <section className="guideFaq"><h2>Questions before you export</h2><FaqList items={page.faqs} /></section>
      <aside className="guideConversion"><span className="sectionKicker">TRY IT ON YOUR ARTWORK</span><h2>Turn the advice into a cleaner vector.</h2><p>Vectraa analyzes the source, compares trace candidates and lets you inspect the SVG before downloading.</p><a className="guideCta" href={page.relatedConverter.path}>{page.relatedConverter.label} <span aria-hidden="true">→</span></a></aside>
    </article>
    <div id="related-guides"><GuideDirectory /></div>
    <section className="contentSection converterDirectory"><span className="sectionKicker">EXPLORE CONVERTERS</span><h2>Choose a converter for your source artwork.</h2><nav>{LANDING_PAGES.map((converter) => <a key={converter.path} href={converter.path}>{converter.heading}</a>)}</nav></section>
    <SiteFooter />
  </main>;
}
