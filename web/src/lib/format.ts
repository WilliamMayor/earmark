/**
 * Format a currency amount string for display.
 * Amount is an unsigned decimal string (e.g. "18.50"); currency is an ISO 4217 code.
 */
export function formatCurrency(amount: string, currency: string): string {
	const num = parseFloat(amount);
	return new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(num);
}

/**
 * Format a signed currency amount for display, prefixing debits with '-'.
 * Amount is an unsigned decimal string; indicator is 'DBIT' or 'CRDT'.
 */
export function formatSignedCurrency(amount: string, currency: string, indicator: string): string {
	return (indicator === 'DBIT' ? '-' : '') + formatCurrency(amount, currency);
}

/**
 * Format an ISO date string (YYYY-MM-DD) for display.
 */
export function formatDate(isoDate: string | null): string {
	if (!isoDate) return '—';
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(year, month - 1, day));
}

/**
 * Add decimal amount strings using integer minor-unit arithmetic to avoid float drift.
 * All inputs must be non-negative decimal strings (e.g. "10.50", "0.10").
 * Returns a two-decimal-place string.
 */
export function sumAmounts(amounts: string[]): string {
	const total = amounts.reduce((acc, a) => acc + toMinorUnits(a), 0);
	return fromMinorUnits(total);
}

/**
 * Compare two decimal amount strings for equality after normalisation.
 */
export function amountsMatch(a: string, b: string): boolean {
	return toMinorUnits(a) === toMinorUnits(b);
}

/**
 * Convert a decimal string to integer minor units (pence/cents).
 * Handles strings like "10", "10.5", "10.50".
 */
export function toMinorUnits(amount: string): number {
	const [intPart, fracPart = ''] = amount.split('.');
	const pence = fracPart.padEnd(2, '0').slice(0, 2);
	return parseInt(intPart, 10) * 100 + parseInt(pence, 10);
}

/**
 * Convert integer minor units back to a two-decimal-place string.
 */
export function fromMinorUnits(minorUnits: number): string {
	const pounds = Math.floor(minorUnits / 100);
	const pence = minorUnits % 100;
	return `${pounds}.${String(pence).padStart(2, '0')}`;
}
