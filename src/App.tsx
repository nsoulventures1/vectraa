import { useMemo, useRef, useState } from 'react';
import { useObjectUrl } from './hooks/useObjectUrl';
import { analyzeImage } from './vector/analyzeImage';
import { NeplexVectorEngine } from './vector/NeplexVectorEngine';
import { DEFAULT_OPTIONS } from './vector/presets';
import type { ImageAnalysis, VectorPreset, VectorResult } from './vector/types';

const engine = new NeplexVectorEngine();
const PRESETS: Array<{ id: VectorPreset; label: string }> = [
  { id: 'logo', label: 'Logo' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'line-art', label: 'Line art' },
  { id: 'signature', label: 'Signature' },
  { id: 'high-detail', label: 'High detail' },
];

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<VectorPreset>('logo');
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const sourceUrl = useObjectUrl(file);
  const svgBlob = useMemo(() => result ? new Blob([result.svg], { type: 'image/svg+xml' }) : null, [result]);
  const svgUrl = useObjectUrl(svgBlob);

  async function choose(next?: File) {
    if (!next) return;
    const run = ++analysisRun.current;
    setFile(next);
    setAnalysis(null);
    setAnalyzing(true);
    setResult(null);
    setError(null);
    try {
      const nextAnalysis = await analyzeImage(next);
      if (run !== analysisRun.current) return;
      setAnalysis(nextAnalysis);
      setPreset(nextAnalysis.likelyKind);
    } catch (err) {
      if (run !== analysisRun.current) return;
      setError(err instanceof Error ? err.message : 'Image analysis failed.');
    } finally {
      if (run === analysisRun.current) setAnalyzing(false);
    }
  }

  async function vectorize() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await engine.vectorize(file, DEFAULT_OPTIONS[preset]));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Vectorization failed.');
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${file?.name.replace(/\.[^.]+$/, '') || 'vectraa'}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main>
    <header className="nav"><a className="brand" href="/">Vectraa<span>.</span></a><div className="privacy">Private by design · processed on your device</div></header>
    <section className="hero">
      <p className="eyebrow">FREE AI VECTOR STUDIO</p>
      <h1>Anything <span>→</span> Vector.</h1>
      <p className="lead">Turn JPG, PNG and WebP artwork into clean, scalable SVG — directly in your browser.</p>
      <div className="modeRow"><button className="mode active">Upload an image</button><button className="mode" disabled title="Describe → Vector is coming next">Describe what you want <b>Soon</b></button></div>
    </section>

    <section className="studio">
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { void choose(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <div className="source card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void choose(e.dataTransfer.files[0]); }}>
        <div className="cardHead"><span>ORIGINAL</span>{file && <button onClick={() => inputRef.current?.click()}>Replace</button>}</div>
        {sourceUrl ? <div className="canvas checker"><img src={sourceUrl} alt="Uploaded original" /></div> : <button className="drop" onClick={() => inputRef.current?.click()}><span className="uploadIcon">↑</span><strong>Drop your image here</strong><small>or click to browse · JPG, PNG, WebP · up to 20 MB</small></button>}
      </div>
      <div className="result card">
        <div className="cardHead"><span>VECTOR</span>{result && <span className="score">Quality {result.quality.score}/100</span>}</div>
        {svgUrl ? <div className="canvas checker"><img src={svgUrl} alt="Vectorized result" /></div> : <div className="empty"><span>◇</span><strong>Your vector will appear here</strong><small>Real SVG paths — not a raster image wrapped in an SVG file.</small></div>}
      </div>
    </section>

    {file && <section className="analysisBar" aria-live="polite">
      {analyzing ? <span className="analysisLoading">Inspecting artwork locally…</span> : analysis && <>
        <span className="analysisBadge">Recommended: <b>{PRESETS.find((item) => item.id === analysis.likelyKind)?.label}</b> · {analysis.confidence}% confidence</span>
        <span>{analysis.width}×{analysis.height} · {analysis.megapixels.toFixed(1)} MP{analysis.hasAlpha ? ' · transparency detected' : ''}</span>
        {analysis.warnings[0] && <span className="analysisWarning">{analysis.warnings[0]}</span>}
      </>}
    </section>}

    <section className="controls">
      <div><label>Optimize for {analysis ? '· automatically recommended, fully adjustable' : ''}</label><div className="pills">{PRESETS.map((item) => <button key={item.id} className={preset === item.id ? 'selected' : ''} onClick={() => setPreset(item.id)}>{item.label}{analysis?.likelyKind === item.id ? ' · Recommended' : ''}</button>)}</div></div>
      <div className="actions"><button className="primary" disabled={!file || running || analyzing} onClick={vectorize}>{running ? 'Vectorizing…' : analyzing ? 'Analyzing…' : 'Make Vector'}</button><button className="secondary" disabled={!result} onClick={download}>Download SVG</button></div>
    </section>

    {error && <div role="alert" className="error">{error}</div>}
    {result && <section className="metrics"><span><b>{result.quality.paths}</b> paths</span><span><b>{result.quality.nodesApprox}</b> approx. nodes</span><span><b>{Math.round(result.quality.bytes / 1024)}</b> KB SVG</span><span><b>{Math.round(result.elapsedMs)}</b> ms trace</span></section>}

    <section className="trust"><div><b>01</b><strong>Local processing</strong><p>Your basic conversion runs on your device.</p></div><div><b>02</b><strong>Genuine vector output</strong><p>Editable SVG geometry built from paths and shapes.</p></div><div><b>03</b><strong>No account. No watermark.</strong><p>Convert and download without creating an account.</p></div></section>
  </main>;
}
