import { expect, test } from '@playwright/test';

const smokePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiUlEQVR4nGP8////f4YBBEwDafmoAxgYGBhY0AXko7fS1MKHS71R+AMeAqMOGHUARi4gFqCnZnJzD8kOQLcYXZxUh5AUBbgsJ1UN2Q6gBSDaAaT4jBS1QycERh1ASvYiRe3QCQEGBuJ8RmpBRHJJCLNgwIpiSi1EB0MrDYw6YFg6gHG0bzjiHQAA1OkkcCKX3TgAAAAASUVORK5CYII=',
  'base64',
);

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
