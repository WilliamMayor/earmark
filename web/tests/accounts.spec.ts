import { test, expect } from '@playwright/test';
import { resetFixtureDb } from './helpers/seed.js';

test.beforeEach(() => resetFixtureDb());

test.describe('Account list', () => {
	test('shows accounts page at root redirect', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL('/accounts');
	});

	test('renders account card', async ({ page }) => {
		await page.goto('/accounts');
		const card = page.getByTestId('account-card').first();
		await expect(card).toBeVisible();
		await expect(card).toContainText('Monzo');
	});

	test('shows unallocated badge with correct count', async ({ page }) => {
		await page.goto('/accounts');
		// Fixture has 3 unallocated transactions (tx1, tx2, tx3 — tx4 is allocated)
		const badge = page.getByTestId('unallocated-badge');
		await expect(badge).toBeVisible();
		await expect(badge).toContainText('3');
	});

	test('navigates to account detail on click', async ({ page }) => {
		await page.goto('/accounts');
		await page.getByTestId('account-card').first().click();
		await expect(page).toHaveURL(/\/accounts\/\d+/);
	});
});
