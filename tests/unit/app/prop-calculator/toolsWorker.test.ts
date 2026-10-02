import { describe, expect, it } from 'vitest';

import { computeToolsResult } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type BankrollPlanReference,
    type BankrollPlanVariantInputs,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    findFirm,
    FirmId,
    InstrumentSymbol,
    serializePlanId,
    simulate,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    CopySplitRowKind,
    copySplitTrials,
} from '~/lib/prop-calculator/advisor/policy';
import { ValueChainStepKind } from '~/lib/prop-calculator/advisor/value';
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

function variant(
    overrides: Partial<BankrollPlanVariantInputs['base']> = {},
): BankrollPlanVariantInputs {
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
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: TOPSTEP_50K_SERIAL,
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
        if (result.kind !== ToolsResponseKind.Projection)
            throw new Error('unreachable');
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
            variant: {
                ...variant(),
                plan: { ...variant().plan, planSerial: 'no-such-plan' },
            },
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
        if (result.kind !== ToolsResponseKind.Batch)
            throw new Error('unreachable');
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
        if (result.kind !== ToolsResponseKind.Batch)
            throw new Error('unreachable');
        expect(result.result.lossProbability).toBeNull();
        expect(result.result.lossProbabilityReason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('computeToolsResult: SameEv (thin call into simulate + LossRisk)', () => {
    it('compares EV and loss risk for two variants at the same bankroll', () => {
        const result = computeToolsResult({
            bankroll: 2000,
            kind: ToolsRequestKind.SameEv,
            runId: 5,
            variants: [
                variant({ riskPerTrade: 250 }),
                variant({ riskPerTrade: 500 }),
            ],
        });
        expect(result.kind).toBe(ToolsResponseKind.SameEv);
        if (result.kind !== ToolsResponseKind.SameEv)
            throw new Error('unreachable');
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
        if (result.kind !== ToolsResponseKind.Levers)
            throw new Error('unreachable');
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0]?.deltaAttemptPaysProbability).toBe(0);
        expect(typeof result.rows[1]?.deltaAttemptPaysProbability).toBe(
            'number',
        );
        expect(typeof result.rows[2]?.deltaAttemptPaysProbability).toBe(
            'number',
        );
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
            variants: [
                variant({ riskPerTrade: 250 }),
                variant({ riskPerTrade: 500 }),
            ],
        });
        expect(result.kind).toBe(ToolsResponseKind.TwoStrategies);
        if (result.kind !== ToolsResponseKind.TwoStrategies)
            throw new Error('unreachable');
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
        if (result.kind !== ToolsResponseKind.NextRound)
            throw new Error('unreachable');
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
        if (result.kind !== ToolsResponseKind.ValueChain)
            throw new Error('unreachable');
        expect(result.result.steps).toHaveLength(4);
        expect(result.result.accountValue).toBeNull();
        expect(result.runId).toBe(9);
    });

    it('reports the steps that built and names the ones that failed when the first-payout-eligible state cannot be built', () => {
        const spec = documentedPolicySpec();
        const result = computeToolsResult({
            kind: ToolsRequestKind.ValueChain,
            plan: valueChainPlanReference(),
            runId: 14,
            spec: {
                ...spec,
                enginePolicy: {
                    ...spec.enginePolicy,
                    retainedCushionRequest: 500_000,
                },
            },
        });
        expect(result.kind).toBe(ToolsResponseKind.ValueChain);
        if (result.kind !== ToolsResponseKind.ValueChain)
            throw new Error('unreachable');
        expect(result.result.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
        ]);
        expect(result.result.failedSteps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
        expect(result.result.failedSteps[0]?.reason).toMatch(
            /no first-payout-eligible account/,
        );
        expect(result.runId).toBe(14);
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
        if (result.kind !== ToolsResponseKind.FundedValueEstimate)
            throw new Error('unreachable');
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
        if (result.kind !== ToolsResponseKind.FundedValueEstimate)
            throw new Error('unreachable');
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


function copySplit(
    overrides: Partial<{
        objective: SizingObjective;
        splits: number[];
        variant: BankrollPlanVariantInputs;
    }> = {},
) {
    return computeToolsResult({
        kind: ToolsRequestKind.CopySplit,
        objective: SizingObjective.MonthlyNet,
        runId: 1,
        splits: [1, 2],
        totalRisk: 2000,
        variant: variant({ riskPerTrade: 2000, trials: 130 }),
        ...overrides,
    });
}

describe('computeToolsResult: CopySplit (thin call into runCopySplit, PT-63, F-V24)', () => {
    it('runs one row per split for the whole group, off the main thread', () => {
        const result = copySplit();
        expect(result.kind).toBe(ToolsResponseKind.CopySplit);
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('unreachable');
        }
        expect(result.result.rows.map((row) => row.splitCount).toSorted((a, b) => a - b)).toStrictEqual(
            [1, 2],
        );
        expect(result.result.trialsPerSplit).toBe(
            copySplitTrials(130, [1, 2]),
        );
        expect(result.result.objective).toBe(SizingObjective.MonthlyNet);
    });

    it('matches a plain engine run of the same split on the same seed', () => {
        const theVariant = variant({ riskPerTrade: 2000, trials: 130 });
        const result = copySplit({ variant: theVariant });
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('unreachable');
        }
        const two = result.result.rows.find((row) => row.splitCount === 2);
        if (two?.kind !== CopySplitRowKind.Simulated) {
            throw new Error('expected a simulated row');
        }
        const plan = findFirm(FirmId.TopStep)?.findPlanBySerial(
            TOPSTEP_50K_SERIAL,
        );
        if (!plan) throw new Error('plan missing');
        const out = simulate(
            applyEnginePolicy(plan, theVariant.policy, {
                ...theVariant.base,
                copyAccounts: 2,
                fundedRiskPerTrade: 250,
                plan,
                riskPerTrade: 1000,
                trials: copySplitTrials(130, [1, 2]),
            }),
        );
        expect(two.totalMonthlyNet.value).toBe(out.expectedMonthlyNet);
        expect(two.cycleNet.value).toBe(out.expectedNet);
    });

    it('carries the basis lines, including the funded risk used and the correlation of the copies', () => {
        const result = copySplit();
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('unreachable');
        }
        const text = result.result.basisLines.join('\n');
        expect(text).toContain('funded risk $250 per account');
        expect(text).toContain('identical trades');
        expect(result.result.indistinguishableSplits).toBeInstanceOf(Array);
    });

    it('returns a refused row for a split below one contract at the stop', () => {
        const result = copySplit({
            splits: [1, 10],
            variant: variant({
                fundedRiskPerTrade: 800,
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 2000,
                stopPoints: 20,
                trials: 130,
            }),
        });
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('unreachable');
        }
        const ten = result.result.rows.find((row) => row.splitCount === 10);
        expect(ten?.kind).toBe(CopySplitRowKind.Refused);
    });

    it('falls back to MonthlyNet with a note under RuinFirst', () => {
        const result = copySplit({ objective: SizingObjective.RuinFirst });
        if (result.kind !== ToolsResponseKind.CopySplit) {
            throw new Error('unreachable');
        }
        expect(result.result.objective).toBe(SizingObjective.MonthlyNet);
        expect(result.result.requestedObjective).toBe(
            SizingObjective.RuinFirst,
        );
        expect(result.result.note).not.toBeNull();
    });

    it('fails with a named reason when the plan does not resolve', () => {
        const base = variant({ riskPerTrade: 2000, trials: 130 });
        const result = copySplit({
            variant: {
                ...base,
                plan: { ...base.plan, planSerial: 'no-such-plan' },
            },
        });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
    });

    it('fails with the engine reason instead of throwing for a repeated split', () => {
        const result = copySplit({ splits: [2, 2] });
        expect(result.kind).toBe(ToolsResponseKind.Failed);
        if (result.kind !== ToolsResponseKind.Failed) {
            throw new Error('unreachable');
        }
        expect(result.reason).toMatch(/more than once/);
    });
});
