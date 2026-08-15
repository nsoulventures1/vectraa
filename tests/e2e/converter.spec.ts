import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mP8z8DAwMAAAAYAAWgmWQ0AAAAASUVORK5CYII=',
  'base64',
);

test('production converter loads, accepts artwork, vectorizes, and exposes SVG download', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Anything/ })).toBeVisible();
  await expect(page.getByText(/processed on your device/i)).toBeVisible();

  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: tinyPng });

  await expect(page.getByText(/Recommended:/)).toBeVisible();
  const convert = page.getByRole('button', { name: /Make Best Vector|Rescue & Vectorize/ });
  await expect(convert).toBeEnabled();
  await convert.click();

  await expect(page.getByAltText('Vectorized result')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/vector health/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download SVG$/ })).toBeEnabled();
  await expect(page.getByText(/Real SVG paths/i)).toBeHidden();
});
