import { test, expect } from '@playwright/test';

async function getSplitUrl(page: import('@playwright/test').Page): Promise<string> {
	// Navigate to account and go to the pre-split transaction (tx3: Waitrose £20.00)
	// tx3 is at index 2 in the unallocated queue (tx1, tx2, tx3)
	await page.goto('/accounts');
	const href = await page.getByTestId('account-card').first().getAttribute('href');
	return `${href}/split?tx=3`; // tx id 3 from fixture (Waitrose)
}

test.describe('Split definition (Screen 4 — define mode)', () => {
	test('navigating to split for a simple transaction shows define form', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');

		// Go to split for tx1 (Tesco £18.50 — unsplit so far, has default split)
		await page.goto(`${href}/split?tx=1`);
		await expect(page.getByTestId('split-form')).toBeVisible();
	});

	test('save button is disabled until amounts sum correctly', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');
		await page.goto(`${href}/split?tx=1`);

		const saveBtn = page.getByTestId('save-splits-btn');
		await expect(saveBtn).toBeDisabled();

		// Fill in amounts that don't match (£10 + £10 ≠ £18.50)
		const inputs = page.getByTestId('split-amount-input');
		await inputs.nth(0).fill('10.00');
		await inputs.nth(1).fill('10.00');
		await expect(saveBtn).toBeDisabled();

		// Correct amounts
		await inputs.nth(0).fill('8.00');
		await inputs.nth(1).fill('10.50');
		await expect(saveBtn).toBeEnabled();
	});

	test('saving splits transitions to allocate mode', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');
		await page.goto(`${href}/split?tx=1`);

		const inputs = page.getByTestId('split-amount-input');
		await inputs.nth(0).fill('8.00');
		await inputs.nth(1).fill('10.50');
		await page.getByTestId('save-splits-btn').click();

		// Now in allocate mode — split parts should be visible
		await expect(page.getByTestId('split-allocate-view')).toBeVisible();
		await expect(page.getByTestId('split-part')).toHaveCount(2);
	});

	test('add part button adds a row', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');
		await page.goto(`${href}/split?tx=1`);

		const before = await page.getByTestId('split-amount-input').count();
		await page.getByRole('button', { name: /Add part/ }).click();
		expect(await page.getByTestId('split-amount-input').count()).toBe(before + 1);
	});
});

test.describe('Split allocation (Screen 5 — allocate mode)', () => {
	test('pre-split transaction (Waitrose) shows in allocate mode', async ({ page }) => {
		// tx3 (Waitrose £20) is pre-seeded with 2 splits in fixture
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');

		// Navigate to the Waitrose transaction which is index 2 in the unallocated queue
		await page.goto(`${href}?tx=2`);
		const dock = page.getByTestId('allocation-dock');
		await expect(dock).toContainText('Waitrose');
		await expect(dock).toContainText('Split');
	});

	test('allocating all split parts returns to account page', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');
		await page.goto(`${href}/split?tx=3`);

		// Should already be in allocate mode (pre-seeded split)
		await expect(page.getByTestId('split-allocate-view')).toBeVisible();

		// Allocate first part
		await page.getByTestId('split-allocate-btn').first().click();
		await page.waitForURL(/split\?tx=3/);

		// One part left — allocate it
		await page.getByTestId('split-allocate-btn').first().click();

		// All allocated — redirected to accounts page
		await expect(page).toHaveURL(/\/accounts\/\d+/);
		await expect(page).not.toHaveURL(/split/);
	});

	test('undo split resets to single default split', async ({ page }) => {
		await page.goto('/accounts');
		const href = await page.getByTestId('account-card').first().getAttribute('href');
		await page.goto(`${href}/split?tx=3`);

		await expect(page.getByTestId('split-allocate-view')).toBeVisible();
		await page.getByRole('button', { name: /Undo split/ }).click();

		// Redirected back to account page
		await expect(page).toHaveURL(/\/accounts\/\d+\?tx=/);
		await expect(page).not.toHaveURL(/split/);
	});
});
