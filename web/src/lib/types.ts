export interface Account {
	id: number;
	lunchflow_id: number;
	institution_name: string;
	name: string | null;
	currency: string;
	last_synced_at: string | null;
	round_up: boolean;
}

export interface AccountWithStats extends Account {
	unallocated_count: number;
}

export interface Transaction {
	id: number;
	account_id: number;
	lunchflow_id: string | null;
	date: string | null;
	amount: string;
	currency: string;
	credit_debit_indicator: 'CRDT' | 'DBIT';
	status: 'booked' | 'pending' | 'opening_balance';
	merchant: string | null;
	description: string | null;
	note: string | null;
}

export interface Envelope {
	id: number;
	account_id: number;
	name: string;
	sort_order: number;
	created_at: string;
}

export interface EnvelopeWithStats extends Envelope {
	allocated_raw: number;
	allocated_total: string;
	percent_of_total: number;
}

export interface Split {
	id: number;
	transaction_id: number;
	amount: string;
	note: string | null;
	sort_order: number;
	is_round_up: boolean;
}

export interface SplitWithStatus extends Split {
	is_allocated: boolean;
	envelope_id: number | null;
	envelope_name: string | null;
}

export class SplitValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SplitValidationError';
	}
}

export class AlreadyAllocatedError extends Error {
	constructor(splitId: number) {
		super(`Split ${splitId} is already allocated`);
		this.name = 'AlreadyAllocatedError';
	}
}

export class EnvelopeHasAllocationsError extends Error {
	constructor(envelopeId: number) {
		super(`Envelope ${envelopeId} has allocations and cannot be deleted`);
		this.name = 'EnvelopeHasAllocationsError';
	}
}
