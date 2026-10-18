import { z } from 'zod';

import type { propAccount } from '~/server/db/schemas/prop';

import type { StoredFirmId } from './PlanKey';

export enum AccountTracking {
    LedgerOnly = 'ledger-only',
    Modeled = 'modeled',
}

export type AccountRow = typeof propAccount.$inferSelect;

export type LedgerOnlyAccountRow<Row extends TrackedColumns = AccountRow> =
    Omit<Row, TrackedKey> &
        (
            | { readonly externalFirmId: null; readonly firmId: StoredFirmId }
            | { readonly externalFirmId: string; readonly firmId: null }
        ) & {
            readonly planLabel: string;
            readonly planSerial: null;
            readonly tracking: AccountTracking.LedgerOnly;
        };

export type ModeledAccountRow<Row extends TrackedColumns = AccountRow> = Omit<
    Row,
    TrackedKey
> & {
    readonly externalFirmId: null;
    readonly firmId: StoredFirmId;
    readonly planLabel: null;
    readonly planSerial: string;
    readonly tracking: AccountTracking.Modeled;
};

export type TrackedAccountRow<Row extends TrackedColumns = AccountRow> =
    LedgerOnlyAccountRow<Row> | ModeledAccountRow<Row>;

export type TrackedColumns = Omit<
    Pick<AccountRow, 'id' | TrackedKey>,
    'tracking'
> & {
    readonly tracking: string;
};

type TrackedKey =
    'externalFirmId' | 'firmId' | 'planLabel' | 'planSerial' | 'tracking';

export class AccountRowShapeError extends Error {
    constructor(
        readonly accountId: string,
        readonly tracking: string,
        detail: string,
    ) {
        super(
            `Account ${accountId} breaks the ${tracking} account shape: ${detail}`,
        );
        this.name = 'AccountRowShapeError';
    }
}

export function accountShapeProblem(row: TrackedColumns): null | string {
    const tracking = z.enum(AccountTracking).safeParse(row.tracking);
    if (!tracking.success) return 'its tracking value is unknown';
    switch (tracking.data) {
        case AccountTracking.LedgerOnly: {
            return ledgerOnlyProblem(row);
        }
        case AccountTracking.Modeled: {
            return modeledProblem(row);
        }
    }
}

export function isLedgerOnlyAccount<Row extends TrackedColumns>(
    row: TrackedAccountRow<Row>,
): row is LedgerOnlyAccountRow<Row> {
    return row.tracking === AccountTracking.LedgerOnly;
}

export function isModeledAccount<Row extends TrackedColumns>(
    row: TrackedAccountRow<Row>,
): row is ModeledAccountRow<Row> {
    return row.tracking === AccountTracking.Modeled;
}

export function trackedAccountOf<Row extends TrackedColumns>(
    row: Row,
): TrackedAccountRow<Row> {
    if (!hasKnownTracking(row)) {
        throw new AccountRowShapeError(
            row.id,
            row.tracking,
            'its tracking value is unknown',
        );
    }
    const problem = accountShapeProblem(row);
    if (problem !== null) {
        throw new AccountRowShapeError(row.id, row.tracking, problem);
    }
    return row as TrackedAccountRow<Row>;
}

function hasKnownTracking<Row extends TrackedColumns>(
    row: Row,
): row is Row & { readonly tracking: AccountTracking } {
    return z.enum(AccountTracking).safeParse(row.tracking).success;
}

function ledgerOnlyProblem(row: TrackedColumns): null | string {
    if (row.planSerial !== null) return 'it has a plan serial';
    if (row.planLabel === null || row.planLabel === '') {
        return 'it has no plan label';
    }
    return (row.firmId === null) === (row.externalFirmId === null)
        ? 'it needs exactly one of a listed firm and an external firm'
        : null;
}

function modeledProblem(row: TrackedColumns): null | string {
    if (row.firmId === null) return 'it has no firm';
    if (row.planSerial === null) return 'it has no plan serial';
    if (row.planLabel !== null) return 'it has a plan label';
    return row.externalFirmId === null ? null : 'it has an external firm';
}
