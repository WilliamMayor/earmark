import { test, expect } from '@playwright/test';
import { resetFixtureDb } from './helpers/seed.js';

test.beforeEach(() => resetFixtureDb());

test.describe('Transactions page', () => {
	test('renders transactions tab on an account', async ({ page }) => {
		await page.goto('/accounts');
		await page.getByTestId('account-card').first().click();
		await page.getByTestId('tab-transactions').click();
		await expect(page).toHaveURL(/\/accounts\/\d+\/transactions/);
	});

	test('shows empty state when account has no transactions', async ({ page }) => {
		await page.goto('/accounts');
		await page.getByRole('button', { name: '+ New account' }).click();
		await page.getByLabel('Institution name').fill('Empty Bank');
		await page.getByRole('button', { name: 'Create' }).click();

		await page.getByTestId('account-card').filter({ hasText: 'Empty Bank' }).click();
		await page.getByTestId('tab-transactions').click();

		await expect(page.getByText('No transactions yet.')).toBeVisible();
	});

	test('adds a debit transaction and shows it with negative amount', async ({ page }) => {
		await page.goto('/accounts');
		await page.getByTestId('account-card').first().click();
		await page.getByTestId('tab-transactions').click();

		await page.getByRole('button', { name: '+ Add transaction' }).click();
		await page.getByLabel('Description').fill('Coffee');
		await page.getByLabel('Amount').fill('-3.50');
		await page.getByLabel('Merchant').fill('Pret');
		await page.getByRole('button', { name: 'Add' }).click();

		const row = page.getByTestId('transaction-row').filter({ hasText: 'Pret' });
		await expect(row).toBeVisible();
		await expect(row.getByTestId('transaction-amount')).toContainText('-£3.50');
	});

	test('adds a credit transaction and shows positive amount', async ({ page }) => {
		await page.goto('/accounts');
		await page.getByTestId('account-card').first().click();
		await page.getByTestId('tab-transactions').click();

		await page.getByRole('button', { name: '+ Add transaction' }).click();
		await page.getByLabel('Description').fill('Refund');
		await page.getByLabel('Amount').fill('15.00');
		await page.getByRole('button', { name: 'Add' }).click();

		const row = page.getByTestId('transaction-row').filter({ hasText: 'Refund' });
		await expect(row.getByTestId('transaction-amount')).toContainText('£15.00');
	});
});
