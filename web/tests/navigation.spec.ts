import { test, expect } from '@playwright/test';
import { resetFixtureDb } from './helpers/seed.js';

test.beforeEach(() => resetFixtureDb());

// ─── Global nav ───────────────────────────────────────────────────────────────

test.describe('Global nav — desktop', () => {
  test('shows EARMARK wordmark linking to /accounts', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/accounts');
    const wordmark = page.getByRole('link', { name: 'EARMARK' });
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute('href', '/accounts');
  });

  test('shows Accounts link as active on accounts pages', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/accounts');
    const link = page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Accounts' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('shows Settings link', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/accounts');
    await expect(page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('hamburger button is hidden on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  });
});

test.describe('Global nav — mobile', () => {
  test('shows hamburger button, hides inline links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Global' })).toBeHidden();
  });

  test('hamburger expands a column of nav links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Global mobile' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Global mobile' }).getByRole('link', { name: 'Accounts' })).toBeVisible();
  });

  test('hamburger icon changes to close icon when open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();
  });

  test('menu closes after navigating to an account', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByTestId('account-card').first().click();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Global mobile' })).toBeHidden();
  });
});

// ─── Account tab bar ──────────────────────────────────────────────────────────

test.describe('Account tab bar', () => {
  test('shows account name on account page', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await expect(page.getByTestId('account-tab-bar')).toBeVisible();
    await expect(page.getByTestId('account-tab-bar')).toContainText('Personal');
  });

  test('Envelopes tab is active on account page', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await expect(page.getByTestId('tab-envelopes')).toHaveAttribute('aria-current', 'page');
  });

  test('Envelopes tab is active on envelope detail page', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await page.getByTestId('envelope-card').first().click();
    await expect(page.getByTestId('tab-envelopes')).toHaveAttribute('aria-current', 'page');
  });
});

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

test.describe('Envelope breadcrumb', () => {
  test('breadcrumb is not shown on account page', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await expect(page.getByTestId('breadcrumb')).toBeHidden();
  });

  test('breadcrumb appears on envelope detail', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await page.getByTestId('envelope-card').first().click();
    await expect(page.getByTestId('breadcrumb')).toBeVisible();
  });

  test('breadcrumb shows envelope name', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    await page.getByTestId('envelope-card').first().click();
    await expect(page.getByTestId('breadcrumb')).toContainText('Groceries');
  });

  test('breadcrumb Envelopes link navigates back to account', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByTestId('account-card').first().click();
    const accountUrl = page.url();
    await page.getByTestId('envelope-card').first().click();
    await page.getByTestId('breadcrumb').getByRole('link', { name: 'Envelopes' }).click();
    await expect(page).toHaveURL(accountUrl);
  });
});
