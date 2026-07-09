import type { ExternalId } from '~/lib/accounting/core/ids';
import type { CurrencyCode } from '~/lib/accounting/core/types';

export const RUN_STATUSES = [
    'planned',
    'posting',
    'posted',
    'partial',
    'failed',
] as const;
export interface RunOutcome {
    error?: string;
    externalId?: ExternalId;
    status: 'failed' | 'posted';
}

export type RunStatus = (typeof RUN_STATUSES)[number];

export interface RunSummary {
    bookingsCount: number;
    missingBankCurrencies: CurrencyCode[];
    skippedCurrency: number;
    skippedNoBank: number;
    totalEur: number;
    unknownsCount: number;
}
