import { describe, expect, it } from 'vitest';

import {
    AdviceUnavailableReason,
    firmPayoutCountOf,
    SNAPSHOT_FIELD_TO_INPUT_FIELD,
    type SnapshotAccountRow,
    snapshotAdviceInputFor,
    SnapshotAdviceInputKind,
    type SnapshotEventRow,
    snapshotInputFrom,
    type SnapshotPayoutRow,
    type SnapshotSnapshotRow,
} from '~/lib/prop-accounts/advice';
import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    type ModeledAccountRow,
    PayoutStatus,
    type TrackedAccountRow,
    usdCents,
} from '~/lib/prop-accounts/core';
import { SnapshotField } from '~/lib/prop-accounts/snapshots';
import {
    evalStartStateIssue,
    findFirm,
    FirmId,
    MffuVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    DashboardBalanceConvention,
    NO_PENDING_PAYOUT_COUNTS,
    PENDING_PAYOUT_COUNTS_NOT_CHECKED,
    PendingPayoutCountsStatus,
} from '~/lib/prop-calculator/advisor';

function accountRow(): ModeledAccountRow<SnapshotAccountRow> {
    return {
        accountSize: 50_000,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: '00000000-0000-4000-8000-000000000001',
        liveStartBalanceCents: null,
        planLabel: null,
        planSerial: 'mffu:pro:50000',
        purchasedOn: '2026-01-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.Modeled,
    };
}

function ledgerOnlyRow(): TrackedAccountRow<SnapshotAccountRow> {
    return {
        accountSize: 50_000,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: 'my-external-firm',
        firmId: null,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: '00000000-0000-4000-8000-000000000002',
        liveStartBalanceCents: null,
        planLabel: 'Some external plan',
        planSerial: null,
        purchasedOn: '2026-01-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
    };
}

const NOT_INSTANT_FUNDED = { isInstantFunded: false };

const SNAPSHOT_ON_FEB_1: SnapshotSnapshotRow = {
    asOf: '2026-02-01',
    balanceAtLastPayoutCents: null,
    balanceCents: usdCents(5_240_000),
    cumulativePayoutCents: null,
    cycleBestDayProfitCents: null,
    dashboardFloorCents: null,
    evalBestDayProfitCents: null,
    floorAtLastPayoutCents: null,
    highestEodBalanceCents: null,
    highestIntradayBalanceCents: null,
    lastPayoutOn: null,
    lastTradedOn: null,
    payoutsTaken: null,
    qualifyingDaysSinceLastPayout: null,
    tradingDays: null,
};

function inputFrom(
    plan: Parameters<typeof snapshotInputFrom>[0],
    row: ModeledAccountRow<SnapshotAccountRow>,
    snapshot: null | SnapshotSnapshotRow,
    events: readonly SnapshotEventRow[],
    payouts: readonly SnapshotPayoutRow[],
    asOf: string,
) {
    return snapshotInputFrom(
        plan,
        row,
        snapshot,
        events,
        payouts,
        asOf,
        firmPayoutCountOf(row.firmId, [{ events, payouts }], asOf),
    );
}

function requestedAt(day: string): SnapshotPayoutRow {
    return {
        grossCents: usdCents(50_000),
        netCents: null,
        paidOn: null,
        requestedOn: day,
        status: PayoutStatus.Requested,
    };
}

describe('snapshotInputFrom: a pure row-to-domain mapping', () => {
    it('omits absent fields rather than sending null', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            [],
            '2026-02-01',
        );
        expect(input.dashboardFloor).toBeUndefined();
        expect(input.highestEodBalance).toBeUndefined();
        expect(input.highestIntradayBalance).toBeUndefined();
        expect(input.lastPayoutOn).toBeUndefined();
        expect(input.lastTradedOn).toBeUndefined();
        expect(input.tradingDays).toBeUndefined();
        expect(input.qualifyingDaysSinceLastPayout).toBeUndefined();
        expect(input.firstFundedTradeOn).toBeUndefined();
        expect(input.fundedOn).toBeUndefined();
        expect(input.liveStartBalance).toBeUndefined();
    });

    it('reports no personal max risk per trade when no personal rules are stored', () => {
        const { personalMaxRiskPerTrade } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            [],
            '2026-02-01',
        );
        expect(personalMaxRiskPerTrade).toBeNull();
    });

    it('reads the personal max risk per trade from the stored personal rules', () => {
        const { personalMaxRiskPerTrade } = inputFrom(
            NOT_INSTANT_FUNDED,
            {
                ...accountRow(),
                personalRules: { maxRiskPerTradeCents: usdCents(50_000) },
            },
            null,
            [],
            [],
            '2026-02-01',
        );
        expect(personalMaxRiskPerTrade).toBe(500);
    });

    it('defaults the balance to the account size with no snapshot yet', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            [],
            '2026-02-01',
        );
        expect(input.balance).toBe(50_000);
        expect(input.asOf).toBe('2026-02-01');
    });

    it('reads every dollar field from the snapshot when one exists', () => {
        const snapshot: SnapshotSnapshotRow = {
            asOf: '2026-02-10',
            balanceAtLastPayoutCents: usdCents(5_050_000),
            balanceCents: usdCents(5_240_000),
            cumulativePayoutCents: usdCents(40_000),
            cycleBestDayProfitCents: usdCents(30_000),
            dashboardFloorCents: usdCents(5_010_000),
            evalBestDayProfitCents: null,
            floorAtLastPayoutCents: null,
            highestEodBalanceCents: usdCents(5_300_000),
            highestIntradayBalanceCents: null,
            lastPayoutOn: '2026-02-01',
            lastTradedOn: '2026-02-09',
            payoutsTaken: 1,
            qualifyingDaysSinceLastPayout: 3,
            tradingDays: 20,
        };
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            snapshot,
            [],
            [],
            '2026-02-01',
        );
        expect(input.asOf).toBe('2026-02-10');
        expect(input.balance).toBe(52_400);
        expect(input.balanceAtLastPayout).toBe(50_500);
        expect(input.cumulativePayout).toBe(400);
        expect(input.cycleBestDayProfit).toBe(300);
        expect(input.dashboardFloor).toBe(50_100);
        expect(input.highestEodBalance).toBe(53_000);
        expect(input.lastPayoutOn).toBe('2026-02-01');
        expect(input.lastTradedOn).toBe('2026-02-09');
        expect(input.payoutsTaken).toBe(1);
        expect(input.qualifyingDaysSinceLastPayout).toBe(3);
        expect(input.tradingDays).toBe(20);
    });

    it('counts only FundedReset events, adding a disclosed assumption', () => {
        const events: SnapshotEventRow[] = [
            { kind: AccountEventKind.FundedReset, occurredOn: '2026-01-10' },
            { kind: AccountEventKind.Edited, occurredOn: '2026-01-11' },
            { kind: AccountEventKind.FundedReset, occurredOn: '2026-01-20' },
        ];
        const { assumptions, input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            events,
            [],
            '2026-02-01',
        );
        expect(input.fundedResetsUsed).toBe(2);
        expect(assumptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'funded-resets-from-events' }),
            ]),
        );
    });

    it('sums paid payouts when the snapshot has no cumulative total, flagging gross-only cash', () => {
        const payouts: SnapshotPayoutRow[] = [
            {
                grossCents: usdCents(50_000),
                netCents: usdCents(40_000),
                paidOn: '2026-01-15',
                requestedOn: '2026-01-10',
                status: PayoutStatus.Paid,
            },
            {
                grossCents: usdCents(30_000),
                netCents: null,
                paidOn: '2026-01-25',
                requestedOn: '2026-01-20',
                status: PayoutStatus.Paid,
            },
            {
                grossCents: usdCents(20_000),
                netCents: null,
                paidOn: null,
                requestedOn: '2026-01-05',
                status: PayoutStatus.Cancelled,
            },
        ];
        const { assumptions, input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            payouts,
            '2026-02-01',
        );
        expect(input.cumulativePayout).toBe(700);
        expect(input.payoutsTaken).toBe(2);
        expect(assumptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'gross-only-payouts' }),
            ]),
        );
    });

    it('carries the idle-day-inclusive elapsed days since the eval started, for an eval-stage account', () => {
        const evalRow: ModeledAccountRow<SnapshotAccountRow> = {
            ...accountRow(),
            purchasedOn: '2026-01-01',
            stage: AccountStage.Eval,
        };
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            evalRow,
            null,
            [],
            [],
            '2026-01-10',
        );
        expect(input.elapsedDaysSinceAttemptStart).toBe(10);
    });

    it('keeps elapsedDaysSinceAttemptStart consistent with tradingDays for a no-idle-day eval account, reconstructing without an elapsedDays-below-tradingDays violation', () => {
        const evalRow: ModeledAccountRow<SnapshotAccountRow> = {
            ...accountRow(),
            purchasedOn: '2026-01-01',
            stage: AccountStage.Eval,
        };
        const snapshot: SnapshotSnapshotRow = {
            asOf: '2026-01-02',
            balanceAtLastPayoutCents: null,
            balanceCents: usdCents(5_000_000),
            cumulativePayoutCents: null,
            cycleBestDayProfitCents: null,
            dashboardFloorCents: null,
            evalBestDayProfitCents: null,
            floorAtLastPayoutCents: null,
            highestEodBalanceCents: usdCents(5_000_000),
            highestIntradayBalanceCents: null,
            lastPayoutOn: null,
            lastTradedOn: '2026-01-02',
            payoutsTaken: null,
            qualifyingDaysSinceLastPayout: null,
            tradingDays: 2,
        };
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            evalRow,
            snapshot,
            [],
            [],
            '2026-01-02',
        );
        expect(input.tradingDays).toBe(2);
        expect(input.elapsedDaysSinceAttemptStart).toBe(2);

        const plan = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        });
        if (!plan) throw new Error('mffu:pro:50000 plan missing');
        const account = AccountReconstruction.rebuild(
            input,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(evalStartStateIssue(plan, account.state, 90)).toBeNull();
    });

    it('omits the elapsed-days field for a funded or live account', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            [],
            '2026-02-01',
        );
        expect(input.elapsedDaysSinceAttemptStart).toBeUndefined();
    });

    it('sums Requested payouts dated after the snapshot as-of as pending, ignoring ones dated before', () => {
        const payouts: SnapshotPayoutRow[] = [
            {
                grossCents: usdCents(50_000),
                netCents: null,
                paidOn: null,
                requestedOn: '2026-02-05',
                status: PayoutStatus.Requested,
            },
            {
                grossCents: usdCents(20_000),
                netCents: null,
                paidOn: null,
                requestedOn: '2026-01-20',
                status: PayoutStatus.Requested,
            },
        ];
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            payouts,
            '2026-02-01',
        );
        expect(input.pendingPayouts).toBe(500);
    });

    it('counts every own Requested payout dated up to today as a pending request, not one per account, and nets only the ones after the snapshot as-of (PT-36i)', () => {
        const { input, pendingPayoutCounts } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            [
                requestedAt('2026-02-05'),
                requestedAt('2026-02-06'),
                requestedAt('2026-01-20'),
                requestedAt('2026-02-20'),
            ],
            '2026-02-10',
        );
        expect(pendingPayoutCounts.pendingPayoutCount).toBe(3);
        expect(input.pendingPayouts).toBe(1500);
    });

    it('counts a still-unpaid request dated before or on the snapshot as-of toward the firm payout count (PT-36i)', () => {
        const { input, pendingPayoutCounts } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            [requestedAt('2026-01-31'), requestedAt('2026-02-01')],
            '2026-02-10',
        );
        expect(pendingPayoutCounts.pendingPayoutCount).toBe(2);
        expect(input.pendingPayouts).toBe(0);
    });

    it('does not count a request dated before the last move to live at the firm (PT-36i)', () => {
        const movedLive: SnapshotEventRow = {
            kind: AccountEventKind.MovedLive,
            occurredOn: '2026-01-25',
        };
        const { pendingPayoutCounts } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [movedLive],
            [requestedAt('2026-01-20'), requestedAt('2026-02-01')],
            '2026-02-10',
        );
        expect(pendingPayoutCounts.pendingPayoutCount).toBe(1);
    });

    it('returns the requests at the firm other accounts beside the input from the firm count (PT-36i)', () => {
        const own = [requestedAt('2026-02-02')];
        const otherAccountsRequests = [
            requestedAt('2026-02-03'),
            requestedAt('2026-02-04'),
            requestedAt('2026-02-05'),
        ];
        const firmCount = firmPayoutCountOf(
            FirmId.Mffu,
            [
                { events: [], payouts: own },
                { events: [], payouts: otherAccountsRequests },
            ],
            '2026-02-10',
        );
        const withFirm = snapshotInputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            own,
            '2026-02-10',
            firmCount,
        );
        const alone = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            own,
            '2026-02-10',
        );
        expect(withFirm.pendingPayoutCounts).toEqual({
            otherAccountsPendingPayoutCount: 3,
            pendingPayoutCount: 1,
        });
        expect(alone.pendingPayoutCounts).toEqual({
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
        });
    });

    it('refuses a firm count computed at another date than the one it is given (PT-36l, F-145)', () => {
        const own = [requestedAt('2026-02-02')];
        const countedYesterday = firmPayoutCountOf(
            FirmId.Mffu,
            [{ events: [], payouts: own }],
            '2026-02-09',
        );
        expect(() =>
            snapshotInputFrom(
                NOT_INSTANT_FUNDED,
                accountRow(),
                null,
                [],
                own,
                '2026-02-10',
                countedYesterday,
            ),
        ).toThrow(/2026-02-09.*2026-02-10/);
    });

    it('refuses a firm count of another firm (PT-36l, F-145)', () => {
        const own = [requestedAt('2026-02-02')];
        const otherFirm = firmPayoutCountOf(
            FirmId.TopStep,
            [{ events: [], payouts: own }],
            '2026-02-10',
        );
        expect(() =>
            snapshotInputFrom(
                NOT_INSTANT_FUNDED,
                accountRow(),
                null,
                [],
                own,
                '2026-02-10',
                otherFirm,
            ),
        ).toThrow(/firm/);
    });

    it('maps every SnapshotField to exactly one SnapshotInputField-shaped key', () => {
        for (const field of Object.values(SnapshotField)) {
            expect(SNAPSHOT_FIELD_TO_INPUT_FIELD[field]).toBeDefined();
        }
        expect(Object.keys(SNAPSHOT_FIELD_TO_INPUT_FIELD).length).toBe(
            Object.values(SnapshotField).length,
        );
    });
});

describe('snapshotInputFrom: a firm count that could not be loaded is typed, not invented (PT-36p, F-145)', () => {
    const TODAY = '2026-02-10';

    function notChecked(
        events: readonly SnapshotEventRow[],
        payouts: readonly SnapshotPayoutRow[],
    ) {
        return snapshotInputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            events,
            payouts,
            TODAY,
            PENDING_PAYOUT_COUNTS_NOT_CHECKED,
        );
    }

    it('builds the input from the account own rows and counts no request at other accounts', () => {
        const result = notChecked(
            [],
            [requestedAt('2026-02-05'), requestedAt('2026-02-06')],
        );
        expect(result.pendingPayoutCounts).toEqual({
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 2,
        });
        expect(result.input.pendingPayouts).toBe(1000);
    });

    it('still leaves out a request dated before the account own move to live', () => {
        const result = notChecked(
            [{ kind: AccountEventKind.MovedLive, occurredOn: '2026-01-25' }],
            [requestedAt('2026-01-20'), requestedAt('2026-02-01')],
        );
        expect(result.pendingPayoutCounts.pendingPayoutCount).toBe(1);
    });

    it('gives the same snapshot input as a counted firm count for the same rows', () => {
        const payouts = [requestedAt('2026-02-05')];
        expect(notChecked([], payouts).input).toEqual(
            inputFrom(
                NOT_INSTANT_FUNDED,
                accountRow(),
                SNAPSHOT_ON_FEB_1,
                [],
                payouts,
                TODAY,
            ).input,
        );
    });

    it('takes the counts of a counted outcome as they are', () => {
        const counts = {
            otherAccountsPendingPayoutCount: 4,
            pendingPayoutCount: 2,
        };
        const result = snapshotInputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            [requestedAt('2026-02-05')],
            TODAY,
            { counts, status: PendingPayoutCountsStatus.Counted },
        );
        expect(result.pendingPayoutCounts).toEqual(counts);
    });
});

function notCheckedAssumptions(result: ReturnType<typeof snapshotInputFrom>) {
    return result.assumptions.filter(
        (assumption) =>
            assumption.kind === AssumptionKind.FirmPayoutCountNotChecked,
    );
}

describe('snapshotInputFrom: an unknown firm count travels as a typed assumption, a real zero does not (PT-36p, F-145)', () => {
    const TODAY = '2026-02-10';
    const payouts = [requestedAt('2026-02-05')];

    function resultFor(firmCount: Parameters<typeof snapshotInputFrom>[6]) {
        return snapshotInputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            payouts,
            TODAY,
            firmCount,
        );
    }

    it('says the other-accounts count is assumed none when the firm count is not checked', () => {
        const unknown = resultFor(PENDING_PAYOUT_COUNTS_NOT_CHECKED);
        expect(notCheckedAssumptions(unknown)).toEqual([
            {
                bias: AssumptionBias.Optimistic,
                kind: AssumptionKind.FirmPayoutCountNotChecked,
            },
        ]);
        expect(
            unknown.pendingPayoutCounts.otherAccountsPendingPayoutCount,
        ).toBe(0);
    });

    it('says nothing for a real firm count of zero other requests', () => {
        const real = resultFor(
            firmPayoutCountOf(FirmId.Mffu, [{ events: [], payouts }], TODAY),
        );
        expect(real.pendingPayoutCounts.otherAccountsPendingPayoutCount).toBe(
            0,
        );
        expect(notCheckedAssumptions(real)).toEqual([]);
    });

    it('says nothing for a counted outcome', () => {
        const counted = resultFor({
            counts: NO_PENDING_PAYOUT_COUNTS,
            status: PendingPayoutCountsStatus.Counted,
        });
        expect(notCheckedAssumptions(counted)).toEqual([]);
    });

    it('recognises a firm count by its own fields, not by the absence of a status field', () => {
        const count = firmPayoutCountOf(
            FirmId.Mffu,
            [{ events: [], payouts }],
            TODAY,
        );
        const withStatus = {
            ...count,
            status: PendingPayoutCountsStatus.NotChecked,
        } as unknown as Parameters<typeof snapshotInputFrom>[6];
        expect(resultFor(withStatus).pendingPayoutCounts).toEqual(
            resultFor(count).pendingPayoutCounts,
        );
        expect(notCheckedAssumptions(resultFor(withStatus))).toEqual([]);
    });

    it('words the assumption for the people reading the advice', () => {
        const texts = notCheckedAssumptions(
            resultFor(PENDING_PAYOUT_COUNTS_NOT_CHECKED),
        ).map((assumption) => assumptionText(assumption));
        expect(texts).toEqual([expect.stringContaining('other accounts')]);
        expect(texts.join(' ')).not.toContain('—');
    });
});

describe('snapshotAdviceInputFor: the ledger-only guard (VD-23)', () => {
    it('never reaches reconstruction for a ledger-only row, which needs no firm count', () => {
        const result = snapshotAdviceInputFor(
            null,
            ledgerOnlyRow(),
            null,
            [],
            [],
            '2026-02-01',
            null,
        );
        expect(result).toEqual({
            kind: SnapshotAdviceInputKind.LedgerOnly,
            reason: AdviceUnavailableReason.LedgerOnly,
        });
    });

    it('passes a modeled row through as a ModeledAccountRow', () => {
        const result = snapshotAdviceInputFor(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            [],
            '2026-02-01',
            firmPayoutCountOf(
                FirmId.Mffu,
                [{ events: [], payouts: [] }],
                '2026-02-01',
            ),
        );
        expect(result.kind).toBe(SnapshotAdviceInputKind.Modeled);
        if (result.kind !== SnapshotAdviceInputKind.Modeled) return;
        expect(result.row.tracking).toBe(AccountTracking.Modeled);
        expect(result.result.input.stage).toBeDefined();
    });

    it('refuses a modeled row without its firm payout count instead of counting only its own payouts (PT-36l, F-145)', () => {
        expect(() =>
            snapshotAdviceInputFor(
                NOT_INSTANT_FUNDED,
                accountRow(),
                null,
                [],
                [],
                '2026-02-01',
                null,
            ),
        ).toThrow(/firm payout count/);
    });
});

describe('snapshotInputFrom: a funded reset counts only against the snapshot it happened before (F-108 (5), (9))', () => {
    const events: SnapshotEventRow[] = [
        { kind: AccountEventKind.FundedReset, occurredOn: '2026-01-10' },
        { kind: AccountEventKind.FundedReset, occurredOn: '2026-02-01' },
        { kind: AccountEventKind.FundedReset, occurredOn: '2026-02-15' },
    ];

    it('leaves out a reset recorded after an older snapshot and counts one on its as-of date', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            events,
            [],
            '2026-03-01',
        );
        expect(input.asOf).toBe('2026-02-01');
        expect(input.fundedResetsUsed).toBe(2);
    });

    it('counts every reset when there is no snapshot and the as-of date is today', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            events,
            [],
            '2026-03-01',
        );
        expect(input.fundedResetsUsed).toBe(3);
    });

    it('names no reset assumption when every reset is after the snapshot', () => {
        const { assumptions, input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [{ kind: AccountEventKind.FundedReset, occurredOn: '2026-02-15' }],
            [],
            '2026-03-01',
        );
        expect(input.fundedResetsUsed).toBe(0);
        expect(assumptions.map((assumption) => assumption.kind)).not.toContain(
            AssumptionKind.FundedResetsFromEvents,
        );
    });
});

describe('snapshotInputFrom: a request the balance may not show is counted and disclosed (F-138, Q23)', () => {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });

    function rebuiltKinds(payouts: readonly SnapshotPayoutRow[]) {
        if (!plan) throw new Error('mffu:pro:50000 plan missing');
        const { input, pendingPayoutCounts } = inputFrom(
            plan,
            accountRow(),
            FUNDED_SNAPSHOT,
            [],
            payouts,
            '2026-02-01',
        );
        return AccountReconstruction.rebuild(
            input,
            plan,
            null,
            pendingPayoutCounts,
        ).assumptions.map((assumption) => assumption.kind);
    }

    const FUNDED_SNAPSHOT: SnapshotSnapshotRow = {
        ...SNAPSHOT_ON_FEB_1,
        highestEodBalanceCents: usdCents(5_300_000),
        payoutsTaken: 0,
    };

    it('counts only Requested payouts dated on or before the snapshot as-of', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            [
                requestedAt('2026-01-20'),
                requestedAt('2026-02-01'),
                requestedAt('2026-02-05'),
                { ...requestedAt('2026-01-25'), status: PayoutStatus.Paid },
            ],
            '2026-02-01',
        );
        expect(input.requestedPayoutsAssumedInBalance).toBe(2);
        expect(input.pendingPayouts).toBe(500);
    });

    it('counts none when no request is dated on or before the snapshot', () => {
        const { input } = inputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            SNAPSHOT_ON_FEB_1,
            [],
            [requestedAt('2026-02-05')],
            '2026-02-01',
        );
        expect(input.requestedPayoutsAssumedInBalance).toBe(0);
    });

    it('names the request assumed in the balance after reconstruction, and nothing without one', () => {
        expect(rebuiltKinds([requestedAt('2026-01-20')])).toContain(
            AssumptionKind.PendingPayoutAssumedInBalance,
        );
        expect(rebuiltKinds([])).not.toContain(
            AssumptionKind.PendingPayoutAssumedInBalance,
        );
    });

    it('names both the deduction and the assumed in balance request when a request is dated each side of the snapshot', () => {
        const kinds = rebuiltKinds([
            requestedAt('2026-01-20'),
            requestedAt('2026-02-05'),
        ]);
        expect(kinds).toEqual(
            expect.arrayContaining([
                AssumptionKind.PendingPayoutDeducted,
                AssumptionKind.PendingPayoutAssumedInBalance,
            ]),
        );
    });

    it('words the assumption as the decision states it', () => {
        expect(
            assumptionText({
                bias: AssumptionBias.Optimistic,
                kind: AssumptionKind.PendingPayoutAssumedInBalance,
            }),
        ).toContain(
            'A payout request dated on or before the snapshot is assumed to be in the balance',
        );
    });
});
