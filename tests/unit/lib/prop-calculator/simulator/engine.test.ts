import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type CouponDiscounts,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    percent,
    type Plan,
    type PlanId,
    RetryKind,
    retryPath,
    RoiBasis,
    RungSizing,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    CorrelationMode,
    type SimInputs,
    type SimOutputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

const APEX_EOD: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const MFFU_RAPID_EOD: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
};

const APEX_WINRATE_ONE_FIRST_PAYOUT_DAY = 7;

const HALF_OFF_MONTHLY: CouponDiscounts = {
    activationPercent: percent(0),
    evalPercent: percent(0),
    monthlySubscriptionPercent: percent(50),
};

const TPT: PlanId = { accountSize: 50_000, firm: FirmId.Tpt };

const TOPSTEP_NO_FEE_STANDARD: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeStandard,
};

const TOPSTEP_NO_FEE_STANDARD_DLL: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeStandardDll,
};

const TOPSTEP_STANDARD: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function characterizationInputs(id: PlanId): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan: planFor(id),
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
    };
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

function scriptedRng(draws: readonly number[], fallback: number): Rng {
    let index = 0;
    return () => {
        const draw = draws[index];
        index += 1;
        return draw ?? fallback;
    };
}

const APEX_LADDER_POLICY: DayPolicy = {
    ladder: [600],
    maxLossesPerDay: null,
    stopRule: { kind: DayStopRuleKind.DayGreen },
};

describe('D2: eval pass and funded survive are two separate figures', () => {
    const out = simulate({
        evalDayPolicy: APEX_LADDER_POLICY,
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        plan: planFor(APEX_EOD),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 3000,
        winrate: 0.4,
    });

    it('evalPassProbability is every trial that did not bust or time out in the eval', () => {
        expect(out.evalPassProbability).toBeCloseTo(
            1 - out.bustProbability - out.timeoutProbability,
            12,
        );
    });

    it('funded survive plus funded bust partitions the eval passes', () => {
        expect(
            out.fundedSurvivalProbability + out.fundedBustProbability,
        ).toBeCloseTo(out.evalPassProbability, 12);
    });

    it('reports an eval pass rate well above the funded survival rate on the reviewer scenario', () => {
        expect(out.evalPassProbability).toBeGreaterThan(
            out.fundedSurvivalProbability + 0.2,
        );
    });

    it('no longer exposes the ambiguous passProbability field', () => {
        expect(Object.keys(out)).not.toContain('passProbability');
    });
});

describe('D2: simulatePortfolio counts eval passes per account', () => {
    const out = simulatePortfolio({
        ...characterizationInputs(MFFU_RAPID_EOD),
        accounts: 2,
        correlation: CorrelationMode.Independent,
        groups: 2,
    });

    it('perAccountPass is the eval pass rate, not the funded survival rate', () => {
        expect(out.perAccountPass).toBeGreaterThan(0.5);
    });

    it('perAccountFundedSurvival reports the accounts that never busted funded', () => {
        expect(out.perAccountFundedSurvival).toBe(0);
    });

    it('expectedAccountsPass and the distribution agree with the eval pass count', () => {
        expect(out.expectedAccountsPass).toBeCloseTo(
            out.perAccountPass * 2,
            12,
        );
        expect(out.pAtLeast.k1).toBeGreaterThan(0.5);
    });

    it('pAtLeastFundedSurvival stays at 0 when every funded account busts, although pAtLeast clears half', () => {
        expect(out.pAtLeast.kHalf).toBeGreaterThan(0.5);
        expect(out.pAtLeastFundedSurvival).toStrictEqual({
            k1: 0,
            kAll: 0,
            kHalf: 0,
        });
    });
});

describe('D2: simulatePortfolio reports k-of-N funded survival next to k-of-N eval pass', () => {
    const copy = simulatePortfolio({
        ...characterizationInputs(APEX_EOD),
        accounts: 2,
        correlation: CorrelationMode.Copy,
        groups: 1,
    });
    const independent = simulatePortfolio({
        ...characterizationInputs(APEX_EOD),
        accounts: 3,
        correlation: CorrelationMode.Independent,
        groups: 3,
    });

    it('copy-traded accounts survive together, so every k equals the per-account survival rate', () => {
        expect(copy.perAccountFundedSurvival).toBeGreaterThan(0);
        expect(copy.pAtLeastFundedSurvival.k1).toBeCloseTo(
            copy.perAccountFundedSurvival,
            12,
        );
        expect(copy.pAtLeastFundedSurvival.kHalf).toBeCloseTo(
            copy.perAccountFundedSurvival,
            12,
        );
        expect(copy.pAtLeastFundedSurvival.kAll).toBeCloseTo(
            copy.perAccountFundedSurvival,
            12,
        );
    });

    it('never exceeds the matching eval pass figure and is ordered k1 >= kHalf >= kAll', () => {
        const { k1, kAll, kHalf } = independent.pAtLeastFundedSurvival;
        expect(k1).toBeLessThanOrEqual(independent.pAtLeast.k1);
        expect(kHalf).toBeLessThanOrEqual(independent.pAtLeast.kHalf);
        expect(kAll).toBeLessThanOrEqual(independent.pAtLeast.kAll);
        expect(k1).toBeGreaterThanOrEqual(kHalf);
        expect(kHalf).toBeGreaterThanOrEqual(kAll);
        expect(kHalf).toBeGreaterThan(0);
    });
});

describe('R1-3: expectedFirstPayoutDay averages every paid trial, busted later or not', () => {
    it.each([
        { id: MFFU_RAPID_EOD, label: 'MFFU Rapid EOD' },
        { id: TPT, label: 'TPT Test to PRO' },
    ])(
        '$label reports a first payout day although almost every funded account busts',
        ({ id }) => {
            const out = simulate(characterizationInputs(id));
            expect(out.expectedGrossPayout).toBeGreaterThan(0);
            expect(out.fundedBustProbability).toBeGreaterThan(0.8);
            expect(out.expectedFirstPayoutDay).toBeGreaterThan(0);
            expect(out.expectedFirstPayoutDay).toBeLessThanOrEqual(150 + 252);
        },
    );

    it('tradesPerSuccessfulAttempt averages every eval pass, not only funded survivors', () => {
        const out = simulate(characterizationInputs(MFFU_RAPID_EOD));
        expect(out.tradesPerSuccessfulAttempt).toBeGreaterThan(0);
    });

    it('is unchanged when every paid trial also survived funded (Apex EOD, winrate 1)', () => {
        const out = simulate({
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            plan: planFor(APEX_EOD),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 5,
            winrate: 1,
        });
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedFirstPayoutDay).toBe(
            APEX_WINRATE_ONE_FIRST_PAYOUT_DAY,
        );
    });
});

describe('N-17: the first payout day is counted from the start of the first eval attempt', () => {
    const policy = flatDayPolicy(150, 1, { kind: DayStopRuleKind.None });
    const losingDaysToBust = 14;
    const winningDraw = 0.1;
    const losingDraw = 0.9;

    function runTrial(maxAttempts: number, draws: readonly number[]) {
        return simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
            fundedHorizonDays: 40,
            maxAttempts,
            maxEvalDays: 30,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan: planFor(TOPSTEP_STANDARD),
            positionSizing: null,
            rng: scriptedRng(draws, winningDraw),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });
    }

    it('adds the busted attempt days to the first payout day of a retried trial', () => {
        const firstTry = runTrial(1, []);
        const afterRetry = runTrial(
            2,
            Array.from({ length: losingDaysToBust }, () => losingDraw),
        );

        expect(firstTry.firstPayoutDay).not.toBeNull();
        expect(afterRetry.attemptsUsed).toBe(2);
        expect(afterRetry.daysToPass).toBe(firstTry.daysToPass);
        expect(afterRetry.firstPayoutDay).toBe(
            (firstTry.firstPayoutDay ?? 0) + losingDaysToBust,
        );
    });
});

describe('R1-4: expectancyR divides by the realized average risk', () => {
    const mffu = planFor(MFFU_RAPID_EOD);

    it('is exactly rr when every trade wins under a ladder that differs from riskPerTrade', () => {
        const out = simulate({
            commissionPerRoundTrip: 0,
            dayStop: { kind: DayStopRuleKind.None },
            evalDayPolicy: {
                ladder: [400, 600],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            fundedHorizonDays: 60,
            fundedRiskPerTrade: 250,
            maxEvalDays: 60,
            plan: mffu,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 2,
            trials: 20,
            winrate: 1,
        });
        expect(out.expectancyR).toBe(2);
        expect(out.averageRiskPerTrade).toBeGreaterThan(250);
        expect(out.averageRiskPerTrade).toBeLessThan(600);
    });

    it('keeps the flat-risk result: average risk equals riskPerTrade and expectancyR equals rr', () => {
        const out = simulate({
            commissionPerRoundTrip: 0,
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            plan: mffu,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 2,
            trials: 20,
            winrate: 1,
        });
        expect(out.averageRiskPerTrade).toBe(250);
        expect(out.expectancyR).toBe(2);
    });
});

describe('R1-29 and TG-1: ROI on cost wiring', () => {
    it('divides expected net by expected total cost', () => {
        const out = simulate({
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            plan: planFor(APEX_EOD),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 200,
            winrate: 0.5,
        });
        expect(out.expectedTotalCost).toBeGreaterThan(0);
        expect(out.roiOnCost.basis).toBe(RoiBasis.TotalOnCost);
        expect(out.roiOnCost.value).toBeCloseTo(
            out.expectedNet / out.expectedTotalCost,
            12,
        );
    });

    it('reports n/a (null), not 0%, when every fee is discounted to zero', () => {
        const out = simulate({
            discounts: {
                activationPercent: percent(100),
                evalPercent: percent(100),
            },
            fundedHorizonDays: 252,
            maxAttempts: 1,
            maxEvalDays: 60,
            plan: planFor(APEX_EOD),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 500,
            winrate: 0.5,
        });
        expect(out.expectedTotalCost).toBe(0);
        expect(out.expectedNet).toBeGreaterThan(0);
        expect(out.roiOnCost.value).toBeNull();
    });
});

describe('R1-2: sim cost per funded account follows the D1 formula', () => {
    const apex = planFor(APEX_EOD);
    const evalFee = apex.fees.oneTimeEval;
    const activation = apex.fees.activation;

    function withReset(reset: number): Plan {
        return apex.withOverrides({
            fees: {
                ...apex.fees,
                reset: dollars(reset),
                retry: RetryKind.Reset,
            },
        });
    }

    const base = simulate(retryInputs(apex));

    it('uses a scenario with real retries and real eval failures', () => {
        expect(apex.fees.reset).toBe(evalFee);
        expect(apex.fees.monthlySubscription).toBe(0);
        expect(base.expectedAttempts).toBeGreaterThan(1.05);
        expect(base.evalPassProbability).toBeGreaterThan(0.2);
        expect(base.evalPassProbability).toBeLessThan(1);
    });

    it('divides the eval spend by the per-attempt eval pass rate and charges the activation once', () => {
        expect(base.costPerFundedAccount).toBeCloseTo(
            (evalFee * base.expectedAttempts) / base.evalPassProbability +
                activation,
            6,
        );
        expect(base.costPerDrawdownDollar).toBeCloseTo(
            base.costPerFundedAccount / apex.fundedDrawdown.amount,
            9,
        );
    });

    it('prices every retry at a cheap reset fee', () => {
        const cheap = simulate(retryInputs(withReset(100)));
        expect(cheap.costPerFundedAccount).toBeCloseTo(
            evalFee +
                (cheap.expectedAttempts / cheap.evalPassProbability - 1) * 100 +
                activation,
            6,
        );
        expect(cheap.costBreakdown.resetFeesTotal).toBeCloseTo(
            100 * (cheap.expectedAttempts - 1),
            6,
        );
    });

    it('re-buys instead of paying a reset that costs more than a fresh eval', () => {
        const pricey = simulate(retryInputs(withReset(900)));
        expect(pricey.costBreakdown.resetFeesTotal).toBeCloseTo(
            evalFee * (pricey.expectedAttempts - 1),
            6,
        );
        expect(pricey.expectedTotalCost).toBe(base.expectedTotalCost);
        expect(pricey.costPerFundedAccount).toBeCloseTo(
            base.costPerFundedAccount,
            9,
        );
    });

    it('honours the monthly coupon in the cost breakdown on a plan that stays on the reset path', () => {
        const topstep = planFor(TOPSTEP_STANDARD);
        const freeReset = topstep.withOverrides({
            fees: { ...topstep.fees, reset: dollars(0) },
        });
        const inputs = {
            ...characterizationInputs(TOPSTEP_STANDARD),
            plan: freeReset,
        };
        const full = simulate(inputs);
        const halved = simulate({ ...inputs, discounts: HALF_OFF_MONTHLY });
        expect(topstep.fees.monthlySubscription).toBeGreaterThan(0);
        expect(retryPath(freeReset.fees, HALF_OFF_MONTHLY)).toBe(
            RetryKind.Reset,
        );
        expect(full.costBreakdown.subscriptionPerFundedAccount).toBeGreaterThan(
            0,
        );
        expect(halved.costBreakdown.subscriptionPerFundedAccount).toBeCloseTo(
            full.costBreakdown.subscriptionPerFundedAccount / 2,
            9,
        );
    });

    it('follows the re-buy path the monthly coupon makes cheaper: at half off, a $24.50 TopStep re-buy undercuts the $49 reset, and the subscription row stays the subscription part of the cost per funded account', () => {
        const topstep = planFor(TOPSTEP_STANDARD);
        const halved = simulate({
            ...characterizationInputs(TOPSTEP_STANDARD),
            discounts: HALF_OFF_MONTHLY,
        });
        expect(retryPath(topstep.fees)).toBe(RetryKind.Reset);
        expect(retryPath(topstep.fees, HALF_OFF_MONTHLY)).toBe(RetryKind.Rebuy);
        expect(halved.costBreakdown.subscriptionPerFundedAccount).toBeCloseTo(
            halved.costPerFundedAccount - topstep.fees.activation,
            6,
        );
    });
});

describe('R1-2 review: a subscription plan bills the renewal chain, whatever maxAttempts is', () => {
    const topstep = planFor(TOPSTEP_NO_FEE_STANDARD);
    const continuous = simulate({ ...retryInputs(topstep), maxAttempts: 50 });
    const single = simulate({ ...retryInputs(topstep), maxAttempts: 1 });
    const initialEval = topstep.fees.oneTimeEval;
    const activation = topstep.fees.activation;

    it('uses a TopStep scenario with a monthly bill and real eval failures', () => {
        expect(topstep.fees.monthlySubscription).toBeGreaterThan(0);
        expect(continuous.evalPassProbability).toBe(1);
        expect(continuous.expectedAttempts).toBeGreaterThan(1.2);
        expect(single.evalPassProbability).toBeLessThan(0.9);
    });

    it('matches the spend the sim bills on continuous retry chains', () => {
        const chainSpend =
            continuous.expectedTotalCost -
            initialEval -
            continuous.costBreakdown.resetFeesTotal -
            activation;
        const fromChains =
            initialEval +
            (continuous.expectedAttempts - 1) * topstep.retryFee() +
            chainSpend +
            activation;
        expect(continuous.costPerFundedAccount / fromChains).toBeCloseTo(1, 2);
    });

    it('prices a one-attempt run like the continuous chains instead of billing a fresh month per failed attempt', () => {
        expect(
            single.costPerFundedAccount / continuous.costPerFundedAccount,
        ).toBeCloseTo(1, 1);
    });
});

describe('N-60: the cost breakdown bills a re-buy subscription plan on the re-buy path, like the cost per funded account', () => {
    const noFeeDll = planFor(TOPSTEP_NO_FEE_STANDARD_DLL);
    const rebuyWithEval = noFeeDll.withOverrides({
        fees: {
            ...noFeeDll.fees,
            activation: dollars(60),
            oneTimeEval: dollars(40),
            retry: RetryKind.Rebuy,
        },
    });

    it('uses TopStep No-fee DLL, whose $85 re-buy undercuts the $95 reset, with real retries and real passes', () => {
        const out = simulate(retryInputs(noFeeDll));
        expect(retryPath(noFeeDll.fees)).toBe(RetryKind.Rebuy);
        expect(noFeeDll.fees.monthlySubscription).toBeGreaterThan(0);
        expect(out.expectedAttempts).toBeGreaterThan(1.05);
        expect(out.evalPassProbability).toBeGreaterThan(0.2);
    });

    it('reports the whole cost per funded account as subscription on a plan with no eval or activation fee', () => {
        const out = simulate(retryInputs(noFeeDll));
        expect(out.costBreakdown.subscriptionPerFundedAccount).toBeCloseTo(
            out.costPerFundedAccount,
            6,
        );
    });

    it('reports the subscription part of the cost per funded account when the re-buy also carries an eval fee', () => {
        const out = simulate(retryInputs(rebuyWithEval));
        expect(out.costBreakdown.subscriptionPerFundedAccount).toBeCloseTo(
            subscriptionPartOfCost(rebuyWithEval, out),
            6,
        );
    });
});

describe('N-55: the per-trial cost breakdown rows add up to the average total cost', () => {
    const standard = planFor(TOPSTEP_STANDARD);
    const normal = simulate(characterizationInputs(TOPSTEP_STANDARD));

    it('uses a subscription plan with an activation fee and a normal mix of passes and failures', () => {
        expect(standard.fees.monthlySubscription).toBeGreaterThan(0);
        expect(standard.fees.activation).toBeGreaterThan(0);
        expect(normal.evalPassProbability).toBeGreaterThan(0);
        expect(normal.evalPassProbability).toBeLessThan(1);
        expect(normal.costBreakdown.subscriptionPerTrial).toBeGreaterThan(0);
    });

    it('sums eval, activation, resets and subscription to expectedTotalCost on a normal run', () => {
        expect(perTrialRowsTotal(normal)).toBeCloseTo(
            normal.expectedTotalCost,
            6,
        );
    });

    it('charges the activation per trial only on the trials that reach the funded account', () => {
        expect(normal.costBreakdown.activationFee).toBeCloseTo(
            normal.costBreakdown.perAccountActivationFee *
                normal.evalPassProbability,
            9,
        );
    });

    it('multiplies every per-trial row by the copy count and still sums to expectedTotalCost', () => {
        const copies = simulate({
            ...characterizationInputs(TOPSTEP_STANDARD),
            copyAccounts: 3,
        });
        expect(copies.costBreakdown.subscriptionPerTrial).toBeCloseTo(
            3 * normal.costBreakdown.subscriptionPerTrial,
            6,
        );
        expect(perTrialRowsTotal(copies)).toBeCloseTo(
            copies.expectedTotalCost,
            6,
        );
    });

    it('sums to expectedTotalCost on a re-buy subscription plan too', () => {
        const rebuy = simulate(
            retryInputs(planFor(TOPSTEP_NO_FEE_STANDARD_DLL)),
        );
        expect(rebuy.costBreakdown.resetFeesTotal).toBeGreaterThan(0);
        expect(perTrialRowsTotal(rebuy)).toBeCloseTo(
            rebuy.expectedTotalCost,
            6,
        );
    });
});

describe('N-13: the engine fails loud on a trial, account, attempt or eval-day count that is not a positive safe integer', () => {
    const invalidTrialCounts = [0, -5, 1.5, NaN, Infinity, 2 ** 53];

    it.each(invalidTrialCounts)(
        'simulate rejects trials %s instead of reporting a run of zeros',
        (trials) => {
            expect(() =>
                simulate({ ...characterizationInputs(APEX_EOD), trials }),
            ).toThrow(/trials must be a positive safe integer/);
        },
    );

    it.each(invalidTrialCounts)(
        'simulatePortfolio rejects trials %s',
        (trials) => {
            expect(() =>
                simulatePortfolio({
                    ...characterizationInputs(APEX_EOD),
                    accounts: 2,
                    correlation: CorrelationMode.Independent,
                    groups: 2,
                    trials,
                }),
            ).toThrow(/trials must be a positive safe integer/);
        },
    );

    it.each(
        invalidTrialCounts.flatMap((value) =>
            (['maxEvalDays', 'maxAttempts', 'copyAccounts'] as const).map(
                (field) => [field, value] as const,
            ),
        ),
    )('simulate rejects %s %s instead of clamping it', (field, value) => {
        expect(() =>
            simulate({ ...characterizationInputs(APEX_EOD), [field]: value }),
        ).toThrow(new RegExp(`${field} must be a positive safe integer`));
    });

    it.each(
        invalidTrialCounts.flatMap((value) =>
            (['accounts', 'maxEvalDays', 'maxAttempts'] as const).map(
                (field) => [field, value] as const,
            ),
        ),
    )(
        'simulatePortfolio rejects %s %s instead of clamping it',
        (field, value) => {
            const invalid = { [field]: value };
            expect(() =>
                simulatePortfolio({
                    ...characterizationInputs(APEX_EOD),
                    accounts: 2,
                    correlation: CorrelationMode.Independent,
                    groups: 2,
                    ...invalid,
                }),
            ).toThrow(new RegExp(`${field} must be a positive safe integer`));
        },
    );

    it('still runs a single trial', () => {
        expect(
            simulate({ ...characterizationInputs(APEX_EOD), trials: 1 })
                .finalBalances,
        ).toHaveLength(1);
    });
});

describe('T13a: the first payout day includes the rebuy lag of every earlier failed attempt', () => {
    it('adds the lag once per failed attempt before the paid one', () => {
        const noLag = firstPayoutDay(3, 0);
        const lag10 = firstPayoutDay(3, 10);
        const lag20 = firstPayoutDay(3, 20);
        expect(lag10 - noLag).toBeGreaterThan(0);
        expect(lag10 - noLag).toBeLessThan(10 * 2);
        expect(lag20 - noLag).toBeCloseTo(2 * (lag10 - noLag), 9);
    });

    it('adds nothing when every paid trial passed on its first attempt', () => {
        expect(firstPayoutDay(1, 10)).toBe(firstPayoutDay(1, 0));
    });
});

function firstPayoutDay(maxAttempts: number, rebuyLagDays: number) {
    return simulate({
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 252,
        maxAttempts,
        maxEvalDays: 150,
        plan: planFor(APEX_EOD),
        rebuyLagDays,
        riskPerTrade: 400,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 2,
        trials: 400,
        winrate: 0.5,
    }).expectedFirstPayoutDay;
}

function perTrialRowsTotal(out: SimOutputs): number {
    const { activationFee, evalFee, resetFeesTotal, subscriptionPerTrial } =
        out.costBreakdown;
    return activationFee + evalFee + resetFeesTotal + subscriptionPerTrial;
}

function retryInputs(plan: Plan): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 252,
        maxAttempts: 3,
        maxEvalDays: 150,
        plan,
        riskPerTrade: 400,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 2,
        trials: 400,
        winrate: 0.5,
    };
}

function subscriptionPartOfCost(plan: Plan, out: SimOutputs): number {
    const retries = out.expectedAttempts / out.evalPassProbability - 1;
    return (
        out.costPerFundedAccount -
        plan.fees.oneTimeEval -
        retries * plan.fees.oneTimeEval -
        plan.fees.activation
    );
}
