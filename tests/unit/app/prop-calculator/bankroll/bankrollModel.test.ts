import { describe, expect, it } from 'vitest';

import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollBatchRequest,
    bankrollBudgetPricing,
    type BankrollCalculatorInputs,
    bankrollCycleDescription,
    bankrollCycleFigures,
    bankrollCycleInput,
    bankrollExplicitBatchRequest,
    bankrollLeversRequest,
    bankrollMinimumBudgetForThreshold,
    bankrollProjectionRequest,
    bankrollProjectionSummary,
    bankrollSameEvRequest,
    BankrollSetupStatus,
    bankrollSetupSummary,
    bankrollSpendPayoutCurveRequest,
    bankrollTwoStrategiesRequest,
    bankrollTwoStrategiesSummary,
    bankrollVariantFor,
    bankrollVariantWithFundedRisk,
    bankrollVariantWithRisk,
    parseBankrollCandidateList,
    parseBankrollDollarCandidateList,
} from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type BankrollPlanVariantInputs,
    ToolsRequestKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    dollars,
    findFirm,
    FirmId,
    fraction,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';
import { EconomicsReason } from '~/lib/prop-calculator/economics';
import {
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator/simulator';

function requirePlan(value: null | Plan | undefined): Plan {
    if (value === null || value === undefined)
        throw new Error('plan not found');
    return value;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
);

function simOutputs(overrides: Partial<SimInputs> = {}): SimOutputs {
    const inputs: SimInputs = {
        fundedHorizonDays: 30,
        maxEvalDays: 30,
        payoutRequestSize: 500,
        plan: TOPSTEP_50K,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 1,
        trials: 400,
        winrate: 0.42,
        ...overrides,
    };
    return simulate(inputs);
}

function variantFor(): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: 400,
            winrate: 0.42,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serializePlanId({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        },
        policy: {
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 30,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: 500,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        },
    };
}

const POSITIVE_EDGE_OUT = simOutputs();

describe('bankrollSetupSummary', () => {
    it('is Priced with a positive attempt cost and pays probability when the plan has positive edge', () => {
        const summary = bankrollSetupSummary(POSITIVE_EDGE_OUT, null);
        expect(summary.status).toBe(BankrollSetupStatus.Priced);
        expect(summary.attemptCost).toBeGreaterThan(0);
        expect(summary.attemptPaysProbability.value).toBeGreaterThanOrEqual(0);
        expect(summary.attemptPaysProbability.value).toBeLessThanOrEqual(1);
    });

    it('is NoPositiveEdge when the mean net value is at or below zero', () => {
        const noEdgeOut: SimOutputs = {
            ...POSITIVE_EDGE_OUT,
            netValues: [-50, -50, -50],
        };
        const summary = bankrollSetupSummary(noEdgeOut, fraction(0.1));
        expect(summary.status).toBe(BankrollSetupStatus.NoPositiveEdge);
        expect(summary.minimumBudget.value).toBeNull();
        expect(summary.minimumBudget.reason).toBe(
            EconomicsReason.NoPositiveEdge,
        );
    });

    it('gives a null minimum budget with reason ThresholdNotSet when no threshold is set', () => {
        const summary = bankrollSetupSummary(POSITIVE_EDGE_OUT, null);
        expect(summary.minimumBudget.value).toBeNull();
        expect(summary.minimumBudget.reason).toBe(
            EconomicsReason.ThresholdNotSet,
        );
    });

    it('gives a positive minimum budget and attempt count once a threshold is set on a positive-edge plan', () => {
        const summary = bankrollSetupSummary(POSITIVE_EDGE_OUT, fraction(0.3));
        expect(summary.minimumBudget.value).not.toBeNull();
        if (summary.minimumBudget.value === null) return;
        expect(summary.minimumBudget.value.attempts).toBeGreaterThan(0);
        expect(summary.minimumBudget.value.budget).toBeGreaterThan(0);
        expect(summary.minimumBudget.value.budget).toBe(
            summary.minimumBudget.value.attempts * summary.attemptCost,
        );
    });
});

describe('bankrollMinimumBudgetForThreshold', () => {
    it('matches bankrollSetupSummary.minimumBudget', () => {
        const direct = bankrollMinimumBudgetForThreshold(
            POSITIVE_EDGE_OUT,
            fraction(0.2),
        );
        const viaSummary = bankrollSetupSummary(
            POSITIVE_EDGE_OUT,
            fraction(0.2),
        ).minimumBudget;
        expect(direct).toEqual(viaSummary);
    });
});

describe('bankrollBatchRequest', () => {
    it('builds a Batch request sized to the attempts the budget affords', () => {
        const variant = variantFor();
        const request = bankrollBatchRequest(
            variant,
            POSITIVE_EDGE_OUT,
            dollars(5000),
            1,
        );
        expect(request).not.toBeNull();
        if (request === null) return;
        expect(request.kind).toBe(ToolsRequestKind.Batch);
        expect(request.attempts).toBe(
            Math.floor(5000 / POSITIVE_EDGE_OUT.costPerAttempt),
        );
        expect(request.variant).toBe(variant);
    });

    it('gives null when the budget cannot afford even one attempt', () => {
        const variant = variantFor();
        const request = bankrollBatchRequest(
            variant,
            POSITIVE_EDGE_OUT,
            dollars(1),
            1,
        );
        expect(request).toBeNull();
    });
});

describe('bankrollBudgetPricing', () => {
    it('reports attempts, no-payout probability locally, and passes through the worker batch result', () => {
        const budget = dollars(5000);
        const attempts = Math.floor(budget / POSITIVE_EDGE_OUT.costPerAttempt);
        const pricing = bankrollBudgetPricing(POSITIVE_EDGE_OUT, budget, {
            crossCheckLossProbability: 0.2,
            fundedValueToAttemptCostRatio: 1.5,
            lossProbability: 0.12,
            lossProbabilityReason: null,
            lossProbabilityStandardError: 0.01,
            meanNet: 300,
        });
        expect(pricing.attempts).toBe(attempts);
        expect(pricing.batchNetNegativeProbability).toBe(0.12);
        expect(pricing.batchNetNegativeReason).toBeNull();
        expect(pricing.batchNetNegativeStandardError).toBe(0.01);
        expect(pricing.noPayoutProbability).not.toBeNull();
        expect(pricing.noPayoutProbability).toBeLessThanOrEqual(1);
    });

    it('gives every field null when the budget affords no attempts', () => {
        const pricing = bankrollBudgetPricing(
            POSITIVE_EDGE_OUT,
            dollars(1),
            null,
        );
        expect(pricing).toEqual({
            attempts: null,
            batchNetNegativeProbability: null,
            batchNetNegativeReason: null,
            batchNetNegativeStandardError: null,
            noPayoutProbability: null,
        });
    });

    it('gives a null batch probability while the worker result has not arrived yet', () => {
        const pricing = bankrollBudgetPricing(
            POSITIVE_EDGE_OUT,
            dollars(5000),
            null,
        );
        expect(pricing.attempts).not.toBeNull();
        expect(pricing.batchNetNegativeProbability).toBeNull();
    });

    it('surfaces the reason a batch loss probability is unavailable, such as an attempt count too large for cohortOutcome to sample', () => {
        const pricing = bankrollBudgetPricing(
            POSITIVE_EDGE_OUT,
            dollars(5000),
            {
                crossCheckLossProbability: null,
                fundedValueToAttemptCostRatio: null,
                lossProbability: null,
                lossProbabilityReason: EconomicsReason.InvalidInput,
                lossProbabilityStandardError: null,
                meanNet: null,
            },
        );
        expect(pricing.batchNetNegativeProbability).toBeNull();
        expect(pricing.batchNetNegativeReason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('bankrollProjectionRequest', () => {
    it('maps the projection fields onto a BankrollPolicy, with no round budget when none is entered', () => {
        const variant = variantFor();
        const request = bankrollProjectionRequest(
            variant,
            {
                capacity: 3,
                horizonDays: 180,
                monthlyBudget: dollars(2000),
                payoutLagDays: 10,
                reinvestFraction: fraction(0.5),
                roundBudget: null,
                start: dollars(5000),
            },
            9,
        );
        expect(request).toEqual({
            bankroll: {
                maxConcurrentAccounts: 3,
                monthlyBudget: dollars(2000),
                payoutLagDays: 10,
                reinvestFraction: fraction(0.5),
                roundBudget: null,
                startingBankroll: dollars(5000),
            },
            dayBudget: 180,
            kind: ToolsRequestKind.Projection,
            runId: 9,
            variant,
        });
    });

    it('carries an entered round budget into the policy', () => {
        const request = bankrollProjectionRequest(
            variantFor(),
            {
                capacity: null,
                horizonDays: 180,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: fraction(1),
                roundBudget: dollars(1000),
                start: dollars(5000),
            },
            9,
        );
        expect(request.bankroll.roundBudget).toBe(1000);
    });
});

describe('bankrollProjectionSummary', () => {
    it('reads the final-day bands, path ruin, cards bought and the multiple over the median path', () => {
        const summary = bankrollProjectionSummary({
            cardsBoughtP50: 2,
            cashP10: [5000, 4000],
            cashP50: [5000, 6000],
            cashP90: [5000, 8000],
            cumulativeSpendP10: [0, 500],
            cumulativeSpendP50: [0, 500],
            cumulativeSpendP90: [0, 500],
            days: [0, 1],
            measuredCycleDays: 42,
            pathRuin: fraction(0.05),
            payoutP10: [0, 0],
            payoutP50: [0, 0],
            payoutP90: [0, 0],
            pFinalNetNegative: fraction(0.1),
            withdrawnP10: [0, 0],
            withdrawnP50: [0, 0],
            withdrawnP90: [0, 0],
        });
        expect(summary).toEqual({
            cardsBoughtMedian: 2,
            finalCashP10: 4000,
            finalCashP50: 6000,
            finalCashP90: 8000,
            measuredCycleDays: 42,
            multiple: 1.2,
            pathRuin: fraction(0.05),
            pFinalNetNegative: fraction(0.1),
        });
    });

    it('gives a null multiple when the starting cash is not positive', () => {
        const summary = bankrollProjectionSummary({
            cardsBoughtP50: 0,
            cashP10: [0],
            cashP50: [0],
            cashP90: [0],
            cumulativeSpendP10: [0],
            cumulativeSpendP50: [0],
            cumulativeSpendP90: [0],
            days: [0],
            measuredCycleDays: null,
            pathRuin: fraction(0),
            payoutP10: [0],
            payoutP50: [0],
            payoutP90: [0],
            pFinalNetNegative: fraction(0),
            withdrawnP10: [0],
            withdrawnP50: [0],
            withdrawnP90: [0],
        });
        expect(summary.multiple).toBeNull();
    });
});

describe('the closed-form cycle illustration (labelled, never the headline)', () => {
    it('has a label distinct from the modeled projection', () => {
        expect(BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL).toBe(
            'deterministic illustration, not a forecast',
        );
    });

    it('prices one 5x cycle of 60 days against chained 3x cycles of 30 days from the same start and horizon', () => {
        const [single, chained] = bankrollCycleFigures(dollars(5000), 60, [
            { cycleDays: 60, multiple: 5 },
            { cycleDays: 30, multiple: 3 },
        ]);
        expect(single?.quantity.value).toBe(25_000);
        expect(chained?.quantity.value).toBe(45_000);
        expect(single?.multiple).toBe(5);
        expect(single?.cycleDays).toBe(60);
        expect(chained?.multiple).toBe(3);
        expect(chained?.cycleDays).toBe(30);
    });

    it('uses the entered cycle for one figure, never an invented one', () => {
        const [figure] = bankrollCycleFigures(dollars(5000), 42, [
            { cycleDays: 21, multiple: 2 },
        ]);
        expect(figure?.quantity.value).toBe(5000 * 2 ** 2);
    });

    it('carries the reason for a cycle that cannot be priced', () => {
        const [figure] = bankrollCycleFigures(dollars(5000), 60, [
            { cycleDays: 0, multiple: 3 },
        ]);
        expect(figure?.quantity.value).toBeNull();
        expect(figure?.quantity.reason).toBe(EconomicsReason.InvalidInput);
    });

    it('gives a cycle only when both the multiple and the days are entered', () => {
        expect(bankrollCycleInput(3, 30)).toEqual({
            cycleDays: 30,
            multiple: 3,
        });
        expect(bankrollCycleInput(null, 30)).toBeNull();
        expect(bankrollCycleInput(3, null)).toBeNull();
        expect(bankrollCycleInput(null, null)).toBeNull();
    });

    it('names the multiple and the days it assumed', () => {
        expect(bankrollCycleDescription({ cycleDays: 30, multiple: 3 })).toBe(
            '3x every 30 trading days',
        );
        expect(bankrollCycleDescription({ cycleDays: 60, multiple: 1.5 })).toBe(
            '1.5x every 60 trading days',
        );
    });
});

describe('bankrollSpendPayoutCurveRequest (PT-82)', () => {
    it('builds a SpendPayoutCurve request on the same variant, carrying the budgets in order', () => {
        const variant = variantFor();
        expect(
            bankrollSpendPayoutCurveRequest(variant, [5000, 10_000], 12),
        ).toEqual({
            budgets: [5000, 10_000],
            kind: ToolsRequestKind.SpendPayoutCurve,
            runId: 12,
            variant,
        });
    });
});

function bankrollCalculatorBaseInputs(): BankrollCalculatorInputs {
    const state = defaultCalculatorState();
    return { ...state, plan: TOPSTEP_50K };
}

describe('bankrollVariantFor', () => {
    it('survives structuredClone: no Plan instance, only its serial and opt-ins', () => {
        const variant = bankrollVariantFor(
            bankrollCalculatorBaseInputs(),
            DEFAULT_RULEBOOK,
        );
        expect(() => structuredClone(variant)).not.toThrow();
        expect(variant.plan.firmId).toBe(FirmId.TopStep);
        expect(variant.plan.planSerial).toBe(
            serializePlanId({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        );
        expect(variant.plan.optIns).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
    });

    it('always carries a concrete payout request override, never null', () => {
        const variant = bankrollVariantFor(
            bankrollCalculatorBaseInputs(),
            DEFAULT_RULEBOOK,
        );
        expect(variant.policy.payoutRequestOverride).not.toBeNull();
        expect(variant.policy.payoutRequestOverride).toBeGreaterThan(0);
    });

    it('never sends a $0 retained cushion for a TopStep request', () => {
        const variant = bankrollVariantFor(
            { ...bankrollCalculatorBaseInputs(), retainedCushion: null },
            DEFAULT_RULEBOOK,
        );
        expect(variant.policy.retainedCushionRequest).toBe(2000);
    });

    it('converts a percent-of-account risk to dollars', () => {
        const state = bankrollCalculatorBaseInputs();
        const variant = bankrollVariantFor(
            { ...state, riskPercent: 1, sizingMode: state.sizingMode },
            DEFAULT_RULEBOOK,
        );
        expect(typeof variant.base.riskPerTrade).toBe('number');
    });
});

describe('bankrollVariantWithRisk (PT-62b)', () => {
    it('overrides only riskPerTrade, leaving the plan and policy untouched', () => {
        const variant = variantFor();
        const overridden = bankrollVariantWithRisk(variant, 500);
        expect(overridden.base.riskPerTrade).toBe(500);
        expect(overridden.plan).toBe(variant.plan);
        expect(overridden.policy).toBe(variant.policy);
        expect(variant.base.riskPerTrade).toBe(250);
    });
});

describe('bankrollVariantWithFundedRisk (PT-63b)', () => {
    it('sets only the funded risk per trade, leaving the eval risk, the plan and the policy untouched', () => {
        const variant = variantFor();
        const overridden = bankrollVariantWithFundedRisk(variant, 400);
        expect(overridden.base.fundedRiskPerTrade).toBe(400);
        expect(overridden.base.riskPerTrade).toBe(variant.base.riskPerTrade);
        expect(overridden.plan).toBe(variant.plan);
        expect(overridden.policy).toBe(variant.policy);
        expect(variant.base.fundedRiskPerTrade).toBeUndefined();
    });
});

describe('bankrollExplicitBatchRequest (PT-62b)', () => {
    it('builds a Batch request for a user-typed attempt count, not one derived from a budget', () => {
        const variant = variantFor();
        const request = bankrollExplicitBatchRequest(variant, 40, 3);
        expect(request).toEqual({
            attempts: 40,
            kind: ToolsRequestKind.Batch,
            runId: 3,
            variant,
        });
    });
});

describe('bankrollTwoStrategiesRequest and bankrollTwoStrategiesSummary (PT-62b)', () => {
    it('builds a TwoStrategies request from two variants sharing one bankroll policy', () => {
        const variantA = variantFor();
        const variantB = bankrollVariantWithRisk(variantA, 500);
        const request = bankrollTwoStrategiesRequest(
            [variantA, variantB],
            {
                capacity: null,
                horizonDays: 120,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: fraction(0.5),
                roundBudget: null,
                start: dollars(5000),
            },
            4,
        );
        expect(request).toEqual({
            bankroll: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: fraction(0.5),
                roundBudget: null,
                startingBankroll: dollars(5000),
            },
            dayBudget: 120,
            kind: ToolsRequestKind.TwoStrategies,
            runId: 4,
            variants: [variantA, variantB],
        });
    });

    it('carries an entered capacity, monthly budget, payout lag and round budget instead of null, null, 0 and null', () => {
        const variantA = variantFor();
        const request = bankrollTwoStrategiesRequest(
            [variantA, bankrollVariantWithRisk(variantA, 500)],
            {
                capacity: 4,
                horizonDays: 120,
                monthlyBudget: dollars(1500),
                payoutLagDays: 7,
                reinvestFraction: fraction(0.5),
                roundBudget: dollars(900),
                start: dollars(5000),
            },
            4,
        );
        expect(request.bankroll).toEqual({
            maxConcurrentAccounts: 4,
            monthlyBudget: dollars(1500),
            payoutLagDays: 7,
            reinvestFraction: fraction(0.5),
            roundBudget: dollars(900),
            startingBankroll: dollars(5000),
        });
    });

    it('maps a pair of BankrollTimelineResults onto a pair of BankrollProjectionSummary', () => {
        const timelineResult = {
            cardsBoughtP50: 2,
            cashP10: [5000, 4000],
            cashP50: [5000, 6000],
            cashP90: [5000, 8000],
            cumulativeSpendP10: [0, 500],
            cumulativeSpendP50: [0, 500],
            cumulativeSpendP90: [0, 500],
            days: [0, 1],
            measuredCycleDays: 42,
            pathRuin: fraction(0.05),
            payoutP10: [0, 0],
            payoutP50: [0, 0],
            payoutP90: [0, 0],
            pFinalNetNegative: fraction(0.1),
            withdrawnP10: [0, 0],
            withdrawnP50: [0, 0],
            withdrawnP90: [0, 0],
        };
        const [summaryA, summaryB] = bankrollTwoStrategiesSummary([
            timelineResult,
            { ...timelineResult, cashP50: [5000, 9000] },
        ]);
        expect(summaryA).toEqual(bankrollProjectionSummary(timelineResult));
        expect(summaryB.finalCashP50).toBe(9000);
    });
});

describe('bankrollSameEvRequest (PT-62b)', () => {
    it('builds a SameEv request from two variants and one shared bankroll', () => {
        const variantA = variantFor();
        const variantB = bankrollVariantWithRisk(variantA, 500);
        const request = bankrollSameEvRequest(
            [variantA, variantB],
            dollars(5000),
            6,
        );
        expect(request).toEqual({
            bankroll: dollars(5000),
            kind: ToolsRequestKind.SameEv,
            runId: 6,
            variants: [variantA, variantB],
        });
    });
});

describe('bankrollLeversRequest (PT-62b)', () => {
    it('carries the candidate lists straight through to the worker request', () => {
        const variant = variantFor();
        const request = bankrollLeversRequest(
            variant,
            dollars(5000),
            { requestSizes: null, risks: [200, 300], tradesPerDay: [1, 2] },
            7,
        );
        expect(request).toEqual({
            bankroll: dollars(5000),
            kind: ToolsRequestKind.Levers,
            requestSizes: null,
            risks: [200, 300],
            runId: 7,
            tradesPerDay: [1, 2],
            variant,
        });
    });
});

describe('parseBankrollCandidateList (PT-62b)', () => {
    it('parses a comma-separated list of positive numbers', () => {
        expect(parseBankrollCandidateList('200, 300,400')).toEqual([
            200, 300, 400,
        ]);
    });

    it('gives null for an empty string', () => {
        expect(parseBankrollCandidateList('')).toBeNull();
        expect(parseBankrollCandidateList(' '.repeat(3))).toBeNull();
    });

    it('gives null when any entry is not a positive number', () => {
        expect(parseBankrollCandidateList('200, abc')).toBeNull();
        expect(parseBankrollCandidateList('200, -1')).toBeNull();
        expect(parseBankrollCandidateList('200, 0')).toBeNull();
    });
});

describe('parseBankrollDollarCandidateList (PT-62b review MEDIUM: whole-cent rounding)', () => {
    it('parses a comma-separated list of positive dollar amounts', () => {
        expect(parseBankrollDollarCandidateList('200, 300,400')).toEqual([
            200, 300, 400,
        ]);
    });

    it('rounds each candidate down to the nearest whole cent, matching parseBankrollDollarsField', () => {
        expect(parseBankrollDollarCandidateList('199.999, 300.005')).toEqual([
            199.99, 300,
        ]);
    });

    it('gives null for an empty string', () => {
        expect(parseBankrollDollarCandidateList('')).toBeNull();
    });

    it('gives null when any entry is not a positive number', () => {
        expect(parseBankrollDollarCandidateList('200, abc')).toBeNull();
        expect(parseBankrollDollarCandidateList('200, -1')).toBeNull();
        expect(parseBankrollDollarCandidateList('200, 0')).toBeNull();
    });
});
