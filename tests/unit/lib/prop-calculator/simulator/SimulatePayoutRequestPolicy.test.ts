import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    computedDayPolicy,
    FirmId,
    fraction,
    MffuVariant,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    type Plan,
    type PlanId,
    PolicySizing,
    TopStepVariant,
    withPlanOptIns,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type PortfolioTimelineInputs,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import {
    CorrelationMode,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    type SimOutputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

import { payoutCapToyPlan } from './toyPlans';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) {
        throw new Error(`plan ${JSON.stringify(id)} not found`);
    }
    return plan;
}

const RAPID_EOD = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

const ALPHA_ZERO_WITH_RESET = withPlanOptIns(
    planFor({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Zero,
    }),
    { ...NO_PLAN_OPT_INS, takesFundedReset: true },
);

const TOPSTEP = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeStandard,
});

function pinInputs(plan: Plan): SimInputs {
    return {
        fundedHorizonDays: 60,
        fundedRiskPerTrade: 250,
        maxAttempts: 2,
        maxEvalDays: 60,
        payoutRequestSize: 1000,
        plan,
        riskPerTrade: 400,
        rrRatio: 2,
        seed: 11,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
    };
}

function pinnedFields(out: SimOutputs): Record<string, number> {
    return {
        evalPassProbability: out.evalPassProbability,
        expectedDaysToPass: out.expectedDaysToPass,
        expectedFirstPayoutDay: out.expectedFirstPayoutDay,
        expectedFundedResets: out.expectedFundedResets,
        expectedGrossPayout: out.expectedGrossPayout,
        expectedHorizonCredit: out.expectedHorizonCredit,
        expectedMonthlyNet: out.expectedMonthlyNet,
        expectedMonthlyRealizedNet: out.expectedMonthlyRealizedNet,
        expectedNet: out.expectedNet,
        expectedPayoutCount: out.expectedPayoutCount,
        expectedTotalCost: out.expectedTotalCost,
        finalBalanceP50: out.finalBalanceP50,
        fundedBustProbability: out.fundedBustProbability,
    };
}

function portfolioPin(plan: Plan) {
    return simulatePortfolio({
        ...pinInputs(plan),
        accounts: 3,
        correlation: CorrelationMode.Independent,
        groups: 1,
        trials: 60,
    });
}

function timelinePin() {
    const out = simulatePortfolioTimeline({
        accounts: 2,
        dayBudget: 120,
        maxEvalDays: 60,
        payoutRequestSize: 1000,
        plan: RAPID_EOD,
        riskPerTrade: 400,
        rrRatio: 2,
        seed: 5,
        tradesPerDay: 2,
        trials: 40,
        winrate: 0.5,
    });
    return {
        breakEvenMonths: out.breakEvenMonthValues.length,
        netP50: out.netP50.at(-1),
        payoutP50: out.payoutP50.at(-1),
        payoutP90: out.payoutP90.at(-1),
        pEverCashflowPositive: out.pEverCashflowPositive,
        spendP50: out.spendP50.at(-1),
    };
}

describe('default payout policy paths equal the PT-14 pins (PD-31, captured before PT-14)', () => {
    it('simulate on a funded flat case', () => {
        const fields = pinnedFields(simulate(pinInputs(RAPID_EOD)));
        expect(fields).toMatchInlineSnapshot(`
          {
            "evalPassProbability": 0.955,
            "expectedDaysToPass": 12.277486910994764,
            "expectedFirstPayoutDay": 23.755681818181817,
            "expectedFundedResets": 0,
            "expectedGrossPayout": 9634.05,
            "expectedHorizonCredit": 27,
            "expectedMonthlyNet": 3105.4652897754045,
            "expectedMonthlyRealizedNet": 3096.559996858803,
            "expectedNet": 9388.475,
            "expectedPayoutCount": 13.995,
            "expectedTotalCost": 245.575,
            "finalBalanceP50": 52350,
            "fundedBustProbability": 0.175,
          }
        `);
    });

    it('simulate on Alpha Zero with the Qualified Reset taken', () => {
        const fields = pinnedFields(simulate(pinInputs(ALPHA_ZERO_WITH_RESET)));
        expect(fields).toMatchInlineSnapshot(`
          {
            "evalPassProbability": 0.97,
            "expectedDaysToPass": 7.242268041237113,
            "expectedFirstPayoutDay": 20.396907216494846,
            "expectedFundedResets": 0.065,
            "expectedGrossPayout": 3651.375,
            "expectedHorizonCredit": 852,
            "expectedMonthlyNet": 1360.2383996390163,
            "expectedMonthlyRealizedNet": 1091.1250658043168,
            "expectedNet": 3454.45,
            "expectedPayoutCount": 4.765,
            "expectedTotalCost": 196.925,
            "finalBalanceP50": 59875,
            "fundedBustProbability": 0,
          }
        `);
    });

    it('simulate on a TopStep case', () => {
        const fields = pinnedFields(simulate(pinInputs(TOPSTEP)));
        expect(fields).toMatchInlineSnapshot(`
          {
            "evalPassProbability": 0.985,
            "expectedDaysToPass": 6.934010152284264,
            "expectedFirstPayoutDay": 14.585492227979275,
            "expectedFundedResets": 0,
            "expectedGrossPayout": 4530.665625,
            "expectedHorizonCredit": 230.625,
            "expectedMonthlyNet": 1925.510366334681,
            "expectedMonthlyRealizedNet": 1829.9946381027514,
            "expectedNet": 4418.565625,
            "expectedPayoutCount": 5.92,
            "expectedTotalCost": 112.1,
            "finalBalanceP50": 56500,
            "fundedBustProbability": 0.345,
          }
        `);
    });

    it('simulatePortfolio on the funded flat, Alpha Zero reset and TopStep cases', () => {
        expect(portfolioPin(RAPID_EOD)).toMatchInlineSnapshot(`
          {
            "accountsPassDistribution": [
              0,
              0.03333333333333333,
              0.05,
              0.9166666666666666,
            ],
            "expectedAccountsPass": 2.8833333333333333,
            "expectedDaysToPass": 11.942196531791907,
            "expectedMaxLossStreak": 7.483333333333333,
            "expectedMonthlyNet": 9273.760800206948,
            "expectedMonthlyRealizedNet": 9237.091834095023,
            "expectedNet": 28339.3,
            "meanTradesPerDay": 1.9963783737173406,
            "pAtLeast": {
              "k1": 1,
              "kAll": 0.9166666666666666,
              "kHalf": 0.9666666666666667,
            },
            "pAtLeastFundedSurvival": {
              "k1": 1,
              "kAll": 0.5166666666666667,
              "kHalf": 0.9000000000000001,
            },
            "pHitDDLimit": 0.48333333333333334,
            "perAccountFundedSurvival": 0.8055555555555556,
            "perAccountPass": 0.9611111111111111,
          }
        `);
        expect(portfolioPin(ALPHA_ZERO_WITH_RESET)).toMatchInlineSnapshot(`
          {
            "accountsPassDistribution": [
              0,
              0.03333333333333333,
              0.05,
              0.9166666666666666,
            ],
            "expectedAccountsPass": 2.8833333333333333,
            "expectedDaysToPass": 6.416184971098266,
            "expectedMaxLossStreak": 7.5,
            "expectedMonthlyNet": 4071.0441749675188,
            "expectedMonthlyRealizedNet": 3261.784755305327,
            "expectedNet": 9962.25,
            "meanTradesPerDay": 1.9966219142485924,
            "pAtLeast": {
              "k1": 1,
              "kAll": 0.9166666666666666,
              "kHalf": 0.9666666666666667,
            },
            "pAtLeastFundedSurvival": {
              "k1": 1,
              "kAll": 0.8333333333333334,
              "kHalf": 0.9666666666666667,
            },
            "pHitDDLimit": 0.16666666666666666,
            "perAccountFundedSurvival": 0.9333333333333333,
            "perAccountPass": 0.9611111111111111,
          }
        `);
        expect(portfolioPin(TOPSTEP)).toMatchInlineSnapshot(`
          {
            "accountsPassDistribution": [
              0,
              0.03333333333333333,
              0.05,
              0.9166666666666666,
            ],
            "expectedAccountsPass": 2.8833333333333333,
            "expectedDaysToPass": 6.416184971098266,
            "expectedMaxLossStreak": 7.133333333333334,
            "expectedMonthlyNet": 5732.493320610687,
            "expectedMonthlyRealizedNet": 5400.145992366412,
            "expectedNet": 13100.354166666666,
            "meanTradesPerDay": 1.9934569247546348,
            "pAtLeast": {
              "k1": 1,
              "kAll": 0.9166666666666666,
              "kHalf": 0.9666666666666667,
            },
            "pAtLeastFundedSurvival": {
              "k1": 0.9500000000000001,
              "kAll": 0.2833333333333333,
              "kHalf": 0.75,
            },
            "pHitDDLimit": 0.7166666666666667,
            "perAccountFundedSurvival": 0.6611111111111111,
            "perAccountPass": 0.9611111111111111,
          }
        `);
    });

    it('simulatePortfolioTimeline on one plan', () => {
        expect(timelinePin()).toMatchInlineSnapshot(`
          {
            "breakEvenMonths": 40,
            "netP50": 48198,
            "pEverCashflowPositive": 1,
            "payoutP50": 48870,
            "payoutP90": 61380,
            "spendP50": 627,
          }
        `);
    });
});

function deterministicWinDayPolicy(recorded: number[]) {
    return computedDayPolicy(
        (state) => {
            recorded.push(state.balance);
            return 100;
        },
        1,
        undefined,
        PolicySizing.ContractCapped,
    );
}

function toyInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        fundedHorizonDays: 50,
        maxEvalDays: 1,
        plan: payoutCapToyPlan(),
        riskPerTrade: 100,
        rrRatio: 1,
        seed: 7,
        tradesPerDay: 1,
        trials: 1,
        winrate: fraction(1),
        ...overrides,
    };
}

describe('FullRequestOnly waits for the full request instead of taking what UpToRequest takes', () => {
    it('pays exactly 300 across 2 payouts on this toy plan under FullRequestOnly, unlike UpToRequest on the same request size', () => {
        const fullRequestRecorded: number[] = [];
        const fullRequestOut = simulate(
            toyInputs({
                fundedDayPolicy: deterministicWinDayPolicy(fullRequestRecorded),
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: 150,
            }),
        );
        expect(fullRequestRecorded).toStrictEqual([
            1000, 1100, 1200, 1150, 1250,
        ]);
        expect(fullRequestOut.expectedGrossPayout).toBe(300);
        expect(fullRequestOut.expectedPayoutCount).toBe(2);

        const upToRequestRecorded: number[] = [];
        const upToRequestOut = simulate(
            toyInputs({
                fundedDayPolicy: deterministicWinDayPolicy(upToRequestRecorded),
                payoutRequestSize: 150,
            }),
        );
        expect(upToRequestRecorded).toStrictEqual([1000, 1100, 1200, 1150]);
        expect(upToRequestOut.expectedGrossPayout).toBe(250);
        expect(upToRequestOut.expectedPayoutCount).toBe(2);
        expect(fullRequestOut.expectedGrossPayout).not.toBe(
            upToRequestOut.expectedGrossPayout,
        );
    });

    it('blocks a payout the pool cannot yet fully cover, then pays it once it can', () => {
        const upToRequestRecorded: number[] = [];
        const upToRequestOut = simulate(
            toyInputs({
                fundedDayPolicy: deterministicWinDayPolicy(upToRequestRecorded),
            }),
        );
        expect(upToRequestRecorded).toStrictEqual([1000, 1100, 1200, 1150]);
        expect(upToRequestOut.expectedGrossPayout).toBe(250);
        expect(upToRequestOut.expectedPayoutCount).toBe(2);

        const fullRequestRecorded: number[] = [];
        const fullRequestOut = simulate(
            toyInputs({
                fundedDayPolicy: deterministicWinDayPolicy(fullRequestRecorded),
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: 150,
            }),
        );
        expect(fullRequestRecorded).toStrictEqual([
            1000, 1100, 1200, 1150, 1250,
        ]);
        expect(fullRequestOut.expectedGrossPayout).toBe(300);
        expect(fullRequestOut.expectedPayoutCount).toBe(2);
        expect(fullRequestOut.expectedGrossPayout).not.toBe(
            upToRequestOut.expectedGrossPayout,
        );
    });

    it('leaves closeoutCredit unaffected by the policy (T32, Q4 default)', () => {
        const recorded: number[] = [];
        const shortHorizon = (policy?: PayoutRequestPolicy) =>
            simulate(
                toyInputs({
                    fundedDayPolicy: deterministicWinDayPolicy(recorded),
                    fundedHorizonDays: 2,
                    payoutRequestPolicy: policy,
                    payoutRequestSize: policy === undefined ? undefined : 150,
                }),
            );
        const upToRequest = shortHorizon(undefined);
        const fullRequestOnly = shortHorizon(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(upToRequest.expectedPayoutCount).toBe(0);
        expect(fullRequestOnly.expectedHorizonCredit).toBe(
            upToRequest.expectedHorizonCredit,
        );
    });

    it('refuses FullRequestOnly without a payoutRequestSize', () => {
        expect(() =>
            simulate(
                toyInputs({
                    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                    payoutRequestSize: undefined,
                }),
            ),
        ).toThrow(SIM_INPUTS_REFUSAL_PREFIX);
    });

    it('refuses a FullRequestOnly request below the plan minimum', () => {
        const topstep = planFor({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.NoFeeStandard,
        });
        expect(() =>
            simulate(
                toyInputs({
                    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                    payoutRequestSize: 1,
                    plan: topstep,
                }),
            ),
        ).toThrow(SIM_INPUTS_REFUSAL_PREFIX);
    });

    it('refuses FullRequestOnly without a payoutRequestSize in simulatePortfolioTimeline too (PD-26)', () => {
        const timelineInputs: PortfolioTimelineInputs = {
            accounts: 1,
            maxEvalDays: 1,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0.5,
        };
        expect(() => simulatePortfolioTimeline(timelineInputs)).toThrow(
            SIM_INPUTS_REFUSAL_PREFIX,
        );
    });
});
