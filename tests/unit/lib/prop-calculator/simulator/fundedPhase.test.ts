import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    computedDayPolicy,
    dollars,
    fraction,
    type FundedCycleSnapshot,
    FundedResetEligibility,
    PolicySizing,
} from '~/lib/prop-calculator/core';
import { type FundedPayoutOptions } from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { FundedStage, simulate } from '~/lib/prop-calculator/simulator';
import { type FundedDaysOptions } from '~/lib/prop-calculator/simulator/fundedPhase';

import { payoutCapToyPlan } from './toyPlans';

describe('the funded day loop hands the day policy the balance left after the last payout', () => {
    it('passes the starting balance before any payout and the post-debit balance after one', () => {
        const recorded: {
            balance: number;
            fundedCycle: FundedCycleSnapshot | undefined;
        }[] = [];
        const dayPolicy = computedDayPolicy(
            (state, _tradeIndexToday, fundedCycle) => {
                recorded.push({ balance: state.balance, fundedCycle });
                return 100;
            },
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const out = simulate({
            fundedDayPolicy: dayPolicy,
            fundedHorizonDays: 50,
            maxEvalDays: 1,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: fraction(1),
        });

        expect(out.expectedGrossPayout).toBeCloseTo(250, 10);
        expect(recorded).toStrictEqual([
            {
                balance: 1000,
                fundedCycle: {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                },
            },
            {
                balance: 1100,
                fundedCycle: {
                    cycleBestDayProfit: 100,
                    dayGateProgress: 1,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                },
            },
            {
                balance: 1200,
                fundedCycle: {
                    cycleBestDayProfit: 100,
                    dayGateProgress: 2,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                },
            },
            {
                balance: 1150,
                fundedCycle: {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: 1150,
                    payoutsIssued: 1,
                },
            },
        ]);
    });
});

describe('the funded day loop hands the day policy how many funded resets were used (N-34)', () => {
    it('counts 0, 1 and 2 across the reset layers of an account that busts every day', () => {
        const recorded: (number | undefined)[] = [];
        const dayPolicy = computedDayPolicy(
            (_state, _tradeIndexToday, fundedCycle) => {
                recorded.push(fundedCycle?.fundedResetsUsed);
                return 100;
            },
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const out = simulate({
            fundedDayPolicy: dayPolicy,
            fundedHorizonDays: 50,
            maxEvalDays: 1,
            plan: payoutCapToyPlan().withOverrides({
                fundedReset: {
                    eligibility: FundedResetEligibility.NoPayoutEverRequested,
                    fee: dollars(20),
                    label: 'Toy Reset',
                    maxPerAccount: 2,
                    windowCalendarDays: 7,
                },
                takesFundedReset: true,
            }),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: fraction(0),
        });

        expect(recorded).toStrictEqual([0, 1, 2]);
        expect(out.expectedFundedResets).toBe(2);
        expect(out.fundedBustProbability).toBe(1);
    });
});

describe('the funded phase has no payout budget besides the plan rules (N-14)', () => {
    it('ends a funded run only by a bust, a concluded account or the horizon', () => {
        expect(
            Object.values(FundedStage).toSorted((a, b) => a.localeCompare(b)),
        ).toStrictEqual([
            FundedStage.Busted,
            FundedStage.Concluded,
            FundedStage.HorizonReached,
        ]);
    });

    it('takes no maxPayouts option in the payout or the funded-days options', () => {
        expectTypeOf<FundedPayoutOptions>().not.toHaveProperty('maxPayouts');
        expectTypeOf<FundedDaysOptions>().not.toHaveProperty('maxPayouts');
    });
});
