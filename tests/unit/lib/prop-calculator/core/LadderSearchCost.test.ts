import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type CouponDiscounts,
    DayStopRuleKind,
    dollars,
    FirmId,
    FtmoFuturesVariant,
    type LadderScore,
    type LadderScoreConfig,
    ladderTrialStreams,
    LucidVariant,
    MffuVariant,
    percent,
    type Plan,
    type PlanId,
    PolicySizing,
    replacementEconomics,
    RungSizing,
    scoreLadder,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type SimOutputs, simulate } from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${JSON.stringify(id)} not found`);
    return plan;
}

const rapidEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const lucidDailyEodDll = planFor({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.DailyEodDll,
});
const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const ftmoGrowth = planFor({
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Growth,
});
const topStep = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const PARITY_TRIALS = 20_000;

function score(
    plan: Plan,
    ladder: readonly number[],
    discounts?: CouponDiscounts,
): LadderScore {
    const config: LadderScoreConfig = {
        commission: 0,
        cushion: plan.drawdown.amount,
        discounts,
        maxDays: 150,
        plan,
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: 4000,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.4,
    };
    return scoreLadder(ladder, config, ladderTrialStreams(90_210));
}

function simulated(plan: Plan, ladder: readonly number[]): SimOutputs {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    return simulate({
        commissionPerRoundTrip: 0,
        copyAccounts: 1,
        dayStop: stopRule,
        discounts: undefined,
        evalDayPolicy: {
            ladder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule,
        },
        fundedHorizonDays: 1,
        maxAttempts: 1,
        maxEvalDays: 150,
        minRetainedCushion: 0,
        plan,
        riskPerTrade: ladder[0] ?? 0,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: ladder.length,
        trials: PARITY_TRIALS,
        winrate: 0.4,
    });
}

function synthetic(fees: {
    activation?: number;
    oneTimeEval?: number;
    reset?: number;
}): Plan {
    return rapidEod.withOverrides({
        fees: {
            activation: dollars(fees.activation ?? 0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(fees.oneTimeEval ?? 0),
            reset: dollars(fees.reset ?? 0),
        },
    });
}

describe('scoreLadder prices a funded account with the shared D1 formula', () => {
    it.each([
        ['MFFU Rapid EOD', rapidEod],
        ['Lucid Daily EOD DLL', lucidDailyEodDll],
        ['Apex EOD', apexEod],
    ])('%s: cost and days equal replacementEconomics exactly', (_, plan) => {
        expect(plan.fees.monthlySubscription).toBe(0);
        const s = score(plan, [400, 600, 500]);
        expect(s.passRate).toBeGreaterThan(0.02);
        const economics = replacementEconomics({
            discounts: undefined,
            evalPassRate: s.passRate,
            fees: plan.fees,
            meanDaysOnFail: s.meanDaysOnFail,
            meanDaysOnPass: s.meanDaysOnPass,
        });
        expect(s.costPerFunded).toBe(economics.costPerFundedAccount);
        expect(s.expectedDaysToFunded).toBe(economics.daysPerFundedAccount);
    });

    it('charges the eval once, a cheap reset per retry and the activation once', () => {
        const s = score(
            synthetic({ activation: 50, oneTimeEval: 100, reset: 40 }),
            [400, 600, 500],
        );
        expect(s.costPerFunded).toBeCloseTo(
            100 + (1 / s.passRate - 1) * 40 + 50,
            6,
        );
    });

    it('re-buys when the reset costs more than a new eval', () => {
        const s = score(
            synthetic({ oneTimeEval: 100, reset: 120 }),
            [400, 600, 500],
        );
        expect(s.costPerFunded).toBeCloseTo(100 / s.passRate, 6);
    });

    it('prices Lucid Daily EOD DLL retries at its $110 reset, below a full re-buy', () => {
        expect(lucidDailyEodDll.fees.oneTimeEval).toBe(160);
        expect(lucidDailyEodDll.fees.reset).toBe(110);
        expect(lucidDailyEodDll.fees.activation).toBe(0);
        expect(lucidDailyEodDll.fees.monthlySubscription).toBe(0);

        const s = score(lucidDailyEodDll, [400, 600, 500]);
        expect(s.passRate).toBeLessThan(1);
        expect(s.costPerFunded).toBeCloseTo(
            160 + (1 / s.passRate - 1) * 110,
            6,
        );
        expect(s.costPerFunded).toBeLessThan(160 / s.passRate);
    });

    it('does not multiply the Apex activation fee by the attempt count', () => {
        const s = score(apexEod, [400, 800]);
        const withoutActivation = replacementEconomics({
            discounts: undefined,
            evalPassRate: s.passRate,
            fees: { ...apexEod.fees, activation: dollars(0) },
            meanDaysOnFail: s.meanDaysOnFail,
            meanDaysOnPass: s.meanDaysOnPass,
        });
        expect(apexEod.fees.activation).toBeGreaterThan(0);
        expect(s.costPerFunded - apexEod.fees.activation).toBeCloseTo(
            withoutActivation.costPerFundedAccount,
            6,
        );
    });

    it('applies coupon discounts to the eval and keeps the cheaper retry path', () => {
        const s = score(
            synthetic({ activation: 50, oneTimeEval: 100, reset: 40 }),
            [400, 600, 500],
            { activationPercent: percent(0), evalPercent: percent(50) },
        );
        expect(s.costPerFunded).toBeCloseTo(
            50 + (1 / s.passRate - 1) * Math.min(40, 50) + 50,
            6,
        );
    });
});

describe('scoreLadder bills a subscription the way the simulator does', () => {
    it.each([
        ['FTMO Growth 50K [400]', ftmoGrowth, [400]],
        ['FTMO Growth 50K [400, 400]', ftmoGrowth, [400, 400]],
        ['FTMO Growth 50K [400, 400, 400]', ftmoGrowth, [400, 400, 400]],
        ['TopStep 50K [500, 500]', topStep, [500, 500]],
    ])(
        '%s: cost per funded account within 3%% of prop sim',
        (_, plan, ladder) => {
            expect(plan.fees.monthlySubscription).toBeGreaterThan(0);
            const s = scoreLadder(
                ladder,
                {
                    commission: 0,
                    cushion: plan.drawdown.amount,
                    maxDays: 150,
                    plan,
                    positionSizing: null,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seedOffset: 0,
                    sims: PARITY_TRIALS,
                    stopRule: { kind: DayStopRuleKind.DayGreen },
                    winrate: 0.4,
                },
                ladderTrialStreams(42),
            );
            const sim = simulated(plan, ladder);
            expect(Math.abs(s.passRate - sim.evalPassProbability)).toBeLessThan(
                0.02,
            );
            expect(
                Math.abs(s.costPerFunded - sim.costPerFundedAccount),
            ).toBeLessThan(0.03 * sim.costPerFundedAccount);
        },
        60_000,
    );

    it('keeps the days per funded account on the shared formula', () => {
        const s = score(ftmoGrowth, [400, 600, 500]);
        expect(s.expectedDaysToFunded).toBe(
            replacementEconomics({
                discounts: undefined,
                evalPassRate: s.passRate,
                fees: ftmoGrowth.fees,
                meanDaysOnFail: s.meanDaysOnFail,
                meanDaysOnPass: s.meanDaysOnPass,
            }).daysPerFundedAccount,
        );
    });
});
