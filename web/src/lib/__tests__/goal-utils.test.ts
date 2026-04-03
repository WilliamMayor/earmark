import { describe, it, expect } from 'vitest';
import {
    inferGoalType,
    getRemainingAmount,
    getDaysRemaining,
    getRates,
    getEstimatedCompletion,
    getMilestones,
    formatGoalDescription,
    buildRrule
} from '../goal-utils.js';
import type { EnvelopeWithStats } from '../types.js';

function makeEnvelope(overrides: Partial<EnvelopeWithStats> = {}): EnvelopeWithStats {
    return {
        id: 1,
        account_id: 1,
        name: 'Test',
        sort_order: 0,
        created_at: '2026-01-01',
        goal_amount: null,
        goal_rrule: null,
        goal_dtstart: null,
        goal_due_date: null,
        goal_created_at: null,
        allocated_raw: 0,
        allocated_total: '0.00',
        percent_of_total: 0,
        goal_balance: 0,
        ...overrides
    };
}

describe('inferGoalType', () => {
    it('returns null when no goal set', () => {
        expect(inferGoalType(makeEnvelope())).toBeNull();
    });
    it('returns recurring when goal_rrule is set', () => {
        expect(inferGoalType(makeEnvelope({
            goal_amount: '30.00',
            goal_rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
            goal_dtstart: '2026-05-05'
        }))).toBe('recurring');
    });
    it('returns one_off when goal_due_date is set without rrule', () => {
        expect(inferGoalType(makeEnvelope({
            goal_amount: '500.00',
            goal_due_date: '2026-08-01'
        }))).toBe('one_off');
    });
    it('returns open_ended when only goal_amount is set', () => {
        expect(inferGoalType(makeEnvelope({ goal_amount: '1000.00' }))).toBe('open_ended');
    });
});

describe('getRemainingAmount', () => {
    it('returns goal_amount minus goal_balance', () => {
        const e = makeEnvelope({ goal_amount: '30.00', goal_balance: 20 });
        expect(getRemainingAmount(e)).toBeCloseTo(10);
    });
    it('returns 0 when goal_balance meets or exceeds goal_amount', () => {
        const e = makeEnvelope({ goal_amount: '30.00', goal_balance: 35 });
        expect(getRemainingAmount(e)).toBe(0);
    });
    it('returns 0 when no goal set', () => {
        expect(getRemainingAmount(makeEnvelope())).toBe(0);
    });
});

describe('getDaysRemaining', () => {
    it('returns null when no goal set', () => {
        expect(getDaysRemaining(makeEnvelope(), new Date('2026-05-01'))).toBeNull();
    });
    it('returns null for open_ended goals', () => {
        const e = makeEnvelope({ goal_amount: '1000.00' });
        expect(getDaysRemaining(e, new Date('2026-05-01'))).toBeNull();
    });
    it('returns days until due_date for one_off goal', () => {
        const e = makeEnvelope({ goal_amount: '500.00', goal_due_date: '2026-08-01' });
        const days = getDaysRemaining(e, new Date('2026-05-01'));
        expect(days).toBe(92); // May 31 + Jun 30 + Jul 31 = 92
    });
    it('returns days until next rrule occurrence for recurring goal', () => {
        // Monthly on the 5th; today is 1 Apr 2026 → next is 5 Apr = 4 days
        const e = makeEnvelope({
            goal_amount: '30.00',
            goal_rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
            goal_dtstart: '2026-04-05T00:00:00Z'
        });
        const days = getDaysRemaining(e, new Date('2026-04-01'));
        expect(days).toBe(4);
    });
});

describe('getRates', () => {
    it('returns null for open_ended goals', () => {
        const e = makeEnvelope({ goal_amount: '1000.00' });
        expect(getRates(e, new Date('2026-05-01'))).toBeNull();
    });
    it('returns null when no days remaining', () => {
        const e = makeEnvelope({ goal_amount: '30.00', goal_due_date: '2026-04-30' });
        expect(getRates(e, new Date('2026-04-30'))).toBeNull();
    });
    it('calculates correct rates for a one_off goal', () => {
        const e = makeEnvelope({
            goal_amount: '30.00',
            goal_due_date: '2026-06-02',
            goal_balance: 20
        });
        const rates = getRates(e, new Date('2026-05-01'));
        expect(rates).not.toBeNull();
        expect(rates!.perDay).toBeCloseTo(10 / 32, 4);
        expect(rates!.perWeek).toBeCloseTo((10 / 32) * 7, 4);
        expect(rates!.perMonth).toBeCloseTo((10 / 32) * 30.4375, 4);
    });
    it('returns zeroed rates when goal is already funded', () => {
        const e = makeEnvelope({
            goal_amount: '30.00',
            goal_due_date: '2026-06-01',
            goal_balance: 35
        });
        const rates = getRates(e, new Date('2026-05-01'));
        expect(rates!.perDay).toBe(0);
        expect(rates!.perWeek).toBe(0);
        expect(rates!.perMonth).toBe(0);
    });
});

describe('getEstimatedCompletion', () => {
    it('returns null for non-open_ended goals', () => {
        const e = makeEnvelope({ goal_amount: '30.00', goal_due_date: '2026-08-01' });
        expect(getEstimatedCompletion(e, 100, new Date('2026-05-01'))).toBeNull();
    });
    it('returns null when netContributed is 0', () => {
        const e = makeEnvelope({ goal_amount: '1000.00', goal_created_at: '2026-01-01' });
        expect(getEstimatedCompletion(e, 0, new Date('2026-05-01'))).toBeNull();
    });
    it('estimates completion date based on contribution rate', () => {
        const e = makeEnvelope({
            goal_amount: '1000.00',
            goal_created_at: '2026-01-01',
            goal_balance: 320
        });
        const result = getEstimatedCompletion(e, 320, new Date('2026-05-01'));
        expect(result).not.toBeNull();
        // 320 contributed over 120 days (Jan 1–May 1) → ~2.67/day
        // 680 remaining / 2.67/day ≈ 255 days → early Jan 2027
        expect(result! > new Date('2026-05-01')).toBe(true);
    });
});

describe('getMilestones', () => {
    it('returns null for non-open_ended goals', () => {
        const e = makeEnvelope({ goal_amount: '30.00', goal_due_date: '2026-08-01' });
        expect(getMilestones(e, new Date('2026-05-01'))).toBeNull();
    });
    it('returns 3, 6, and 12 month milestones', () => {
        const e = makeEnvelope({ goal_amount: '1000.00', goal_balance: 320 });
        const milestones = getMilestones(e, new Date('2026-05-01'));
        expect(milestones).toHaveLength(3);
        expect(milestones![0].months).toBe(3);
        expect(milestones![0].monthlyAmount).toBeCloseTo(680 / 3, 2);
        expect(milestones![1].months).toBe(6);
        expect(milestones![1].monthlyAmount).toBeCloseTo(680 / 6, 2);
        expect(milestones![2].months).toBe(12);
        expect(milestones![2].monthlyAmount).toBeCloseTo(680 / 12, 2);
    });
    it('returns zero monthly amounts when goal is already met', () => {
        const e = makeEnvelope({ goal_amount: '1000.00', goal_balance: 1200 });
        const milestones = getMilestones(e, new Date('2026-05-01'));
        milestones!.forEach((m) => expect(m.monthlyAmount).toBe(0));
    });
});

describe('formatGoalDescription', () => {
    it('returns empty string when no goal', () => {
        expect(formatGoalDescription(makeEnvelope())).toBe('');
    });
    it('formats recurring goal description', () => {
        const e = makeEnvelope({
            goal_amount: '30.00',
            goal_rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
            goal_dtstart: '2026-05-05T00:00:00Z'
        });
        const desc = formatGoalDescription(e);
        expect(desc).toContain('30.00');
        expect(desc.toLowerCase()).toMatch(/month/);
    });
    it('formats one_off goal description', () => {
        const e = makeEnvelope({ goal_amount: '500.00', goal_due_date: '2026-08-01' });
        const desc = formatGoalDescription(e);
        expect(desc).toContain('500.00');
        expect(desc).toContain('2026');
    });
    it('formats open_ended goal description', () => {
        const e = makeEnvelope({ goal_amount: '1000.00' });
        const desc = formatGoalDescription(e);
        expect(desc).toContain('1000.00');
        expect(desc.toLowerCase()).toContain('no deadline');
    });
});

describe('buildRrule', () => {
    it('builds a daily rrule', () => {
        const { rrule } = buildRrule('DAILY', { dtstart: new Date('2026-05-01') });
        expect(rrule).toBe('FREQ=DAILY');
    });
    it('builds a weekly rrule with BYDAY', () => {
        const { rrule } = buildRrule('WEEKLY', { byDay: 'MO', dtstart: new Date('2026-05-04') });
        expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    });
    it('builds a monthly rrule with BYMONTHDAY', () => {
        const { rrule } = buildRrule('MONTHLY', { byMonthDay: 5, dtstart: new Date('2026-05-05') });
        expect(rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=5');
    });
    it('builds a yearly rrule with BYMONTH and BYMONTHDAY', () => {
        const { rrule } = buildRrule('YEARLY', { byMonth: 8, byMonthDay: 1, dtstart: new Date('2026-08-01') });
        expect(rrule).toBe('FREQ=YEARLY;BYMONTH=8;BYMONTHDAY=1');
    });
    it('returns dtstart as ISO date string', () => {
        const { dtstart } = buildRrule('DAILY', { dtstart: new Date('2026-05-01') });
        expect(dtstart).toMatch(/^2026-05-01/);
    });
});
