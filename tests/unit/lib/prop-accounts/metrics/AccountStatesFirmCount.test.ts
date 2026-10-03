import { describe, expect, it } from 'vitest';

import { FirmCountUnknownReason } from '~/lib/prop-accounts/advice';
import { createAlertContext } from '~/lib/prop-accounts/alerts';
import { firmPayoutCountIn } from '~/lib/prop-accounts/alerts/AlertContext';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    type AccountStateAccountRow,
    AccountStateKind,
    type AccountStatePayoutRow,
    type AccountStateSnapshotRow,
    accountStatesOf,
    type AccountStatesRows,
    AccountStateUnavailableKind,
} from '~/lib/prop-accounts/metrics';
import {
    FirmId,
    MffuVariant,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000010';
const SIBLING_ID = '00000000-0000-4000-8000-000000000011';
const ARCHIVED_ID = '00000000-0000-4000-8000-000000000012';
const ASOF = '2026-09-23';
const PREVIOUS_ASOF = '2026-09-16';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function accountRow(
    overrides: Partial<AccountStateAccountRow> = {},
): AccountStateAccountRow {
    return {
        accountSize: 50_000,
        archivedAt: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        liveStartBalanceCents: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(MFF_PRO_ID),
        purchasedOn: '2026-08-01',
        readIssues: [],
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    };
}

function countsOf(reconstructed: {
    readonly kind: unknown;
    readonly otherAccountsPendingPayoutCount?: number;
    readonly pendingPayoutCount?: number;
}) {
    if (reconstructed.kind === ReconstructedLiveKind.Live) {
        throw new Error('expected a funded or eval account');
    }
    return {
        other: reconstructed.otherAccountsPendingPayoutCount,
        own: reconstructed.pendingPayoutCount,
    };
}

function entryOf(rows: AccountStatesRows) {
    const entry = accountStatesOf(USER_ID, ASOF, rows).find(
        (candidate) => candidate.accountId === ACCOUNT_ID,
    );
    if (entry === undefined) throw new Error('no state for the account');
    return entry;
}

function payoutRow(
    accountId: string,
    overrides: Partial<AccountStatePayoutRow>,
): AccountStatePayoutRow {
    return {
        accountId,
        grossCents: usdCents(50_000),
        netCents: null,
        paidOn: null,
        requestedOn: '2026-09-20',
        status: PayoutStatus.Requested,
        userId: USER_ID,
        ...overrides,
    };
}

function previousSnapshotRow(): AccountStateSnapshotRow {
    return snapshotRow({
        asOf: PREVIOUS_ASOF,
        createdAt: new Date('2026-09-16T12:00:00Z'),
        id: '10000000-0000-4000-8000-000000000002',
    });
}

function rowsOf(overrides: Partial<AccountStatesRows> = {}): AccountStatesRows {
    return {
        accounts: [accountRow()],
        events: [],
        payouts: [],
        snapshots: [snapshotRow()],
        ...overrides,
    };
}

function snapshotRow(
    overrides: Partial<AccountStateSnapshotRow> = {},
): AccountStateSnapshotRow {
    return {
        accountId: ACCOUNT_ID,
        asOf: ASOF,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(5_240_000),
        createdAt: new Date('2026-09-23T12:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(5_300_000),
        highestIntradayBalanceCents: null,
        id: '10000000-0000-4000-8000-000000000001',
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: 0,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 5,
        userId: USER_ID,
        ...overrides,
    };
}

function unreadableArchived(
    overrides: Partial<AccountStateAccountRow> = {},
): AccountStateAccountRow {
    return accountRow({
        archivedAt: new Date('2026-09-10T00:00:00Z'),
        id: ARCHIVED_ID,
        planSerial: null,
        ...overrides,
    });
}

describe('an unknown firm count is a typed reason on the account state (PT-36n, F-145)', () => {
    it('makes the state unavailable while an archived account at the firm cannot be read', () => {
        const entry = entryOf(
            rowsOf({ accounts: [accountRow(), unreadableArchived()] }),
        );
        expect(entry.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: {
                kind: AccountStateUnavailableKind.FirmCountUnknown,
                reason: FirmCountUnknownReason.UnreadableAccount,
            },
        });
    });

    it('makes the state unavailable while a sibling payout has a malformed date', () => {
        const entry = entryOf(
            rowsOf({
                accounts: [accountRow(), accountRow({ id: SIBLING_ID })],
                payouts: [payoutRow(SIBLING_ID, { requestedOn: 'sometime' })],
            }),
        );
        expect(entry.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: {
                kind: AccountStateUnavailableKind.FirmCountUnknown,
                reason: FirmCountUnknownReason.InvalidDate,
            },
        });
    });

    it('makes the state unavailable while a live move at the firm has a malformed date', () => {
        const entry = entryOf(
            rowsOf({
                events: [
                    {
                        accountId: ACCOUNT_ID,
                        kind: AccountEventKind.MovedLive,
                        occurredOn: 'sometime',
                        userId: USER_ID,
                    },
                ],
            }),
        );
        expect(entry.state).toMatchObject({
            reason: {
                kind: AccountStateUnavailableKind.FirmCountUnknown,
                reason: FirmCountUnknownReason.InvalidDate,
            },
        });
    });

    it('says the same as the alert context for the same rows: the count is unknown on both', () => {
        const rows = rowsOf({
            accounts: [accountRow(), unreadableArchived()],
        });
        const context = createAlertContext({
            accounts: rows.accounts.map((row) => ({
                ...row,
                copyGroupId: null,
                label: row.id,
            })),
            accountStates: [],
            copyGroups: [],
            payouts: rows.payouts,
            rulebook: DEFAULT_RULEBOOK,
            snapshots: [],
            today: ASOF,
        });
        expect(firmPayoutCountIn(context, FirmId.Mffu)).toBeNull();
        expect(entryOf(rows).state.kind).toBe(AccountStateKind.Unavailable);
    });

    it('keeps the state while the unreadable archived account belongs to no firm', () => {
        const entry = entryOf(
            rowsOf({
                accounts: [accountRow(), unreadableArchived({ firmId: null })],
            }),
        );
        expect(entry.state.kind).toBe(AccountStateKind.Reconstructed);
    });

    it('does not let another firm unreadable account make the count unknown', () => {
        const entry = entryOf(
            rowsOf({
                accounts: [
                    accountRow(),
                    unreadableArchived({ firmId: FirmId.TopStep }),
                ],
            }),
        );
        expect(entry.state.kind).toBe(AccountStateKind.Reconstructed);
    });
});

function reconstructedCountsOf(rows: AccountStatesRows) {
    const { state } = entryOf(rows);
    if (state.kind !== AccountStateKind.Reconstructed) {
        throw new Error('expected a reconstructed state');
    }
    if (state.previous === null) {
        throw new Error('expected a previous reconstruction');
    }
    return {
        latest: countsOf(state.latest.reconstructed),
        previous: countsOf(state.previous.reconstructed),
    };
}

function withSibling(
    payouts: readonly AccountStatePayoutRow[],
): AccountStatesRows {
    return rowsOf({
        accounts: [accountRow(), accountRow({ id: SIBLING_ID })],
        payouts,
        snapshots: [
            snapshotRow(),
            previousSnapshotRow(),
            snapshotRow({
                accountId: SIBLING_ID,
                id: '10000000-0000-4000-8000-000000000099',
            }),
        ],
    });
}

describe('the previous reconstruction counts the firm payouts at the previous snapshot date (PT-36n, F-145)', () => {
    it('does not count a sibling request made after the previous snapshot', () => {
        const counts = reconstructedCountsOf(
            withSibling([payoutRow(SIBLING_ID, { requestedOn: '2026-09-20' })]),
        );
        expect(counts.latest.other).toBe(1);
        expect(counts.previous.other).toBe(0);
    });

    it('counts a request made before the previous snapshot and paid after it as pending then', () => {
        const counts = reconstructedCountsOf(
            withSibling([
                payoutRow(SIBLING_ID, {
                    paidOn: '2026-09-20',
                    requestedOn: '2026-09-10',
                    status: PayoutStatus.Paid,
                }),
            ]),
        );
        expect(counts.latest.other).toBe(0);
        expect(counts.previous.other).toBe(1);
    });

    it('counts the account own request at the previous date the same way', () => {
        const counts = reconstructedCountsOf(
            rowsOf({
                payouts: [
                    payoutRow(ACCOUNT_ID, {
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
                snapshots: [snapshotRow(), previousSnapshotRow()],
            }),
        );
        expect(counts.latest.own).toBe(0);
        expect(counts.previous.own).toBe(1);
    });
});
