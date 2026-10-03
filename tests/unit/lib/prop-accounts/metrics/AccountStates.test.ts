import { describe, expect, it } from 'vitest';

import { firmPayoutCounts } from '~/lib/prop-accounts/advice';
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
    type AccountStateEventRow,
    AccountStateKind,
    type AccountStatePayoutRow,
    type AccountStateSnapshotRow,
    accountStatesOf,
    type AccountStatesRows,
    AccountStateUnavailableKind,
    PortfolioLedger,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmId,
    MffuVariant,
    type PlanId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    ReconstructedLiveKind,
    ReconstructionErrorReason,
} from '~/lib/prop-calculator/advisor';

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

    it("carries the account's personal max risk per trade into the reconstruction", () => {
        const maxRiskPerTradeCents = usdCents(20_000);
        const rows = rowsOf({
            accounts: [accountRow({ personalRules: { maxRiskPerTradeCents } })],
        });
        const [entry] = accountStatesOf(USER_ID, ASOF, rows);
        if (entry === undefined) throw new Error('expected one entry');
        if (entry.state.kind !== AccountStateKind.Reconstructed) {
            throw new Error(
                `expected a reconstructed state, got ${JSON.stringify(entry.state)}`,
            );
        }
        if (entry.state.latest.reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(entry.state.latest.reconstructed.personalMaxRiskPerTrade).toBe(
            200,
        );
    });

    it('leaves the personal max risk per trade null without personal rules', () => {
        const [entry] = accountStatesOf(USER_ID, ASOF, rowsOf());
        if (entry === undefined) throw new Error('expected one entry');
        if (entry.state.kind !== AccountStateKind.Reconstructed) {
            throw new Error(
                `expected a reconstructed state, got ${JSON.stringify(entry.state)}`,
            );
        }
        if (entry.state.latest.reconstructed.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded reconstruction');
        }
        expect(
            entry.state.latest.reconstructed.personalMaxRiskPerTrade,
        ).toBeNull();
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
                        optIns: [
                            1, 2,
                        ] as unknown as AccountStateAccountRow['optIns'],
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
        if (
            entry.state.reason.kind !==
            AccountStateUnavailableKind.ImplausibleSnapshot
        ) {
            throw new Error('unreachable');
        }
        expect(entry.state.reason.issues.length).toBeGreaterThan(0);
    });

    it("never counts a plan resolved for one user against another user's query", () => {
        const entries = accountStatesOf(OTHER_USER_ID, ASOF, rowsOf());
        expect(entries).toEqual([]);
    });
});

const SIBLING_ID = '00000000-0000-4000-8000-000000000011';
const ARCHIVED_ID = '00000000-0000-4000-8000-000000000012';

function fundedStateOf(rows: AccountStatesRows) {
    const entry = accountStatesOf(USER_ID, ASOF, rows).find(
        (candidate) => candidate.accountId === ACCOUNT_ID,
    );
    if (entry?.state.kind !== AccountStateKind.Reconstructed) {
        throw new Error('expected a reconstructed state');
    }
    const { latest, previous } = entry.state;
    if (latest.reconstructed.kind === ReconstructedLiveKind.Live) {
        throw new Error('expected a funded or eval account');
    }
    return { latest: latest.reconstructed, previous };
}

function movedLive(
    accountId: string,
    occurredOn: string,
): AccountStateEventRow {
    return {
        accountId,
        kind: AccountEventKind.MovedLive,
        occurredOn,
        userId: USER_ID,
    };
}

function requestedBy(
    accountId: string,
    requestedOn: string,
    userId = USER_ID,
): AccountStatePayoutRow {
    return {
        accountId,
        grossCents: usdCents(50_000),
        netCents: null,
        paidOn: null,
        requestedOn,
        status: PayoutStatus.Requested,
        userId,
    };
}

function siblingSnapshot(accountId: string): AccountStateSnapshotRow {
    return snapshotRow({
        accountId,
        id: '10000000-0000-4000-8000-000000000099',
    });
}

function topStepAccountRow(): AccountStateAccountRow {
    const plan = findFirm(FirmId.TopStep)?.plans[0];
    if (!plan) throw new Error('a TopStep plan is missing');
    return accountRow({
        accountSize: plan.id.accountSize,
        firmId: FirmId.TopStep,
        id: SIBLING_ID,
        planSerial: serializePlanId(plan.id),
    });
}

describe('accountStatesOf counts the requested payouts of the whole firm (PT-36l, F-145)', () => {
    it("hands the sibling account's request to the account as the other accounts' pending count", () => {
        const rows = rowsOf({
            accounts: [accountRow(), accountRow({ id: SIBLING_ID })],
            payouts: [
                requestedBy(ACCOUNT_ID, '2026-09-20'),
                requestedBy(SIBLING_ID, '2026-09-21'),
                requestedBy(SIBLING_ID, '2026-09-22'),
            ],
            snapshots: [snapshotRow(), siblingSnapshot(SIBLING_ID)],
        });
        const { latest } = fundedStateOf(rows);
        expect(latest.pendingPayoutCount).toBe(1);
        expect(latest.otherAccountsPendingPayoutCount).toBe(2);
    });

    it('also counts the request of an archived account at the firm', () => {
        const archived = accountRow({
            archivedAt: new Date('2026-09-10T00:00:00Z'),
            id: ARCHIVED_ID,
        });
        const rows = rowsOf({
            accounts: [accountRow(), archived],
            payouts: [requestedBy(ARCHIVED_ID, '2026-09-15')],
        });
        const { latest } = fundedStateOf(rows);
        expect(latest.pendingPayoutCount).toBe(0);
        expect(latest.otherAccountsPendingPayoutCount).toBe(1);
    });

    it("never counts another user's request at the same firm", () => {
        const otherUsers = accountRow({
            id: SIBLING_ID,
            userId: OTHER_USER_ID,
        });
        const rows = rowsOf({
            accounts: [accountRow(), otherUsers],
            payouts: [requestedBy(SIBLING_ID, '2026-09-21', OTHER_USER_ID)],
        });
        expect(fundedStateOf(rows).latest.otherAccountsPendingPayoutCount).toBe(
            0,
        );
    });

    it('keeps reconstructing the live accounts when an archived account at the firm has a corrupt row', () => {
        const corrupt = accountRow({
            archivedAt: new Date('2026-09-10T00:00:00Z'),
            firmId: null,
            id: ARCHIVED_ID,
            planSerial: null,
        });
        const rows = rowsOf({
            accounts: [accountRow(), corrupt],
            payouts: [requestedBy(ARCHIVED_ID, '2026-09-15')],
        });
        expect(fundedStateOf(rows).latest.otherAccountsPendingPayoutCount).toBe(
            0,
        );
    });

    it('never counts a request at another firm', () => {
        const rows = rowsOf({
            accounts: [accountRow(), topStepAccountRow()],
            payouts: [requestedBy(SIBLING_ID, '2026-09-21')],
        });
        expect(fundedStateOf(rows).latest.otherAccountsPendingPayoutCount).toBe(
            0,
        );
    });

    it('stops counting requests made before the last move to live at the firm', () => {
        const rows = rowsOf({
            accounts: [accountRow(), accountRow({ id: SIBLING_ID })],
            events: [movedLive(SIBLING_ID, '2026-09-18')],
            payouts: [
                requestedBy(ACCOUNT_ID, '2026-09-10'),
                requestedBy(SIBLING_ID, '2026-09-12'),
                requestedBy(SIBLING_ID, '2026-09-21'),
            ],
            snapshots: [snapshotRow(), siblingSnapshot(SIBLING_ID)],
        });
        const { latest } = fundedStateOf(rows);
        expect(latest.pendingPayoutCount).toBe(0);
        expect(latest.otherAccountsPendingPayoutCount).toBe(1);
    });

    it('gives the previous snapshot reconstruction the same firm counts', () => {
        const earlier = snapshotRow({
            asOf: '2026-09-16',
            id: '10000000-0000-4000-8000-000000000002',
        });
        const rows = rowsOf({
            accounts: [accountRow(), accountRow({ id: SIBLING_ID })],
            payouts: [requestedBy(SIBLING_ID, '2026-09-12')],
            snapshots: [snapshotRow(), earlier, siblingSnapshot(SIBLING_ID)],
        });
        const reconstructed = fundedStateOf(rows).previous?.reconstructed;
        if (
            reconstructed === undefined ||
            reconstructed.kind === ReconstructedLiveKind.Live
        ) {
            throw new Error('expected a funded previous reconstruction');
        }
        expect(reconstructed.otherAccountsPendingPayoutCount).toBe(1);
    });
});

const LEDGER_ONLY_ID = '00000000-0000-4000-8000-000000000013';

function ledgerOnlyRow(
    overrides: Partial<AccountStateAccountRow> = {},
): AccountStateAccountRow {
    return accountRow({
        id: LEDGER_ONLY_ID,
        planLabel: 'Manual 50K',
        planSerial: null,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}

describe('a ledger-only account at a listed firm is a member of the firm count (PT-36l, F-145)', () => {
    it("hands the ledger-only sibling's request to the modeled account as the other accounts' pending count", () => {
        const rows = rowsOf({
            accounts: [accountRow(), ledgerOnlyRow()],
            payouts: [requestedBy(LEDGER_ONLY_ID, '2026-09-21')],
        });
        expect(fundedStateOf(rows).latest.otherAccountsPendingPayoutCount).toBe(
            1,
        );
    });

    it('moves the firm past a live move recorded on the ledger-only sibling', () => {
        const rows = rowsOf({
            accounts: [accountRow(), ledgerOnlyRow()],
            events: [movedLive(LEDGER_ONLY_ID, '2026-09-18')],
            payouts: [
                requestedBy(ACCOUNT_ID, '2026-09-10'),
                requestedBy(LEDGER_ONLY_ID, '2026-09-21'),
            ],
        });
        const { latest } = fundedStateOf(rows);
        expect(latest.pendingPayoutCount).toBe(0);
        expect(latest.otherAccountsPendingPayoutCount).toBe(1);
    });

    it('never counts a ledger-only account kept at an external firm', () => {
        const external = ledgerOnlyRow({
            externalFirmId: 'external-firm',
            firmId: null,
        });
        const rows = rowsOf({
            accounts: [accountRow(), external],
            payouts: [requestedBy(LEDGER_ONLY_ID, '2026-09-21')],
        });
        expect(fundedStateOf(rows).latest.otherAccountsPendingPayoutCount).toBe(
            0,
        );
    });

    it('counts the same requested payouts as the portfolio ledger and the alert context', () => {
        const rows = rowsOf({
            accounts: [accountRow(), ledgerOnlyRow()],
            payouts: [
                requestedBy(ACCOUNT_ID, '2026-09-20'),
                requestedBy(LEDGER_ONLY_ID, '2026-09-21'),
            ],
        });
        const { latest } = fundedStateOf(rows);
        const total =
            (latest.pendingPayoutCount ?? 0) +
            (latest.otherAccountsPendingPayoutCount ?? 0);
        const ledgerCount = firmPayoutCounts(
            PortfolioLedger.fromRows(USER_ID, {
                accounts: rows.accounts.map((row) => ({
                    ...row,
                    copyGroupId: null,
                    label: row.id,
                    replacesAccountId: null,
                    roundId: null,
                })),
                events: [],
                fees: [],
                firmEngagements: [],
                firmStatements: [],
                payouts: rows.payouts.map((payout, index) => ({
                    ...payout,
                    approvedOn: null,
                    id: `payout-${index}`,
                })),
                rounds: [],
                transfers: [],
            }),
            ASOF,
        ).find((count) => count.firmId === FirmId.Mffu);
        const alertCount = firmPayoutCountIn(
            createAlertContext({
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
            }),
            FirmId.Mffu,
        );
        expect(total).toBe(2);
        expect(ledgerCount?.requestedPayoutsSinceLastLiveAccount).toBe(total);
        expect(alertCount?.requestedPayoutsSinceLastLiveAccount).toBe(total);
    });
});
