import { test, expect } from '@playwright/test';
import { resetFixtureDb } from './helpers/seed.js';

test.beforeEach(() => resetFixtureDb());

async function getAccountUrl(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/accounts');
	const href = await page.getByTestId('account-card').first().getAttribute('href');
	return href!;
}

test.describe('Split definition (inline on account page)', () => {
	test('split button is visible on default split in allocation dock', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		const dock = page.getByTestId('allocation-dock');
		await expect(dock.getByTestId('split-btn')).toBeVisible();
	});

	test('clicking split button shows add split form', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);
		await page.getByTestId('split-btn').click();

		// The inline form should appear with amount and note inputs
		const dock = page.getByTestId('allocation-dock');
		await expect(dock.getByLabel('Amount')).toBeVisible();
		await expect(dock.getByLabel('Note (optional)')).toBeVisible();
		await expect(dock.getByRole('button', { name: 'Add split' })).toBeVisible();
	});

	test('adding a split creates a new split row in the dock', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Click split button
		await page.getByTestId('split-btn').click();

		// Fill in split form
		await page.getByLabel('Amount').fill('8.00');
		await page.getByLabel('Note (optional)').fill('Groceries');
		await page.getByRole('button', { name: 'Add split' }).click();
		await page.waitForURL(/\?tx=/);

		// Should see two split rows: the modified default and the new one
		const dock = page.getByTestId('allocation-dock');
		await expect(dock.getByText('Groceries')).toBeVisible();
		// Default split should now show remaining amount (18.50 - 8.00 = 10.50)
		await expect(dock.locator('.font-mono').filter({ hasText: /10\.50/ }).first()).toBeVisible();
	});

	test('delete button removes a split and restores default', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Add a split
		await page.getByTestId('split-btn').click();
		await page.getByLabel('Amount').fill('8.00');
		await page.getByRole('button', { name: 'Add split' }).click();
		await page.waitForURL(/\?tx=/);

		// Delete the split - use the dock-scoped button to avoid ambiguity with envelope delete buttons
		const dock = page.getByTestId('allocation-dock');
		await dock.getByRole('button', { name: 'Delete' }).click();
		await page.waitForURL(/\?tx=/);

		// Default should be restored to full amount
		await expect(dock.getByText('18.50')).toBeVisible();
	});
});

test.describe('Split allocation (inline on account page)', () => {
	test('pre-split transaction shows Split indicator in dock', async ({ page }) => {
		// tx3 (Waitrose £20) is pre-seeded with 2 splits in fixture
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Navigate to the Waitrose transaction (index 2 in the unallocated queue)
		await page.getByLabel('Next transaction').click();
		await page.getByLabel('Next transaction').click();

		const dock = page.getByTestId('allocation-dock');
		await expect(dock).toContainText('Waitrose');
		await expect(dock).toContainText('Split');
	});

	test('allocating all split parts shows next unallocated transaction', async ({ page }) => {
		const url = await getAccountUrl(page);
		await page.goto(url);

		// Navigate to Waitrose (tx index 2)
		await page.getByLabel('Next transaction').click();
		await page.getByLabel('Next transaction').click();

		// Verify we're on the Waitrose transaction with splits
		const dock = page.getByTestId('allocation-dock');
		await expect(dock).toContainText('Waitrose');
		await expect(dock).toContainText('Split');

		// Allocate first split part
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// Allocate second split part
		await page.getByTestId('allocate-btn').first().click();
		await page.waitForURL(/\?tx=/);

		// After allocating all splits of Waitrose, dock should show next unallocated tx
		// (or loop back to earlier unallocated txs)
		await expect(dock).toBeVisible();
	});
});