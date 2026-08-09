import type { ExternalId } from '~/lib/accounting/core/ids';
import type { CurrencyCode } from '~/lib/accounting/core/types';

export const RUN_SORT_KEYS = [
    'accountingCredentialId',
    'bookingsCount',
    'createdAt',
    'startDate',
    'status',
    'totalEur',
    'unknownsCount',
] as const;

export const RUN_STATUSES = [
    'planned',
    'posting',
    'posted',
    'partial',
    'failed',
] as const;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export interface RunOutcome {
    error?: string;
    externalId?: ExternalId;
    status: 'failed' | 'posted';
}

export type RunSortKey = (typeof RUN_SORT_KEYS)[number];

export type RunStatus = (typeof RUN_STATUSES)[number];

export interface RunSummary {
    bookingsCount: number;
    missingBankCurrencies: CurrencyCode[];
    skippedCurrency: number;
    skippedNoBank: number;
    totalEur: number;
    unknownsCount: number;
}

export type SortDirection = (typeof SORT_DIRECTIONS)[number];
