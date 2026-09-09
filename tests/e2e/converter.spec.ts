import { expect, test, type Page } from '@playwright/test';

const smokePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiUlEQVR4nGP8////f4YBBEwDafmoAxgYGBhY0AXko7fS1MKHS71R+AMeAqMOGHUARi4gFqCnZnJzD8kOQLcYXZxUh5AUBbgsJ1UN2Q6gBSDaAaT4jBS1QycERh1ASvYiRe3QCQEGBuJ8RmpBRHJJCLNgwIpiSi1EB0MrDYw6YFg6gHG0bzjiHQAA1OkkcCKX3TgAAAAASUVORK5CYII=',
  'base64',
);

async function createNoisyBrandFixture(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1254; canvas.height = 1254;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create regression canvas.');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 17;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 48271) % 2147483647;
      const noise = seed % 10;
      pixels.data[i] = 246 + noise;
      pixels.data[i + 1] = 246 + ((noise + 3) % 10);
      pixels.data[i + 2] = 246 + ((noise + 7) % 10);
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const navy = '#032049', gold = '#b8934d';
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.strokeStyle = navy; context.lineWidth = 26;
    context.beginPath(); context.arc(627, 420, 220, 0.23 * Math.PI, 1.77 * Math.PI); context.stroke();
    context.strokeStyle = gold; context.beginPath(); context.arc(627, 420, 220, -0.23 * Math.PI, 0.23 * Math.PI); context.stroke();
    context.fillStyle = navy; context.font = 'bold 300px sans-serif'; context.textAlign = 'center'; context.fillText('N', 627, 505);
    context.strokeStyle = navy; context.lineWidth = 28; context.beginPath(); context.moveTo(450, 510); context.bezierCurveTo(535, 435, 635, 610, 795, 515); context.stroke();
    context.strokeStyle = gold; context.lineWidth = 25; context.beginPath(); context.moveTo(470, 545); context.bezierCurveTo(575, 490, 645, 650, 775, 555); context.stroke();
    context.fillStyle = navy; context.font = '120px sans-serif'; context.fillText('NSOUL', 627, 790);
    context.fillStyle = gold; context.font = '54px sans-serif'; context.fillText('— V E N T U R E S —', 627, 875);
    context.fillStyle = navy; context.font = '28px sans-serif'; context.fillText('SOLUTIONS · EXECUTION · EXCELLENCE', 627, 935);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createReflectiveProductFixture(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 700;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not create product fixture.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    const steel = context.createLinearGradient(180, 0, 720, 0);
    steel.addColorStop(0, '#444'); steel.addColorStop(.18, '#f7f7f7'); steel.addColorStop(.36, '#8a8a8a'); steel.addColorStop(.55, '#fff'); steel.addColorStop(.76, '#777'); steel.addColorStop(1, '#ddd');
    context.fillStyle = steel; context.beginPath(); context.roundRect(190, 210, 520, 330, 70); context.fill();
    context.fillStyle = '#111'; context.roundRect(610, 155, 220, 45, 22); context.fill();
    context.fillStyle = '#176db6'; context.beginPath(); context.arc(470, 355, 70, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#111'; context.font = 'bold 30px sans-serif'; context.textAlign = 'center'; context.fillText('PRODUCT', 470, 365);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createDarkEmblemFixture(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 900;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not create emblem fixture.');
    context.fillStyle = '#030303'; context.fillRect(0, 0, 900, 900);
    context.fillStyle = '#11108d'; context.beginPath(); context.arc(450, 450, 350, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#f4b900'; context.lineWidth = 24; context.beginPath(); context.arc(450, 450, 335, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 15; context.beginPath(); context.arc(450, 450, 255, 0, Math.PI * 2); context.stroke();
    context.fillStyle = '#f4b900'; context.font = 'bold 62px sans-serif'; context.textAlign = 'center';
    context.fillText('EASTERN NAVAL', 450, 255); context.fillText('COMMAND', 450, 700);
    context.font = 'bold 200px serif'; context.fillText('⚓', 450, 535);
    // Deterministic low-amplitude compression-like noise should not turn a
    // three-ink badge into photographic high-detail artwork.
    const image = context.getImageData(0, 0, 900, 900); let seed = 29;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 48271) % 2147483647; const n = (seed % 5) - 2;
      image.data[i] = Math.max(0, Math.min(255, image.data[i] + n));
      image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n));
      image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n));
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test('production converter loads, vectorizes, records local workspace metadata, and exposes SVG download', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Anything/ })).toBeVisible();
  await expect(page.getByText(/processed on your device/i)).toBeVisible();
  const workspace = page.getByRole('region', { name: 'My Workspace' });
  await expect(workspace.getByText(/No conversion history yet/i)).toBeVisible();

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: smokePng });

  await expect(page.getByText(/Recommended:/)).toBeVisible();
  const convert = page.getByRole('button', { name: /Make Best Vector|Rescue & Vectorize/ });
  await expect(convert).toBeEnabled();
  await convert.click();

  await expect(page.getByAltText('Vectorized result')).toBeVisible({ timeout: 45_000 });
  const diagnostics = page.locator('.metrics');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByText(/vector health/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download SVG$/ })).toBeEnabled();
  await expect(page.getByText(/Real SVG paths/i)).toBeHidden();

  await expect(workspace.getByText('smoke.png')).toBeVisible();
  await expect(workspace.getByText(/Quality \d+\/100/)).toBeVisible();
  await expect(workspace.getByText(/Local-only workspace/i)).toBeVisible();
  await workspace.getByRole('button', { name: 'Clear history' }).click();
  await expect(workspace.getByText(/No conversion history yet/i)).toBeVisible();
});

test('NSoul noisy-canvas regression preserves brand colours without tracing the background', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'nsoul-noisy-logo.png', mimeType: 'image/png', buffer: await createNoisyBrandFixture(page) });
  await expect(page.getByText(/Recommended:.*Logo/i)).toBeVisible();

  const convert = page.getByRole('button', { name: /Make Best Vector|Rescue & Vectorize/ });
  await expect(convert).toBeEnabled();
  await convert.click();
  await expect(page.getByAltText('Vectorized result')).toBeVisible({ timeout: 120_000 });

  const qualityText = await page.locator('.result .score').innerText();
  const quality = Number(qualityText.match(/(\d+)\/100/)?.[1] ?? 0);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download SVG$/ }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const svgBuffer = Buffer.concat(chunks);
  const svg = svgBuffer.toString('utf8');

  expect(svgBuffer.byteLength, 'NSoul logo SVG must remain practical for web and print workflows').toBeLessThan(1_000_000);
  expect(svg).toMatch(/^<svg\b/);
  expect(svg).not.toMatch(/<image\b/i);
  expect(svg).not.toMatch(/<rect\b[^>]*(?:width="1254"|width="100%")/i);
  const pathCount = (svg.match(/<path\b/g) ?? []).length;
  expect(pathCount, 'Flat brand artwork must not fragment into hundreds of shade-derived paths').toBeLessThan(180);

  const fills = [...svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)].map((match) => match.slice(1, 4).map(Number));
  const distinctFills = new Set(fills.map((fill) => fill.join(',')));
  expect(distinctFills.size, `Anti-alias shades leaked into the brand palette: ${JSON.stringify([...distinctFills])}`).toBeLessThanOrEqual(3);
  const hasNavy = fills.some(([r, g, b]) => b > r * 1.35 && b > g * 1.15 && r < 80);
  const hasGold = fills.some(([r, g, b]) => r > 130 && g > 85 && g < r * 0.92 && b < g * 0.75);
  const hasCanvasNoise = fills.some(([r, g, b]) => r > 220 && g > 220 && b > 220);
  expect(hasNavy, `Missing navy in ${JSON.stringify(fills)}`).toBe(true);
  expect(hasGold, `Missing gold in ${JSON.stringify(fills)}`).toBe(true);
  expect(hasCanvasNoise, `Near-white canvas colours leaked into ${JSON.stringify(fills)}`).toBe(false);
  expect(
    quality,
    `Expected launch-quality NSoul output, received ${qualityText}; ${svgBuffer.byteLength} bytes; fills ${JSON.stringify(fills)}`,
  ).toBeGreaterThanOrEqual(75);
});

test('reflective products on white route to high detail instead of destructive logo rescue', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'reflective-product.png', mimeType: 'image/png', buffer: await createReflectiveProductFixture(page) });
  const analysisBar = page.locator('.analysisBar[aria-live="polite"]');
  await expect(analysisBar.locator('.analysisBadge')).toBeVisible();
  const signals = await analysisBar.getAttribute('data-analysis');
  await expect(analysisBar.locator('.analysisBadge'), `Measured product signals: ${signals}`).toContainText(/Recommended:\s*High detail/i);
  await expect(page.locator('.pills button', { hasText: 'High detail' })).toHaveClass(/selected/);
});

test('dark flat-colour emblems use the clean logo tracer without band seams or palette noise', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'dark-emblem.png', mimeType: 'image/png', buffer: await createDarkEmblemFixture(page) });
  const analysisBar = page.locator('.analysisBar[aria-live="polite"]');
  const signals = await analysisBar.getAttribute('data-analysis');
  await expect(analysisBar.locator('.analysisBadge'), `Measured emblem signals: ${signals}`).toContainText(/Recommended:\s*Logo/i);
  await page.getByRole('button', { name: /Make Best Vector|Rescue & Vectorize/ }).click();
  await expect(page.getByAltText('Vectorized result')).toBeVisible({ timeout: 120_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download SVG$/ }).click();
  const download = await downloadPromise; const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const svgBuffer = Buffer.concat(chunks); const svg = svgBuffer.toString('utf8');
  expect(svgBuffer.byteLength).toBeLessThan(1_000_000);
  expect(svg).not.toMatch(/<image\b/i);
  expect(svg).not.toContain('data-vectraa-centred-badge');
  expect((svg.match(/<path\b/g) ?? []).length).toBeLessThan(300);
  const fills = new Set([...svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)].map((match) => match.slice(1, 4).join(',')));
  expect(fills.size, `Flat emblem leaked noisy shades: ${JSON.stringify([...fills])}`).toBeLessThanOrEqual(4);
});
