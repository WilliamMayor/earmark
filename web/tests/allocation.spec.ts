import { test, expect } from '@playwright/test';
import { resetFixtureDb } from './helpers/seed.js';

test.beforeEach(() => resetFixtureDb());

async function getAccountUrl(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/accounts');
	const card = page.getByTestId('account-card').first();
	const href = await card.getAttribute('href');
	return href!;
}

test.describe('Allocation flow', () => {
	test('shows allocation dock when transactions are unallocated', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		await expect(page.getByTestId('allocation-dock')).toBeVisible();
	});

	test('dock shows payee and amount of current transaction', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		const dock = page.getByTestId('allocation-dock');
		// Fixture tx1: Tesco Superstore £18.50
		await expect(dock).toContainText('Tesco Superstore');
		await expect(dock).toContainText('18.50');
	});

	test('allocate button assigns transaction to envelope', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Click first Allocate button (allocates to first envelope in list)
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// After allocation, the transaction queue shrinks; dock shows next tx
		const dock = page.getByTestId('allocation-dock');
		await expect(dock).toBeVisible();
		// The allocated tx (Tesco) should no longer be the current one
		await expect(dock).not.toContainText('Tesco Superstore');
	});

	test('dock disappears when all transactions are allocated', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Allocate all 3 unallocated transactions (2 simple + 1 split with 2 parts = 4 allocations)
		// Allocate tx1
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// Allocate tx2
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// tx3 is a split — allocate first split part
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// Allocate second split part — redirects to account page (may still have ?tx= pointing to next unallocated)
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForTimeout(500);

		// All done — no dock (tx4 is already allocated, so no more unallocated txs)
		await expect(page.getByTestId('allocation-dock')).not.toBeVisible();
	});

	test('next/prev buttons navigate between transactions', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Start at tx=0 (Tesco)
		const dock = page.getByTestId('allocation-dock');
		await expect(dock).toContainText('Tesco Superstore');

		// Navigate to next
		await page.getByLabel('Next transaction').click();
		await expect(page).toHaveURL(/tx=1/);
		await expect(dock).toContainText('Deliveroo');

		// Navigate back
		await page.getByLabel('Previous transaction').click();
		await expect(page).toHaveURL(/tx=0/);
		await expect(dock).toContainText('Tesco Superstore');
	});

	test('allocate button shows the amount being allocated', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		// tx1 is Tesco £18.50 DBIT — button should read "Allocate £18.50"
		const btn = page.getByTestId('allocate-btn').first();
		await expect(btn).toContainText('Allocate');
		await expect(btn).toContainText('18.50');
	});

	test('envelope cards show projected balance in allocation mode', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		// At least one envelope card should show the → projected balance indicator
		const card = page.getByTestId('envelope-card').first();
		await expect(card.locator('text=→')).toBeVisible();
	});

	test('envelope cards show balance bar', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		const card = page.getByTestId('envelope-card').first();
		await expect(card).toBeVisible();
	});

	test('new envelope button creates an envelope', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		await page.getByTestId('expander-btn').click();
		await page.getByLabel('Envelope name').fill('Rent');
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page.getByTestId('envelope-card').filter({ hasText: 'Rent' })).toBeVisible();
	});

	test('split button shows inline split form', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		await page.getByTestId('split-btn').click();

		// The split button shows a form inline without navigation
		await page.waitForTimeout(200);

		// Inline form should be visible in dock
		const dock = page.getByTestId('allocation-dock');
		await expect(dock.getByLabel('Amount')).toBeVisible();
		await expect(dock.getByLabel('Note (optional)')).toBeVisible();
	});
});
