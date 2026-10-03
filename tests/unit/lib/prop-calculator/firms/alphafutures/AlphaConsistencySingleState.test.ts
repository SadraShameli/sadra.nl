import { beforeAll, describe, expect, it } from 'vitest';

import {
    ConsistencyBoundary,
    type ConsistencyRule,
    dollars,
    type Plan,
} from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
    withRule,
} from './alphaConsistencyFixtures';

interface FundedCycleProbe {
    balance: number;
    cycleBestDayProfit: number;
    lastPayoutBalance: number;
}

describe('N-45 at single funded DP states: a negative-edge policy trades only while the Alpha rule blocks the day-close payout (PT-T1c: a 12 drawdown cushion tail and 10 best-day buckets instead of the default 30 drawdown tail and 25 buckets, which took 17 s to 67 s a solve; every risk below is the same)', () => {
    const qualifiedRule = qualifiedAlphaRule();

    function toyPlan(rule: ConsistencyRule): Plan {
        return alphaToy(rule).withMaxLifetimePayouts(2);
    }

    const solvedPolicies = new Map<
        ConsistencyRule,
        (cycle: FundedCycleProbe) => number
    >();

    function firstTradeRiskAfterOneRequest(
        rule: ConsistencyRule,
    ): (cycle: FundedCycleProbe) => number {
        const solved = solvedPolicies.get(rule);
        if (solved) return solved;
        const plan = toyPlan(rule);
        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: 10,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            maxTailCushionMultiple: 12,
            plan,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: 0.3,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.cushionGrid.tailTopDollars).toBeGreaterThan(
            result.cushionGrid.fineTopDollars,
        );
        const riskAt = ({
            balance,
            cycleBestDayProfit,
            lastPayoutBalance,
        }: FundedCycleProbe): number => {
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            state.threshold = 1000;
            state.thresholdLocked = true;
            state.balance = balance;
            state.qualifyingDays = 20;
            return (
                result.dayPolicy.computeRisk?.(state, 0, {
                    cycleBestDayProfit,
                    dayGateProgress: 10,
                    fundedResetsUsed: 0,
                    lastPayoutBalance,
                    payoutsIssued: 1,
                }) ?? NaN
            );
        };
        solvedPolicies.set(rule, riskAt);
        return riskAt;
    }

    const lossExemptRule = lossExemptRuleOf(qualifiedRule);
    const exclusiveRule = withRule(qualifiedRule, {
        boundary: ConsistencyBoundary.Exclusive,
    });

    beforeAll(() => {
        firstTradeRiskAfterOneRequest(qualifiedRule);
    });

    beforeAll(() => {
        firstTradeRiskAfterOneRequest(lossExemptRule);
    });

    beforeAll(() => {
        firstTradeRiskAfterOneRequest(exclusiveRule);
    });

    it.each([
        { balance: 1300, cycleProfit: -100, lastPayoutBalance: 1400 },
        { balance: 1300, cycleProfit: 0, lastPayoutBalance: 1300 },
    ])(
        'after a cycle netting $cycleProfit the Alpha rule blocks the payout, so the DP trades, while a loss-exempt rule takes the payout without trading',
        ({ balance, lastPayoutBalance }) => {
            const cycle = { balance, cycleBestDayProfit: 0, lastPayoutBalance };
            expect(
                firstTradeRiskAfterOneRequest(qualifiedRule)(cycle),
            ).toBeGreaterThan(0);
            expect(firstTradeRiskAfterOneRequest(lossExemptRule)(cycle)).toBe(
                0,
            );
        },
    );

    it('scores the inclusive 40% on the real cycle profit: a $100 best day on a $250 cycle blocks the payout, a $75 best day pays it', () => {
        const alpha = firstTradeRiskAfterOneRequest(qualifiedRule);
        expect(
            alpha({
                balance: 1400,
                cycleBestDayProfit: 100,
                lastPayoutBalance: 1150,
            }),
        ).toBeGreaterThan(0);
        expect(
            alpha({
                balance: 1400,
                cycleBestDayProfit: 75,
                lastPayoutBalance: 1150,
            }),
        ).toBe(0);
    });

    it('control: an exclusive 40% boundary pays the same $100 best day on a $250 cycle', () => {
        expect(
            firstTradeRiskAfterOneRequest(exclusiveRule)({
                balance: 1400,
                cycleBestDayProfit: 100,
                lastPayoutBalance: 1150,
            }),
        ).toBe(0);
    });
});
