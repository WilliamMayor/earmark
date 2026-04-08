import { describe, it, expect } from 'vitest';
import { sumAmounts, amountsMatch, toMinorUnits, fromMinorUnits, formatDate, formatSignedCurrency } from '../format.js';

describe('toMinorUnits', () => {
	it('converts whole numbers', () => {
		expect(toMinorUnits('10')).toBe(1000);
	});

	it('converts decimal strings', () => {
		expect(toMinorUnits('10.50')).toBe(1050);
		expect(toMinorUnits('0.10')).toBe(10);
		expect(toMinorUnits('0.01')).toBe(1);
	});

	it('handles single decimal place', () => {
		expect(toMinorUnits('10.5')).toBe(1050);
	});
});

describe('fromMinorUnits', () => {
	it('converts minor units to decimal string', () => {
		expect(fromMinorUnits(1050)).toBe('10.50');
		expect(fromMinorUnits(10)).toBe('0.10');
		expect(fromMinorUnits(1)).toBe('0.01');
	});
});

describe('sumAmounts', () => {
	it('sums correctly without float drift', () => {
		// Classic float problem: 0.1 + 0.2 !== 0.3 in floating point
		expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
	});

	it('sums multiple amounts', () => {
		expect(sumAmounts(['10.00', '5.50', '2.25'])).toBe('17.75');
	});

	it('handles empty array', () => {
		expect(sumAmounts([])).toBe('0.00');
	});

	it('sums to exactly the transaction amount (split validation scenario)', () => {
		expect(sumAmounts(['8.00', '10.50'])).toBe('18.50');
	});
});

describe('amountsMatch', () => {
	it('matches equal amounts', () => {
		expect(amountsMatch('10.50', '10.50')).toBe(true);
	});

	it('matches amounts that differ only in trailing zeros', () => {
		expect(amountsMatch('10.5', '10.50')).toBe(true);
		expect(amountsMatch('10', '10.00')).toBe(true);
	});

	it('does not match different amounts', () => {
		expect(amountsMatch('10.50', '10.51')).toBe(false);
		expect(amountsMatch('10.00', '9.99')).toBe(false);
	});
});

describe('formatSignedCurrency', () => {
	it('prefixes debit amounts with a minus sign', () => {
		expect(formatSignedCurrency('18.50', 'GBP', 'DBIT')).toMatch(/^-/);
	});

	it('does not prefix credit amounts', () => {
		expect(formatSignedCurrency('10.00', 'GBP', 'CRDT')).not.toMatch(/^-/);
	});

	it('includes the formatted amount for debits', () => {
		const result = formatSignedCurrency('18.50', 'GBP', 'DBIT');
		expect(result).toContain('18.50');
	});

	it('includes the formatted amount for credits', () => {
		const result = formatSignedCurrency('10.00', 'GBP', 'CRDT');
		expect(result).toContain('10.00');
	});
});

describe('formatDate', () => {
	it('returns em-dash for null', () => {
		expect(formatDate(null)).toBe('—');
	});

	it('formats a date string', () => {
		const result = formatDate('2026-03-24');
		expect(result).toContain('2026');
		expect(result).toContain('24');
	});
});
