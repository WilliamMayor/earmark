import { RRule } from 'rrule';
import type { EnvelopeWithStats } from './types.js';

export type GoalType = 'recurring' | 'one_off' | 'open_ended';

export function inferGoalType(envelope: EnvelopeWithStats): GoalType | null {
    if (!envelope.goal_amount) return null;
    if (envelope.goal_rrule) return 'recurring';
    if (envelope.goal_due_date) return 'one_off';
    return 'open_ended';
}

export function getRemainingAmount(envelope: EnvelopeWithStats): number {
    if (!envelope.goal_amount) return 0;
    const remaining = parseFloat(envelope.goal_amount) - envelope.goal_balance;
    return Math.max(0, remaining);
}

/** Returns the next occurrence of a recurring goal on or after today, or null. */
function getNextRecurringDue(envelope: EnvelopeWithStats, today: Date): Date | null {
    if (!envelope.goal_rrule || !envelope.goal_dtstart) return null;
    try {
        const rule = RRule.fromString(
            `DTSTART:${envelope.goal_dtstart.replace(/[-:]/g, '').slice(0, 15)}Z\nRRULE:${envelope.goal_rrule}`
        );
        const next = rule.after(today, true);
        return next ?? null;
    } catch {
        return null;
    }
}

export function getDaysRemaining(envelope: EnvelopeWithStats, today: Date = new Date()): number | null {
    const type = inferGoalType(envelope);
    if (!type || type === 'open_ended') return null;

    let dueDate: Date | null = null;

    if (type === 'one_off' && envelope.goal_due_date) {
        const [y, m, d] = envelope.goal_due_date.split('-').map(Number);
        dueDate = new Date(y, m - 1, d);
    } else if (type === 'recurring') {
        dueDate = getNextRecurringDue(envelope, today);
    }

    if (!dueDate) return null;

    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / msPerDay);
}

export function getRates(
    envelope: EnvelopeWithStats,
    today: Date = new Date()
): { perDay: number; perWeek: number; perMonth: number } | null {
    const type = inferGoalType(envelope);
    if (!type || type === 'open_ended') return null;

    const days = getDaysRemaining(envelope, today);
    if (days === null || days <= 0) return null;

    const remaining = getRemainingAmount(envelope);
    const perDay = remaining / days;
    return {
        perDay,
        perWeek: perDay * 7,
        perMonth: perDay * 30.4375
    };
}

/**
 * Estimates the date by which an open-ended goal will be fully funded, based on the
 * average daily contribution rate since the goal was created.
 *
 * `netContributed` is a separate parameter rather than using `envelope.goal_balance`
 * directly because callers may want to pass a DB-queried net contribution since
 * `goal_created_at` specifically (via `getGoalContribution()`). This value may differ
 * from `goal_balance` if pre-goal allocations exist that should not count toward the
 * rate calculation.
 */
export function getEstimatedCompletion(
    envelope: EnvelopeWithStats,
    netContributed: number,
    today: Date = new Date()
): Date | null {
    if (inferGoalType(envelope) !== 'open_ended') return null;
    if (!envelope.goal_created_at || netContributed <= 0) return null;

    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [y, m, d] = envelope.goal_created_at.split('-').map(Number);
    const createdAt = new Date(y, m - 1, d);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysElapsed = Math.max(1, Math.round((todayMidnight.getTime() - createdAt.getTime()) / msPerDay));

    const avgDailyRate = netContributed / daysElapsed;
    const remaining = getRemainingAmount(envelope);
    if (avgDailyRate <= 0 || remaining <= 0) return null;

    const daysToFinish = Math.ceil(remaining / avgDailyRate);
    const result = new Date(todayMidnight);
    result.setDate(result.getDate() + daysToFinish);
    return result;
}

export function getMilestones(
    envelope: EnvelopeWithStats,
    today: Date = new Date()
): { months: number; monthlyAmount: number; targetDate: Date }[] | null {
    if (inferGoalType(envelope) !== 'open_ended') return null;

    const remaining = getRemainingAmount(envelope);
    return [3, 6, 12].map((months) => {
        const targetDate = new Date(today);
        targetDate.setMonth(targetDate.getMonth() + months);
        return {
            months,
            monthlyAmount: remaining > 0 ? remaining / months : 0,
            targetDate
        };
    });
}

export function formatGoalDescription(envelope: EnvelopeWithStats): string {
    const type = inferGoalType(envelope);
    if (!type || !envelope.goal_amount) return '';

    const amount = envelope.goal_amount;

    if (type === 'open_ended') {
        return `£${amount} · no deadline`;
    }

    if (type === 'one_off' && envelope.goal_due_date) {
        const [y, m, d] = envelope.goal_due_date.split('-').map(Number);
        const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
            .format(new Date(y, m - 1, d));
        return `£${amount} · by ${date}`;
    }

    if (type === 'recurring' && envelope.goal_rrule) {
        try {
            const rule = RRule.fromString(
                envelope.goal_dtstart
                    ? `DTSTART:${envelope.goal_dtstart.replace(/[-:]/g, '').slice(0, 15)}Z\nRRULE:${envelope.goal_rrule}`
                    : `RRULE:${envelope.goal_rrule}`
            );
            return `£${amount} · ${rule.toText()}`;
        } catch {
            return `£${amount} · ${envelope.goal_rrule}`;
        }
    }

    return `£${amount}`;
}

export interface BuildRruleOptions {
    byDay?:      string;
    byMonthDay?: number;
    byMonth?:    number;
    dtstart:     Date;
}

export function buildRrule(
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    options: BuildRruleOptions
): { rrule: string; dtstart: string } {
    const parts: string[] = [`FREQ=${freq}`];

    if (freq === 'WEEKLY' && options.byDay) {
        parts.push(`BYDAY=${options.byDay}`);
    }
    if (freq === 'MONTHLY' && options.byMonthDay !== undefined) {
        parts.push(`BYMONTHDAY=${options.byMonthDay}`);
    }
    if (freq === 'YEARLY') {
        if (options.byMonth !== undefined) parts.push(`BYMONTH=${options.byMonth}`);
        if (options.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${options.byMonthDay}`);
    }

    const dtstart = options.dtstart.toISOString().slice(0, 10);
    return { rrule: parts.join(';'), dtstart };
}
