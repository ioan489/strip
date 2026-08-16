// e2e/pages.test.js
import { test, expect } from '@playwright/test';

test.describe('Page rendering', () => {
  test('payments page has correct <title>', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Payments infrastructure for the internet/i);
  });

  test('payments page has a visible h1', async ({ page }) => {
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    const text = await h1.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('payments page meta description is set', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="description"]');
    const content = await meta.getAttribute('content');
    expect(content?.length).toBeGreaterThan(0);
  });

  test('unknown URL returns 404', async ({ page }) => {
    const response = await page.goto('/this-does-not-exist');
    expect(response?.status()).toBe(404);
  });
});
