import { describe, expect, it } from 'vitest';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    type AccountStateAccountRow,
    AccountStateKind,
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
    TradingPhase,
} from '~/lib/prop-calculator';
import { ReconstructionErrorReason } from '~/lib/prop-calculator/advisor';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000010';
const ASOF = '2026-09-23';

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

function rowsOf(
    overrides: Partial<AccountStatesRows> = {},
): AccountStatesRows {
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

describe('accountStatesOf', () => {
    it('reconstructs the latest and previous snapshot of a modeled account exactly once', () => {
        const previous = snapshotRow({
            asOf: '2026-09-16',
            balanceCents: usdCents(5_120_000),
            highestEodBalanceCents: usdCents(5_190_000),
            id: '10000000-0000-4000-8000-000000000002',
            tradingDays: 2,
        });
        const latest = snapshotRow();
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({ snapshots: [latest, previous] }),
        );
        if (entry === undefined) throw new Error('expected one entry');
        expect(entry.accountId).toBe(ACCOUNT_ID);
        if (entry.state.kind !== AccountStateKind.Reconstructed) {
            throw new Error(
                `expected a reconstructed state, got ${JSON.stringify(entry.state)}`,
            );
        }
        expect(entry.state.latest.reconstructed.kind).toBe(TradingPhase.Funded);
        expect(entry.state.latest.asOf).toBe(ASOF);
        expect(entry.state.previous?.asOf).toBe('2026-09-16');
        expect(entry.state.previous?.reconstructed.kind).toBe(
            TradingPhase.Funded,
        );
        expect(entry.state.plan.id).toEqual(MFF_PRO_ID);
    });

    it('skips a ledger-only account with a typed reason instead of reconstructing it', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({
                accounts: [
                    accountRow({
                        planLabel: 'Manual 50K',
                        planSerial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                ],
            }),
        );
        expect(entry?.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: { kind: AccountStateUnavailableKind.LedgerOnly },
        });
    });

    it('skips an account whose plan cannot be resolved, with the unresolved reason attached', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({
                accounts: [accountRow({ firmId: 'no-such-firm' })],
            }),
        );
        if (entry?.state.kind !== AccountStateKind.Unavailable) {
            throw new Error('expected an unavailable state');
        }
        expect(entry.state.reason.kind).toBe(
            AccountStateUnavailableKind.UnresolvedPlan,
        );
    });

    it('skips an account with corrupt opt-ins instead of throwing', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({
                accounts: [
                    accountRow({
                        optIns: [1, 2] as unknown as AccountStateAccountRow['optIns'],
                    }),
                ],
            }),
        );
        expect(entry?.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: {
                kind: AccountStateUnavailableKind.UnresolvedPlan,
                reason: 'corrupt-opt-ins',
            },
        });
    });

    it('reports no snapshot instead of reconstructing a snapshot-less account', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({ snapshots: [] }),
        );
        expect(entry?.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: { kind: AccountStateUnavailableKind.NoSnapshot },
        });
    });

    it('ignores a snapshot owned by another user, as if it never existed', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({
                snapshots: [snapshotRow({ userId: OTHER_USER_ID })],
            }),
        );
        expect(entry?.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: { kind: AccountStateUnavailableKind.NoSnapshot },
        });
    });

    it('excludes archived accounts entirely, rather than reporting them as unavailable', () => {
        const archivedAt = new Date('2026-09-01T00:00:00Z');
        const archived = accountRow({ archivedAt });
        const entries = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({ accounts: [archived] }),
        );
        expect(entries).toEqual([]);
    });

    it('turns a peak-required reconstruction error into a typed reason instead of throwing', () => {
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({
                snapshots: [snapshotRow({ highestEodBalanceCents: null })],
            }),
        );
        expect(entry?.state).toEqual({
            kind: AccountStateKind.Unavailable,
            reason: {
                kind: AccountStateUnavailableKind.ReconstructionError,
                reason: ReconstructionErrorReason.EodPeakRequired,
            },
        });
    });

    it('drops only the previous snapshot when it alone fails to reconstruct, keeping the latest', () => {
        const previous = snapshotRow({
            asOf: '2026-09-16',
            highestEodBalanceCents: null,
            id: '10000000-0000-4000-8000-000000000002',
        });
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({ snapshots: [snapshotRow(), previous] }),
        );
        if (entry?.state.kind !== AccountStateKind.Reconstructed) {
            throw new Error('expected a reconstructed state');
        }
        expect(entry.state.previous).toBeNull();
        expect(entry.state.latest.reconstructed.kind).toBe(TradingPhase.Funded);
    });

    it('reports an impossible snapshot as unavailable before ever reconstructing it', () => {
        const implausible = snapshotRow({
            balanceCents: usdCents(5_200_000),
            dashboardFloorCents: usdCents(5_300_000),
        });
        const [entry] = accountStatesOf(
            USER_ID,
            ASOF,
            rowsOf({ snapshots: [implausible] }),
        );
        if (entry?.state.kind !== AccountStateKind.Unavailable) {
            throw new Error('expected an unavailable state');
        }
        expect(entry.state.reason.kind).toBe(
            AccountStateUnavailableKind.ImplausibleSnapshot,
        );
        if (entry.state.reason.kind !== AccountStateUnavailableKind.ImplausibleSnapshot) {
            throw new Error('unreachable');
        }
        expect(entry.state.reason.issues.length).toBeGreaterThan(0);
    });

    it('never counts a plan resolved for one user against another user\'s query', () => {
        const entries = accountStatesOf(
            OTHER_USER_ID,
            ASOF,
            rowsOf(),
        );
        expect(entries).toEqual([]);
    });
});
