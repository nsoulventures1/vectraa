import '../src/vector/imageDataSetup';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { JsVectorEngine } from '../src/vector/JsVectorEngine';
import { flatLogoFixture, illustrationFixture, lineArtFixture, signatureFixture, type DrawnImage } from '../src/vector/fixtures';
import { inspectSvg } from '../src/vector/quality';
import { DEFAULT_OPTIONS } from '../src/vector/presets';
import type { VectorPreset } from '../src/vector/types';

const outDir = process.argv[2] ?? '/tmp/vectraa-after';
mkdirSync(outDir, { recursive: true });

const engine = new JsVectorEngine();
const cases: Array<{ name: string; preset: VectorPreset; draw: () => DrawnImage }> = [
  { name: 'flat-logo', preset: 'logo', draw: flatLogoFixture },
  { name: 'signature', preset: 'signature', draw: signatureFixture },
  { name: 'line-art', preset: 'line-art', draw: lineArtFixture },
  { name: 'illustration', preset: 'illustration', draw: illustrationFixture },
];

const summary: Record<string, unknown> = {};
for (const item of cases) {
  const drawn = item.draw();
  writeFileSync(`${outDir}/${item.name}-source.png`, encodePng(drawn.image));
  const result = await engine.vectorizeImageData(drawn.image, DEFAULT_OPTIONS[item.preset]);
  writeFileSync(`${outDir}/${item.name}.svg`, result.svg);
  summary[item.name] = { ...inspectSvg(result.svg), elapsedMs: result.elapsedMs };
}
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

function encodePng(image: ImageData): Buffer {
  const stride = image.width * 4 + 1;
  const raw = Buffer.alloc(stride * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * stride] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * image.width * 4, image.width * 4).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
