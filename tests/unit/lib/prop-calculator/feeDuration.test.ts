import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    type SimInputs,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

const topstep = new TopStep();
const tpt = new TakeProfitTrader();
const mffu = new MyFundedFutures();

function alwaysWinInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 60,
        maxEvalDays: 150,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
        ...overrides,
    } as SimInputs;
}

function findPlan(
    firm: MyFundedFutures | TakeProfitTrader | TopStep,
    id: Parameters<typeof firm.findPlan>[0],
) {
    const plan = firm.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

describe('funded-phase duration must not inflate a stopped-at-pass subscription', () => {
    it('Topstep: total cost is identical whether the funded horizon is 60 or 600 days', () => {
        const plan = findPlan(topstep, {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 60, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 600, plan }),
        );

        expect(short.passProbability).toBe(1);
        expect(long.passProbability).toBe(1);
        expect(short.expectedTotalCost).toBe(long.expectedTotalCost);
    });

    it('Topstep: total cost matches the eval-only fee schedule by hand', () => {
        const plan = findPlan(topstep, {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        const out = simulate(alwaysWinInputs({ fundedHorizonDays: 252, plan }));

        expect(out.passProbability).toBe(1);
        // $500/day profit (win: risk 250 * rr 2), $3,000 target -> 6 days -> 1 month.
        expect(out.expectedDaysToPass).toBe(6);
        expect(out.expectedTotalCost).toBe(149 + 49 * 1);
    });

    it('TPT: total cost is identical whether the funded horizon is 60 or 600 days', () => {
        const plan = tpt.plans[0];
        if (!plan) throw new Error('TPT must expose a plan');
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 60, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 600, plan }),
        );

        expect(short.passProbability).toBe(1);
        expect(long.passProbability).toBe(1);
        expect(short.expectedTotalCost).toBe(long.expectedTotalCost);
    });

    it('MFF (no monthly subscription): cost is trivially invariant too, as a sanity baseline', () => {
        const plan = mffu.plans[0];
        if (!plan) throw new Error('MFF must expose a plan');
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 60, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 600, plan }),
        );

        expect(short.expectedTotalCost).toBe(long.expectedTotalCost);
    });

    it('Topstep: an always-winning trader keeps receiving real payouts over a long horizon and never spuriously busts', () => {
        const plan = findPlan(topstep, {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 30, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 252, plan }),
        );

        expect(short.passProbability).toBe(1);
        expect(long.passProbability).toBe(1);
        expect(short.fundedBustProbability).toBe(0);
        expect(long.fundedBustProbability).toBe(0);
        expect(long.expectedGrossPayout).toBeGreaterThan(0);
        expect(long.expectedGrossPayout).toBeGreaterThan(
            short.expectedGrossPayout,
        );
    });

    it('Topstep: a trial that busts mid-eval is unaffected by fundedHorizonDays at all (never funds)', () => {
        const plan = findPlan(topstep, {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        const inputs = alwaysWinInputs({
            fundedHorizonDays: 252,
            plan,
            winrate: 0,
        });
        const short = simulate({ ...inputs, fundedHorizonDays: 60 });
        const long = simulate({ ...inputs, fundedHorizonDays: 6000 });

        expect(short.bustProbability).toBe(1);
        expect(long.bustProbability).toBe(1);
        expect(short.expectedTotalCost).toBe(long.expectedTotalCost);
    });
});
