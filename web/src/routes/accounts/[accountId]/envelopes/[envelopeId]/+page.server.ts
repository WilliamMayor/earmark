import { error, fail, redirect } from '@sveltejs/kit';
import {
    getAccount,
    getEnvelope,
    setGoal,
    removeGoal,
    getGoalContribution,
    renameEnvelope,
    deleteEnvelope
} from '$lib/queries.js';
import { EnvelopeHasAllocationsError } from '$lib/types.js';

export function load({ params }) {
    const accountId  = parseInt(params.accountId,  10);
    const envelopeId = parseInt(params.envelopeId, 10);

    const account = getAccount(accountId);
    if (!account) error(404, 'Account not found');

    const envelope = getEnvelope(envelopeId);
    if (!envelope || envelope.account_id !== accountId) error(404, 'Envelope not found');

    const netContributed = envelope.goal_created_at
        ? getGoalContribution(envelopeId, envelope.goal_created_at)
        : 0;

    return { account, envelope, netContributed };
}

export const actions = {
    set_goal: async ({ request, params }) => {
        const envelopeId = parseInt(params.envelopeId, 10);
        const data = await request.formData();

        const goalType = data.get('goal_type') as string;
        const amount   = (data.get('amount') as string)?.trim();

        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return fail(400, { error: 'A valid target amount is required' });
        }
        const normalizedAmount = parsedAmount.toFixed(2);

        if (goalType === 'recurring') {
            const rrule   = (data.get('rrule')   as string)?.trim() || null;
            const dtstart = (data.get('dtstart') as string)?.trim() || null;
            if (!rrule || !dtstart) return fail(400, { error: 'Recurrence rule and start date are required' });
            setGoal(envelopeId, { amount: normalizedAmount, rrule, dtstart, dueDate: null });
        } else if (goalType === 'one_off') {
            const dueDate = (data.get('due_date') as string)?.trim() || null;
            if (!dueDate) return fail(400, { error: 'A due date is required' });
            setGoal(envelopeId, { amount: normalizedAmount, rrule: null, dtstart: null, dueDate });
        } else if (goalType === 'open_ended') {
            setGoal(envelopeId, { amount: normalizedAmount, rrule: null, dtstart: null, dueDate: null });
        } else {
            return fail(400, { error: 'Invalid goal type' });
        }

        redirect(303, `/accounts/${params.accountId}/envelopes/${envelopeId}`);
    },

    remove_goal: async ({ params }) => {
        const envelopeId = parseInt(params.envelopeId, 10);
        removeGoal(envelopeId);
        redirect(303, `/accounts/${params.accountId}/envelopes/${envelopeId}`);
    },

    rename_envelope: async ({ request, params }) => {
        const envelopeId = parseInt(params.envelopeId, 10);
        const data = await request.formData();
        const name = (data.get('name') as string)?.trim();

        if (!name) return fail(400, { error: 'Envelope name is required' });

        renameEnvelope(envelopeId, name);
        redirect(303, `/accounts/${params.accountId}/envelopes/${envelopeId}`);
    },

    delete_envelope: async ({ params }) => {
        const accountId  = parseInt(params.accountId, 10);
        const envelopeId = parseInt(params.envelopeId, 10);

        try {
            deleteEnvelope(envelopeId);
        } catch (err) {
            if (err instanceof EnvelopeHasAllocationsError) {
                return fail(409, { error: err.message });
            }
            throw err;
        }

        redirect(303, `/accounts/${accountId}`);
    }
};
