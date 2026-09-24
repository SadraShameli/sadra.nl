import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    type SimInputs,
    type SimOutputs,
    simulate,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const tradeify = new Tradeify();

function alwaysBustsInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 60,
        maxAttempts: 3,
        maxEvalDays: 150,
        riskPerTrade: 300,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 0,
        ...overrides,
    } as SimInputs;
}

function alwaysPassesInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 60,
        maxEvalDays: 150,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 5,
        winrate: 1,
        ...overrides,
    } as SimInputs;
}

function perTrialRowsTotal(out: SimOutputs): number {
    const { activationFee, evalFee, resetFeesTotal, subscriptionPerTrial } =
        out.costBreakdown;
    return activationFee + evalFee + resetFeesTotal + subscriptionPerTrial;
}

function tradeifyPlan(variant: TradeifyVariant) {
    const plan = tradeify.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant,
    });
    if (!plan) throw new Error(`Tradeify plan not found: ${variant}`);
    return plan;
}

describe("Tradeify's confirmed 5-account bulk discount", () => {
    it('is wired onto Growth, Select Flex and Select Daily -- the confirmed-eligible plans -- but not Lightning, which the research explicitly excludes', () => {
        const eligible = { minAccounts: 5, percent: fraction(0.05) };

        expect(tradeifyPlan(TradeifyVariant.Growth).bulkDiscount).toStrictEqual(
            eligible,
        );
        expect(
            tradeifyPlan(TradeifyVariant.SelectFlex).bulkDiscount,
        ).toStrictEqual(eligible);
        expect(
            tradeifyPlan(TradeifyVariant.SelectDaily).bulkDiscount,
        ).toStrictEqual(eligible);
        expect(tradeifyPlan(TradeifyVariant.Lightning).bulkDiscount).toBeNull();
    });

    it('is eligible only on the 50K Growth, Select Flex and Select Daily plans this engine models (100K, 150K and Lightning are excluded by Tradeify)', () => {
        for (const plan of tradeify.plans) {
            if (plan.bulkDiscount !== null) {
                expect(plan.accountSize).toBe(50_000);
            }
        }
    });
});

describe('R1-1: the bundle discount reaches every headline figure (Tradeify Growth 50K, live-confirmed)', () => {
    const plan = tradeifyPlan(TradeifyVariant.Growth);
    const evalFee = plan.fees.oneTimeEval;
    const bundleFee = evalFee * 0.95;
    const one = simulate(alwaysPassesInputs({ copyAccounts: 1, plan }));
    const five = simulate(alwaysPassesInputs({ copyAccounts: 5, plan }));

    it('prices the always-pass scenario at the plain eval fee with no activation or subscription', () => {
        expect(plan.fees.activation).toBe(0);
        expect(plan.fees.monthlySubscription).toBe(0);
        expect(one.evalPassProbability).toBe(1);
        expect(one.expectedTotalCost).toBeCloseTo(evalFee, 9);
    });

    it('discounts expectedTotalCost, gross spend, break-even and spend P90 at 5 copies', () => {
        expect(five.expectedTotalCost).toBeCloseTo(5 * bundleFee, 6);
        expect(five.expectedGrossSpend).toBeCloseTo(5 * bundleFee, 6);
        expect(five.breakEvenFundedProfit).toBeCloseTo(5 * bundleFee, 6);
        expect(five.expectedSpendP90).toBeCloseTo(5 * bundleFee, 6);
    });

    it('adds the bundle saving to expected net and moves ROI on cost', () => {
        expect(five.expectedNet).toBeCloseTo(
            5 * one.expectedNet + 5 * evalFee * 0.05,
            6,
        );
        const fiveRoi = five.roiOnCost.value;
        const oneRoi = one.roiOnCost.value;
        if (fiveRoi === null || oneRoi === null) {
            throw new Error('ROI unexpectedly n/a');
        }
        expect(fiveRoi).toBeCloseTo(five.expectedNet / (5 * bundleFee), 9);
        expect(fiveRoi).not.toBeCloseTo(oneRoi, 6);
    });

    it('prices the per-account eval fee and the cost per funded account at the bundle price', () => {
        expect(five.costBreakdown.perAccountEvalFee).toBeCloseTo(bundleFee, 6);
        expect(five.costPerFundedAccount).toBeCloseTo(bundleFee, 6);
        expect(one.costPerFundedAccount).toBeCloseTo(evalFee, 9);
    });

    it('keeps the cost breakdown summing to expectedTotalCost at 5 copies', () => {
        expect(perTrialRowsTotal(five)).toBeCloseTo(five.expectedTotalCost, 6);
    });

    it('keeps the cost breakdown summing to expectedTotalCost at 5 copies on a subscription plan whose attempts run past the first month', () => {
        const subscriptionPlan = plan.withOverrides({
            fees: { ...plan.fees, monthlySubscription: dollars(49) },
        });
        const mixed = simulate({
            ...alwaysBustsInputs({ copyAccounts: 5, plan: subscriptionPlan }),
            riskPerTrade: 100,
            trials: 200,
            winrate: 0.4,
        });
        expect(mixed.costBreakdown.subscriptionPerTrial).toBeGreaterThan(0);
        expect(perTrialRowsTotal(mixed)).toBeCloseTo(
            mixed.expectedTotalCost,
            6,
        );
    });

    it('discounts only whole bundles of 5: 7 copies are one bundle plus 2 full-price accounts', () => {
        const seven = simulate(alwaysPassesInputs({ copyAccounts: 7, plan }));
        expect(seven.expectedTotalCost).toBeCloseTo(
            5 * bundleFee + 2 * evalFee,
            6,
        );
        const ten = simulate(alwaysPassesInputs({ copyAccounts: 10, plan }));
        expect(ten.expectedTotalCost).toBeCloseTo(10 * bundleFee, 6);
    });

    it('leaves 4 copies and Lightning undiscounted', () => {
        const four = simulate(alwaysPassesInputs({ copyAccounts: 4, plan }));
        expect(four.expectedTotalCost).toBeCloseTo(4 * evalFee, 9);
        const lightning = tradeifyPlan(TradeifyVariant.Lightning);
        const lightningFive = simulate(
            alwaysPassesInputs({ copyAccounts: 5, plan: lightning }),
        );
        expect(lightningFive.costBreakdown.perAccountEvalFee).toBe(
            lightning.fees.oneTimeEval,
        );
    });

    it('never discounts retries: always-bust resets at 5 copies are 5x the single-account resets', () => {
        const bustOne = simulate(alwaysBustsInputs({ copyAccounts: 1, plan }));
        const bustFive = simulate(alwaysBustsInputs({ copyAccounts: 5, plan }));
        expect(bustOne.costBreakdown.resetFeesTotal).toBeGreaterThan(0);
        expect(bustFive.costBreakdown.resetFeesTotal).toBeCloseTo(
            5 * bustOne.costBreakdown.resetFeesTotal,
            9,
        );
        expect(bustFive.expectedTotalCost).toBeCloseTo(
            5 * bustOne.expectedTotalCost - 5 * evalFee * 0.05,
            6,
        );
    });
});

describe('bundle discount on the cost breakdown lines', () => {
    it('cuts 5-copy aggregate eval+activation cost by exactly 5% versus 5x the single-account cost, since Tradeify discounts the account purchase itself, not the subscription/reset', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Growth);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, activation: dollars(50) },
        });

        const oneAccount = simulate(
            alwaysPassesInputs({ copyAccounts: 1, plan }),
        );
        const fiveAccounts = simulate(
            alwaysPassesInputs({ copyAccounts: 5, plan }),
        );

        const oneAccountCost =
            oneAccount.costBreakdown.activationFee +
            oneAccount.costBreakdown.evalFee;
        const fiveAccountCost =
            fiveAccounts.costBreakdown.activationFee +
            fiveAccounts.costBreakdown.evalFee;

        expect(oneAccount.costBreakdown.activationFee).toBe(50);
        expect(fiveAccountCost).toBeCloseTo(oneAccountCost * 5 * 0.95, 6);
    });

    it('applies no discount at 5 copies on Lightning, whose bulkDiscount is null, proving the null-guard behaviorally rather than only structurally', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Lightning);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, activation: dollars(50) },
        });

        const oneAccount = simulate(
            alwaysPassesInputs({ copyAccounts: 1, plan }),
        );
        const fiveAccounts = simulate(
            alwaysPassesInputs({ copyAccounts: 5, plan }),
        );

        expect(fiveAccounts.costBreakdown.evalFee).toBe(
            oneAccount.costBreakdown.evalFee * 5,
        );
        expect(fiveAccounts.costBreakdown.activationFee).toBe(
            oneAccount.costBreakdown.activationFee * 5,
        );
    });

    it('gives no discount at all at 4 copies -- minAccounts is a hard floor of 5, not a rounding boundary', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Growth);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, activation: dollars(50) },
        });

        const oneAccount = simulate(
            alwaysPassesInputs({ copyAccounts: 1, plan }),
        );
        const fourAccounts = simulate(
            alwaysPassesInputs({ copyAccounts: 4, plan }),
        );

        expect(fourAccounts.costBreakdown.evalFee).toBe(
            oneAccount.costBreakdown.evalFee * 4,
        );
        expect(fourAccounts.costBreakdown.activationFee).toBe(
            oneAccount.costBreakdown.activationFee * 4,
        );
    });

    it('leaves subscriptionPerFundedAccount and resetFeesTotal untouched by the discount at 5 copies, and keeps subscriptionPerFundedAccount per funded account like costPerFundedAccount: Tradeify only discounts the account-purchase cost, never the subscription or reset fee', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Growth);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, monthlySubscription: dollars(49) },
        });

        const oneAccount = simulate(
            alwaysBustsInputs({ copyAccounts: 1, plan }),
        );
        const fiveAccounts = simulate(
            alwaysBustsInputs({ copyAccounts: 5, plan }),
        );
        const onePassing = simulate(
            alwaysPassesInputs({ copyAccounts: 1, plan }),
        );
        const fivePassing = simulate(
            alwaysPassesInputs({ copyAccounts: 5, plan }),
        );

        expect(oneAccount.costBreakdown.resetFeesTotal).toBeGreaterThan(0);
        expect(fiveAccounts.costBreakdown.resetFeesTotal).toBe(
            oneAccount.costBreakdown.resetFeesTotal * 5,
        );
        expect(onePassing.costBreakdown.subscriptionPerFundedAccount).toBe(49);
        expect(fivePassing.costBreakdown.subscriptionPerFundedAccount).toBe(49);
        expect(
            fivePassing.costBreakdown.subscriptionPerFundedAccount,
        ).toBeLessThanOrEqual(fivePassing.costPerFundedAccount);
    });
});
