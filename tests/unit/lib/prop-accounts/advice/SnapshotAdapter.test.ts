import { describe, expect, it } from 'vitest';

import {
    AdviceUnavailableReason,
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
    DashboardBalanceConvention,
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

describe('snapshotInputFrom: a pure row-to-domain mapping', () => {
    it('omits absent fields rather than sending null', () => {
        const { input } = snapshotInputFrom(
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

    it('defaults the balance to the account size with no snapshot yet', () => {
        const { input } = snapshotInputFrom(
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
        const { input } = snapshotInputFrom(
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
        const { assumptions, input } = snapshotInputFrom(
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
        const { assumptions, input } = snapshotInputFrom(
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
        const { input } = snapshotInputFrom(
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
        const { input } = snapshotInputFrom(
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
        const account = AccountReconstruction.rebuild(input, plan);
        if (account.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval reconstruction');
        }
        expect(evalStartStateIssue(plan, account.state, 90)).toBeNull();
    });

    it('omits the elapsed-days field for a funded or live account', () => {
        const { input } = snapshotInputFrom(
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
        const { input } = snapshotInputFrom(
            NOT_INSTANT_FUNDED,
            accountRow(),
            null,
            [],
            payouts,
            '2026-02-01',
        );
        expect(input.pendingPayouts).toBe(500);
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

describe('snapshotAdviceInputFor: the ledger-only guard (VD-23)', () => {
    it('never reaches reconstruction for a ledger-only row', () => {
        const result = snapshotAdviceInputFor(
            null,
            ledgerOnlyRow(),
            null,
            [],
            [],
            '2026-02-01',
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
        );
        expect(result.kind).toBe(SnapshotAdviceInputKind.Modeled);
        if (result.kind !== SnapshotAdviceInputKind.Modeled) return;
        expect(result.row.tracking).toBe(AccountTracking.Modeled);
        expect(result.result.input.stage).toBeDefined();
    });
});
