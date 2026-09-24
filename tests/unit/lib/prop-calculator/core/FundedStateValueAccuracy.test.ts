import { describe, expect, it } from 'vitest';

import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const REPLAY_TRIALS = 400_000;
const REPLAY_RELATIVE_TOLERANCE = 0.01;
const UNBINDING_CUSHION_MULTIPLE = 20;

function consistencyToyPlan(maxBestDayShare: number): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(
                ConsistencyScope.Funded,
                fraction(maxBestDayShare),
            ),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function dpAgainstReplay(
    plan: Plan,
    grid: Pick<
        FundedStateValueConfig,
        'cushionStepMultiple' | 'cycleBestDayBucketCount' | 'maxCushionMultiple'
    >,
) {
    const result = computeFundedStateValue({
        ...grid,
        actionStepMultiple: 0.5,
        convergenceTolerance: 0.01,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    });
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 2000,
        maxEvalDays: 1,
        plan,
        riskPerTrade: 100,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: REPLAY_TRIALS,
        winrate: 0.5,
    });
    expect(result.unconvergedLevelCount).toBe(0);
    return {
        dpValue: result.initialValue,
        replayValue: out.expectedGrossPayout,
    };
}

describe('computeFundedStateValue with a funded consistency rule agrees with a replay of its own policy (N-65)', () => {
    it.each([0.5, 0.25])(
        'values the 40 percent best-day toy within 1 percent of simulate() driven by its own policy at cushion step %s x drawdown, once the cushion grid is wide enough not to truncate the balance',
        (cushionStepMultiple) => {
            const { dpValue, replayValue } = dpAgainstReplay(
                consistencyToyPlan(0.4),
                {
                    cushionStepMultiple,
                    maxCushionMultiple: UNBINDING_CUSHION_MULTIPLE,
                },
            );
            expect(dpValue).toBeGreaterThan(900);
            expect(Math.abs(replayValue - dpValue)).toBeLessThan(
                REPLAY_RELATIVE_TOLERANCE * dpValue,
            );
        },
        600_000,
    );

    it('never promises more than its own policy earns at the default 6 drawdown cushion grid, where truncating the balance above the grid understates what a best-day rule lets the account build up before a payout', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            { cushionStepMultiple: 0.5 },
        );
        expect(dpValue).toBeGreaterThan(300);
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
    }, 600_000);

    it('rounds the carried best day up on a coarse cycleBestDayBucketCount, so it never allows a payout the real rule denies', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            { cushionStepMultiple: 0.5, cycleBestDayBucketCount: 3 },
        );
        expect(dpValue).toBeGreaterThan(300);
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
    }, 600_000);
});
