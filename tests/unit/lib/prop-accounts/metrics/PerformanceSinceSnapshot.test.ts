import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    PerformanceComparabilityKind,
    PerformanceIncomparabilityReason,
    performanceSinceSnapshot,
} from '~/lib/prop-accounts/metrics';
import {
    createInitialState,
    findFirm,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function evalAt(balance: number, tradingDays: number): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: balance - 48_000,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: mffPro(),
        resolvedDailyLossLimit: null,
        state: {
            ...createInitialState(50_000, 48_000),
            balance,
            tradingDays,
        },
    };
}

function fundedAt(
    balance: number,
    tradingDays: number,
): ReconstructedAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: balance - 48_000,
        fundedTracker: null,
        kind: TradingPhase.Funded,
        plan: mffPro(),
        resolvedDailyLossLimit: null,
        state: {
            ...createInitialState(50_000, 48_000),
            balance,
            tradingDays,
        },
    };
}

function liveNotModeled(): ReconstructedAccount {
    return {
        assumptions: [],
        cushion: null,
        kind: ReconstructedLiveKind.Live,
        livePlan: null,
        plan: mffPro(),
        state: null,
    };
}

function mffPro(): Plan {
    const plan = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!plan) throw new Error('MFF Pro plan missing from the registry');
    return plan;
}

describe('performanceSinceSnapshot', () => {
    it('is not comparable without a previous snapshot', () => {
        expect(
            performanceSinceSnapshot(
                fundedAt(52_400, 5),
                '2026-09-23',
                null,
                null,
                [],
                [],
            ),
        ).toEqual({
            kind: PerformanceComparabilityKind.NotComparable,
            reason: PerformanceIncomparabilityReason.NoPreviousSnapshot,
        });
    });

    it('reports the normalized balance change and profit per trading day between two funded snapshots', () => {
        const result = performanceSinceSnapshot(
            fundedAt(52_400, 5),
            '2026-09-23',
            fundedAt(51_000, 2),
            '2026-09-16',
            [],
            [],
        );
        expect(result).toEqual({
            kind: PerformanceComparabilityKind.Comparable,
            normalizedBalanceChange: 1400,
            payoutsPaidGross: 0,
            profitPerTradingDay: 1400 / 3,
            profitSinceSnapshot: 1400,
            tradingDaysElapsed: 3,
        });
    });

    it('adds back the gross of payouts paid between the two snapshots', () => {
        const result = performanceSinceSnapshot(
            fundedAt(51_900, 5),
            '2026-09-23',
            fundedAt(51_000, 2),
            '2026-09-16',
            [],
            [
                {
                    grossCents: usdCents(50_000),
                    paidOn: '2026-09-20',
                    status: PayoutStatus.Paid,
                },
            ],
        );
        if (result.kind !== PerformanceComparabilityKind.Comparable) {
            throw new Error('expected a comparable result');
        }
        expect(result.payoutsPaidGross).toBe(500);
        expect(result.normalizedBalanceChange).toBe(900);
        expect(result.profitSinceSnapshot).toBe(1400);
    });

    it('ignores a payout paid outside the snapshot window or not paid', () => {
        const result = performanceSinceSnapshot(
            fundedAt(51_900, 5),
            '2026-09-23',
            fundedAt(51_000, 2),
            '2026-09-16',
            [],
            [
                {
                    grossCents: usdCents(50_000),
                    paidOn: '2026-09-10',
                    status: PayoutStatus.Paid,
                },
                {
                    grossCents: usdCents(50_000),
                    paidOn: null,
                    status: PayoutStatus.Requested,
                },
            ],
        );
        if (result.kind !== PerformanceComparabilityKind.Comparable) {
            throw new Error('expected a comparable result');
        }
        expect(result.payoutsPaidGross).toBe(0);
    });

    it('is not comparable across a funded reset between the two snapshots', () => {
        const result = performanceSinceSnapshot(
            fundedAt(51_900, 5),
            '2026-09-23',
            fundedAt(51_000, 2),
            '2026-09-16',
            [
                {
                    kind: AccountEventKind.FundedReset,
                    occurredOn: '2026-09-18',
                },
            ],
            [],
        );
        expect(result).toEqual({
            kind: PerformanceComparabilityKind.NotComparable,
            reason: PerformanceIncomparabilityReason.FundedReset,
        });
    });

    it('ignores a funded reset event dated outside the snapshot window', () => {
        const result = performanceSinceSnapshot(
            fundedAt(51_900, 5),
            '2026-09-23',
            fundedAt(51_000, 2),
            '2026-09-16',
            [{ kind: AccountEventKind.FundedReset, occurredOn: '2026-09-01' }],
            [],
        );
        expect(result.kind).toBe(PerformanceComparabilityKind.Comparable);
    });

    it('is not comparable across a stage change between the two snapshots', () => {
        const result = performanceSinceSnapshot(
            fundedAt(52_000, 1),
            '2026-09-23',
            evalAt(51_000, 4),
            '2026-09-16',
            [],
            [],
        );
        expect(result).toEqual({
            kind: PerformanceComparabilityKind.NotComparable,
            reason: PerformanceIncomparabilityReason.StageChange,
        });
    });

    it('reports no trading-day profit rate when no trading day has elapsed', () => {
        const result = performanceSinceSnapshot(
            fundedAt(52_000, 3),
            '2026-09-23',
            fundedAt(51_000, 3),
            '2026-09-16',
            [],
            [],
        );
        if (result.kind !== PerformanceComparabilityKind.Comparable) {
            throw new Error('expected a comparable result');
        }
        expect(result.tradingDaysElapsed).toBe(0);
        expect(result.profitPerTradingDay).toBeNull();
    });

    it('is not comparable when either side is an unmodeled live account', () => {
        const result = performanceSinceSnapshot(
            liveNotModeled(),
            '2026-09-23',
            liveNotModeled(),
            '2026-09-16',
            [],
            [],
        );
        expect(result).toEqual({
            kind: PerformanceComparabilityKind.NotComparable,
            reason: PerformanceIncomparabilityReason.LiveNotModeled,
        });
    });
});
