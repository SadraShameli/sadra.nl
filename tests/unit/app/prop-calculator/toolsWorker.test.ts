import { describe, expect, it } from 'vitest';

import { computeToolsResult } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type BankrollPlanReference,
    type BankrollPlanVariantInputs,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';
import { MffuVariant, TopStepVariant } from '~/lib/prop-calculator/core';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

const MFFU_RAPID_EOD_50K_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

const TOPSTEP_50K_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

function variant(overrides: Partial<BankrollPlanVariantInputs['base']> = {}): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 300,
            winrate: 0.42,
            ...overrides,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
            planSerial: TOPSTEP_50K_SERIAL,
        },
        policy: {
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 30,
            lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: 500,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        },
    };
}

describe('computeToolsResult: Projection (thin call into simulateBankrollTimeline)', () => {
    it('runs the bankroll timeline for the resolved plan', () => {
        const result = computeToolsResult({
            bankroll: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: 1,
                roundBudget: null,
                startingBankroll: 5000,
            },
            dayBudget: 60,
            kind: ToolsRequestKind.Projection,
            runId: 1,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Projection);
        if (result.kind !== ToolsResponseKind.Projection) throw new Error('unreachable');
        expect(result.result.days.length).toBeGreaterThan(0);
        expect(result.result.cashP50[0]).toBe(5000);
        expect(result.runId).toBe(1);
    });

    it('fails with a named reason when the plan does not resolve', () => {
        const result = computeToolsResult({
            bankroll: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: 1,
                roundBudget: null,
                startingBankroll: 5000,
            },
            dayBudget: 60,
            kind: ToolsRequestKind.Projection,
            runId: 2,
            variant: { ...variant(), plan: { ...variant().plan, planSerial: 'no-such-plan' } },
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });

    it('throws when the request fails Zod validation (invalid winrate)', () => {
        expect(() =>
            computeToolsResult({
                bankroll: {
                    maxConcurrentAccounts: null,
                    monthlyBudget: null,
                    payoutLagDays: 0,
                    reinvestFraction: 1,
                    roundBudget: null,
                    startingBankroll: 5000,
                },
                dayBudget: 60,
                kind: ToolsRequestKind.Projection,
                runId: 3,
                variant: variant({ winrate: 2 }),
            }),
        ).toThrow();
    });
});

describe('computeToolsResult: Batch (thin call into cohortOutcome)', () => {
    it('prices a batch of attempts on the simulated per-trial net distribution', () => {
        const result = computeToolsResult({
            attempts: 50,
            kind: ToolsRequestKind.Batch,
            runId: 4,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Batch);
        if (result.kind !== ToolsResponseKind.Batch) throw new Error('unreachable');
        expect(result.result.meanNet).not.toBeNull();
        expect(result.result.lossProbability).toBeGreaterThanOrEqual(0);
        expect(result.result.lossProbability).toBeLessThanOrEqual(1);
        expect(result.result.lossProbabilityReason).toBeNull();
    });

    it('surfaces a reason instead of a silent null when the attempt count is too large for cohortOutcome to sample', () => {
        const result = computeToolsResult({
            attempts: 2001,
            kind: ToolsRequestKind.Batch,
            runId: 4,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Batch);
        if (result.kind !== ToolsResponseKind.Batch) throw new Error('unreachable');
        expect(result.result.lossProbability).toBeNull();
        expect(result.result.lossProbabilityReason).toBe(EconomicsReason.InvalidInput);
    });
});

describe('computeToolsResult: SameEv (thin call into simulate + LossRisk)', () => {
    it('compares EV and loss risk for two variants at the same bankroll', () => {
        const result = computeToolsResult({
            bankroll: 2000,
            kind: ToolsRequestKind.SameEv,
            runId: 5,
            variants: [variant({ riskPerTrade: 250 }), variant({ riskPerTrade: 500 })],
        });
        expect(result.kind).toBe(ToolsResponseKind.SameEv);
        if (result.kind !== ToolsResponseKind.SameEv) throw new Error('unreachable');
        expect(result.results).toHaveLength(2);
    });
});

describe('computeToolsResult: Levers (thin call into bankrollLevers)', () => {
    it('reprices the requested risk what-ifs on the same seed', () => {
        const result = computeToolsResult({
            bankroll: 2000,
            kind: ToolsRequestKind.Levers,
            requestSizes: null,
            risks: [125, 375],
            runId: 6,
            tradesPerDay: null,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Levers);
        if (result.kind !== ToolsResponseKind.Levers) throw new Error('unreachable');
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0]?.deltaAttemptPaysProbability).toBe(0);
        expect(typeof result.rows[1]?.deltaAttemptPaysProbability).toBe('number');
        expect(typeof result.rows[2]?.deltaAttemptPaysProbability).toBe('number');
    });
});

describe('computeToolsResult: TwoStrategies and NextRound (thin calls into simulateBankrollTimeline)', () => {
    it('runs both strategies on the same seed', () => {
        const result = computeToolsResult({
            bankroll: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: 1,
                roundBudget: null,
                startingBankroll: 5000,
            },
            dayBudget: 60,
            kind: ToolsRequestKind.TwoStrategies,
            runId: 7,
            variants: [variant({ riskPerTrade: 250 }), variant({ riskPerTrade: 500 })],
        });
        expect(result.kind).toBe(ToolsResponseKind.TwoStrategies);
        if (result.kind !== ToolsResponseKind.TwoStrategies) throw new Error('unreachable');
        expect(result.results).toHaveLength(2);
    });

    it('runs option A and option B for the next round', () => {
        const result = computeToolsResult({
            dayBudget: 60,
            kind: ToolsRequestKind.NextRound,
            optionA: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: 1,
                roundBudget: null,
                startingBankroll: 5000,
            },
            optionB: {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: 1,
                roundBudget: null,
                startingBankroll: 6500,
            },
            runId: 8,
            trials: 300,
            variant: variant(),
        });
        expect(result.kind).toBe(ToolsResponseKind.NextRound);
        if (result.kind !== ToolsResponseKind.NextRound) throw new Error('unreachable');
        expect(result.optionB.cashP50[0]).toBe(6500);
    });
});

function documentedPolicySpec(): DocumentedPolicySpec {
    const firm = findFirm(FirmId.Mffu);
    const plan = firm?.findPlanBySerial(MFFU_RAPID_EOD_50K_SERIAL);
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return {
        enginePolicy: buildEnginePolicy({
            fundedHorizonDays: 90,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 17, trials: 30 },
    };
}

function valueChainPlanReference(): BankrollPlanReference {
    return {
        firmId: FirmId.Mffu,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        planSerial: MFFU_RAPID_EOD_50K_SERIAL,
    };
}

describe('computeToolsResult: ValueChain (thin call into valueChain)', () => {
    it('returns the four value-chain steps for the resolved plan', () => {
        const result = computeToolsResult({
            kind: ToolsRequestKind.ValueChain,
            plan: valueChainPlanReference(),
            runId: 9,
            spec: documentedPolicySpec(),
        });
        expect(result.kind).toBe(ToolsResponseKind.ValueChain);
        if (result.kind !== ToolsResponseKind.ValueChain) throw new Error('unreachable');
        expect(result.result.steps).toHaveLength(4);
        expect(result.result.accountValue).toBeNull();
        expect(result.runId).toBe(9);
    });

    it('fails with a named reason when the plan does not resolve', () => {
        const result = computeToolsResult({
            kind: ToolsRequestKind.ValueChain,
            plan: { ...valueChainPlanReference(), planSerial: 'no-such-plan' },
            runId: 10,
            spec: documentedPolicySpec(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });
});

describe('computeToolsResult: FundedValueEstimate (thin call into fundedValueEstimate)', () => {
    it('returns the mean payouts per funded account with no sample range until a sample size is given', () => {
        const result = computeToolsResult({
            kind: ToolsRequestKind.FundedValueEstimate,
            plan: valueChainPlanReference(),
            runId: 11,
            sampleSize: null,
            spec: documentedPolicySpec(),
        });
        expect(result.kind).toBe(ToolsResponseKind.FundedValueEstimate);
        if (result.kind !== ToolsResponseKind.FundedValueEstimate) throw new Error('unreachable');
        expect(result.result.sampleRange).toBeNull();
        expect(typeof result.result.meanPayoutsPerAccount.value).toBe('number');
    });

    it('returns a 95% sample range once a sample size is given', () => {
        const result = computeToolsResult({
            kind: ToolsRequestKind.FundedValueEstimate,
            plan: valueChainPlanReference(),
            runId: 12,
            sampleSize: 10,
            spec: documentedPolicySpec(),
        });
        expect(result.kind).toBe(ToolsResponseKind.FundedValueEstimate);
        if (result.kind !== ToolsResponseKind.FundedValueEstimate) throw new Error('unreachable');
        expect(result.result.sampleRange).not.toBeNull();
    });

    it('fails with a named reason when the plan does not resolve', () => {
        const result = computeToolsResult({
            kind: ToolsRequestKind.FundedValueEstimate,
            plan: { ...valueChainPlanReference(), planSerial: 'no-such-plan' },
            runId: 13,
            sampleSize: null,
            spec: documentedPolicySpec(),
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });
});

describe('resolving the requested plan', () => {
    it('resolves the same TopStep 50K plan the catalog exposes', () => {
        const firm = findFirm(FirmId.TopStep);
        expect(firm?.findPlanBySerial(TOPSTEP_50K_SERIAL)).not.toBeNull();
    });
});
