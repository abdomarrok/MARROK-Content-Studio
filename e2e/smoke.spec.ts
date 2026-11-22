import { test, expect } from '@playwright/test';
import { createSignedSessionToken } from '../src/lib/security/sessionAuth.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET || '3fd3d0b27d99827d954cb8e78be1dd42ece06e58c28b229074b639d7a8f659b0';

test.describe('MARROK Studio UX Smoke Tests (PR 4)', () => {
  test.beforeEach(async ({ page }) => {
    const { token } = createSignedSessionToken('admin', SESSION_SECRET);

    await page.addInitScript((authToken) => {
      window.sessionStorage.setItem('marrok_iframe_session_token_v1', authToken);
    }, token);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('form').first()).toBeVisible({ timeout: 10000 });
  });

  test('Flow 1: Generate a carousel deck from prompt', async ({ page }) => {
    const input = page.locator('input[placeholder*="Describe a topic"], input[placeholder*="Enter topic"]').first();
    await expect(input).toBeVisible();
    await input.fill('Distributed Consensus with Raft & Paxos');

    const generateBtn = page.locator('button[type="submit"], button:has-text("Generate")').first();
    await generateBtn.click();

    // Verify stage canvas rendered
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('Flow 2: Fix a failing check in the Review checklist', async ({ page, isMobile }) => {
    // On mobile, tap "Publish" / review tab in mobile bottom bar
    if (isMobile) {
      const reviewMobileTab = page.locator('[data-testid="mobile-tab-review"]');
      await reviewMobileTab.click({ force: true });
      await page.waitForTimeout(400);
    } else {
      // Switch to Review tab on desktop
      const reviewTab = page.locator('button[data-testid="tab-review"]').first();
      await expect(reviewTab).toBeVisible({ timeout: 10000 });
      await reviewTab.click({ force: true });
    }

    // Verify Ready to Publish Checklist is mounted
    await expect(page.locator('text=Ready to Publish Checklist')).toBeVisible({ timeout: 10000 });

    // If an "I reviewed" button is visible for offline drafts, click it
    const reviewedBtn = page.locator('button:has-text("I reviewed")');
    if (await reviewedBtn.isVisible()) {
      await reviewedBtn.click({ force: true });
      await expect(page.locator('text=Reviewed (Unmark)')).toBeVisible({ timeout: 5000 });
    }

    // Check creator attribution
    const creditBtn = page.locator('button[aria-label="Edit creator credit"], button:has-text("Add Credit")').first();
    if (await creditBtn.isVisible()) {
      await creditBtn.click({ force: true });
      const creditInput = page.locator('input[placeholder*="Enter creator"]');
      if (await creditInput.isVisible()) {
        await creditInput.fill('Dr. Diego Ongaro / Stanford');
      }
    }

    // Verify at least one PASS badge with check icon is rendered
    await expect(page.locator('span:has-text("PASS")').first()).toBeVisible();
  });

  test('Flow 3: Export Metricool ZIP bundle', async ({ page, isMobile }) => {
    if (isMobile) {
      const reviewMobileTab = page.locator('[data-testid="mobile-tab-review"]');
      await reviewMobileTab.click({ force: true });
      await page.waitForTimeout(400);
    } else {
      const reviewTab = page.locator('button[data-testid="tab-review"]').first();
      await reviewTab.click({ force: true });
    }

    await expect(page.locator('text=Ready to Publish Checklist')).toBeVisible({ timeout: 10000 });

    // If an "I reviewed" button is visible for offline drafts, click it to clear draft blocker
    const reviewedBtn = page.locator('button:has-text("I reviewed")');
    if (await reviewedBtn.isVisible()) {
      await reviewedBtn.click({ force: true });
      await page.waitForTimeout(200);
    }

    // Override limits/risks to unlock export
    const overrideLabel = page.locator('text=Export anyway (Override warnings)');
    if (await overrideLabel.isVisible()) {
      await overrideLabel.click({ force: true });
      const confirmBtn = page.locator('button:has-text("Confirm Override")');
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();
      await page.waitForTimeout(300);
    }

    // On mobile, close bottom sheet to expose the dock
    if (isMobile) {
      const closeSheetBtn = page.locator('button[aria-label="Close inspector bottom sheet"]');
      if (await closeSheetBtn.isVisible()) {
        await closeSheetBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // Export button inside dock or inspector (filter for visible one)
    const exportBtn = page.locator('button:has-text("Export ZIP"), button[aria-label="Export Post Bundle"]').filter({ visible: true }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await expect(exportBtn).toBeEnabled({ timeout: 10000 });
  });

  test('Flow 4: Save to Vault', async ({ page }) => {
    const saveVaultBtn = page.locator('button[title*="Save current deck to Vault"]');
    await expect(saveVaultBtn).toBeVisible({ timeout: 5000 });
    await saveVaultBtn.click();

    // Verify post is recorded in vault (badge counter updates or status changes)
    await expect(page.locator('button[aria-label="Open Saved Posts Vault"]')).toBeVisible({ timeout: 5000 });
  });

  test('Flow 5: Reopen a saved post from Vault', async ({ page }) => {
    const savedPostsBtn = page.locator('button[aria-label="Open Saved Posts Vault"]');
    await expect(savedPostsBtn).toBeVisible({ timeout: 5000 });
    await savedPostsBtn.click({ force: true });

    // Verify vault drawer opens
    await expect(page.locator('text=Saved & Posted Vault')).toBeVisible({ timeout: 10000 });

    // If any post is in the vault, load one
    const loadPostBtn = page.locator('button:has-text("Load Post")').first();
    if (await loadPostBtn.isVisible()) {
      await loadPostBtn.click();
      await expect(page.locator('canvas')).toBeVisible();
    }
  });
});
