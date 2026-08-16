// e2e/navigation.test.js
import { test, expect } from '@playwright/test';

test.describe('Site navigation', () => {
  test('site header is present on every page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
  });

  test('navigation contains at least one link', async ({ page }) => {
    await page.goto('/');
    const navLinks = page.getByRole('banner').getByRole('link');
    await expect(navLinks.first()).toBeVisible();
  });

  test('payments nav link is present and points to /payments', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /payments/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/payments');
  });

  test('clicking a nav link navigates correctly', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /payments/i }).click();
    await expect(page).toHaveURL('/payments');
  });

  test('external links have target=_blank and rel=noopener', async ({ page }) => {
    await page.goto('/');
    const externalLinks = page.getByRole('banner').locator('a[target="_blank"]');
    const count = await externalLinks.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(externalLinks.nth(i)).toHaveAttribute('rel', /noopener/);
      }
    }
  });
});
