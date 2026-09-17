import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    type SimInputs,
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

    it('cuts 5-copy aggregate eval+activation cost by exactly 5% versus 5x the single-account cost, since Tradeify discounts the account purchase itself, not the subscription/reset', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Growth);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, activation: dollars(50) },
        });

        const oneAccount = simulate(
            alwaysBustsInputs({ copyAccounts: 1, plan }),
        );
        const fiveAccounts = simulate(
            alwaysBustsInputs({ copyAccounts: 5, plan }),
        );

        const oneAccountCost =
            oneAccount.costBreakdown.activationFee +
            oneAccount.costBreakdown.evalFee;
        const fiveAccountCost =
            fiveAccounts.costBreakdown.activationFee +
            fiveAccounts.costBreakdown.evalFee;

        expect(oneAccountCost).toBeGreaterThan(0);
        expect(fiveAccountCost).toBeCloseTo(oneAccountCost * 5 * 0.95, 6);
    });

    it('gives no discount at all at 4 copies -- minAccounts is a hard floor of 5, not a rounding boundary', () => {
        const basePlan = tradeifyPlan(TradeifyVariant.Growth);
        const plan = basePlan.withOverrides({
            fees: { ...basePlan.fees, activation: dollars(50) },
        });

        const oneAccount = simulate(
            alwaysBustsInputs({ copyAccounts: 1, plan }),
        );
        const fourAccounts = simulate(
            alwaysBustsInputs({ copyAccounts: 4, plan }),
        );

        expect(fourAccounts.costBreakdown.evalFee).toBe(
            oneAccount.costBreakdown.evalFee * 4,
        );
        expect(fourAccounts.costBreakdown.activationFee).toBe(
            oneAccount.costBreakdown.activationFee * 4,
        );
    });

    it('leaves monthlySubsTotal and resetFeesTotal untouched by the discount at 5 copies -- Tradeify only discounts the account-purchase cost, never the subscription or reset fee', () => {
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

        expect(oneAccount.costBreakdown.resetFeesTotal).toBeGreaterThan(0);
        expect(oneAccount.costBreakdown.monthlySubsTotal).toBeGreaterThan(0);
        expect(fiveAccounts.costBreakdown.monthlySubsTotal).toBe(
            oneAccount.costBreakdown.monthlySubsTotal * 5,
        );
        expect(fiveAccounts.costBreakdown.resetFeesTotal).toBe(
            oneAccount.costBreakdown.resetFeesTotal * 5,
        );
    });

    it('leaves perAccountActivationFee/perAccountEvalFee and costPerFundedAccount/costPerDrawdownDollar unaffected by the 5-copy bulk discount -- these describe a single account and its eval-retry economics, not the bulk-purchase aggregate', () => {
        const plan = tradeifyPlan(TradeifyVariant.Growth);

        const oneAccount = simulate(
            alwaysPassesInputs({ copyAccounts: 1, plan }),
        );
        const fiveAccounts = simulate(
            alwaysPassesInputs({ copyAccounts: 5, plan }),
        );

        expect(oneAccount.passProbability).toBe(1);
        expect(fiveAccounts.passProbability).toBe(1);

        expect(fiveAccounts.costBreakdown.perAccountActivationFee).toBe(
            oneAccount.costBreakdown.perAccountActivationFee,
        );
        expect(fiveAccounts.costBreakdown.perAccountEvalFee).toBe(
            oneAccount.costBreakdown.perAccountEvalFee,
        );
        expect(fiveAccounts.costPerFundedAccount).toBe(
            oneAccount.costPerFundedAccount,
        );
        expect(fiveAccounts.costPerDrawdownDollar).toBe(
            oneAccount.costPerDrawdownDollar,
        );
    });
});
