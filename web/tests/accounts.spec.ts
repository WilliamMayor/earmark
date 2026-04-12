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

	test('shows account balance on card', async ({ page }) => {
		await page.goto('/accounts');
		// Fixture has 4 DBIT transactions (18.50 + 32.00 + 20.00 + 5.00) and no credits → -£75.50
		const balance = page.getByTestId('account-balance');
		await expect(balance).toBeVisible();
		await expect(balance).toContainText('-£75.50');
	});
});

test.describe('Manual account creation', () => {
	test('creates a new manual account from the accounts list', async ({ page }) => {
		await page.goto('/accounts');

		await page.getByRole('button', { name: '+ New account' }).click();
		await page.getByLabel('Institution name').fill('Cash');
		await page.getByLabel('Account name').fill('Wallet');
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page).toHaveURL('/accounts');
		await expect(page.getByTestId('account-card').filter({ hasText: 'Cash' })).toBeVisible();
	});
});
