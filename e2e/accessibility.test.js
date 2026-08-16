// e2e/accessibility.test.js
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('payments page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    // Log violations for debugging — don't swallow them
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations, null, 2));
    }

    expect(results.violations).toHaveLength(0);
  });
});
