import { describe, expect, it } from 'vitest';

import {
    type BankrollPlanVariantInputs,
    type CopySplitToolsResult,
    parseToolsRequest,
    parseToolsResult,
    runIdOf,
    ToolsRequestKind,
    ToolsResponseKind,
    type ToolsWorkerRequest,
    type ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { dollars, FirmId, fraction } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    CopySplitRowKind,
    DEFAULT_COPY_SPLIT_FUNDED,
} from '~/lib/prop-calculator/advisor/policy';
import {
    FUNDED_VALUE_SAMPLE_RANGE_LABEL,
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';

function bankrollPolicy(startingBankroll = 5000) {
    return {
        maxConcurrentAccounts: null,
        monthlyBudget: null,
        payoutLagDays: 0,
        reinvestFraction: fraction(1),
        roundBudget: null,
        startingBankroll: dollars(startingBankroll),
    };
}

function baseVariant(): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 500,
            winrate: 0.4,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: 'topstep-50000-standard-standard',
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

function documentedPolicySpec(): DocumentedPolicySpec {
    return {
        enginePolicy: baseVariant().policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 30, seed: 1, trials: 500 },
    };
}

function projectionRequest(): ToolsWorkerRequest {
    return {
        bankroll: bankrollPolicy(),
        dayBudget: 180,
        kind: ToolsRequestKind.Projection,
        runId: 1,
        variant: baseVariant(),
    };
}

function takeProfitRequest(
    overrides: Partial<{
        anchorRrRatio: number;
        rrCandidates: readonly number[];
    }> = {},
): ToolsWorkerRequest {
    return {
        anchorRrRatio: 2,
        kind: ToolsRequestKind.TakeProfitRows,
        rrCandidates: [1, 1.5, 2, 3],
        runId: 1,
        variant: baseVariant(),
        ...overrides,
    };
}

describe('toolsRequestSchema (VD-24)', () => {
    it('parses every request kind and survives a structuredClone round trip', () => {
        const requests: ToolsWorkerRequest[] = [
            projectionRequest(),
            {
                bankroll: bankrollPolicy(),
                dayBudget: 180,
                kind: ToolsRequestKind.TwoStrategies,
                runId: 2,
                variants: [baseVariant(), baseVariant()],
            },
            {
                attempts: 100,
                kind: ToolsRequestKind.Batch,
                runId: 3,
                variant: baseVariant(),
            },
            {
                bankroll: 2000,
                kind: ToolsRequestKind.SameEv,
                runId: 4,
                variants: [baseVariant(), baseVariant()],
            },
            {
                bankroll: 2000,
                kind: ToolsRequestKind.Levers,
                requestSizes: null,
                risks: [125, 375],
                runId: 5,
                tradesPerDay: null,
                variant: baseVariant(),
            },
            {
                dayBudget: 180,
                kind: ToolsRequestKind.NextRound,
                optionA: bankrollPolicy(),
                optionB: bankrollPolicy(6500),
                runId: 6,
                trials: 500,
                variant: baseVariant(),
            },
            {
                anchorRrRatio: 2,
                kind: ToolsRequestKind.TakeProfitRows,
                rrCandidates: [1, 1.5, 2, 3],
                runId: 7,
                variant: baseVariant(),
            },
            {
                kind: ToolsRequestKind.ValueChain,
                plan: baseVariant().plan,
                runId: 8,
                spec: documentedPolicySpec(),
            },
            {
                kind: ToolsRequestKind.FundedValueEstimate,
                plan: baseVariant().plan,
                runId: 9,
                sampleSize: 12,
                spec: documentedPolicySpec(),
            },
            {
                kind: ToolsRequestKind.FundedValueEstimate,
                plan: baseVariant().plan,
                runId: 10,
                sampleSize: null,
                spec: documentedPolicySpec(),
            },
        ];

        for (const request of requests) {
            const cloned = structuredClone(request);
            expect(parseToolsRequest(cloned)).toEqual(request);
        }
    });

    it('rejects a request with an out-of-range win rate', () => {
        const invalid = {
            ...projectionRequest(),
            variant: {
                ...baseVariant(),
                base: { ...baseVariant().base, winrate: 1.5 },
            },
        };
        expect(() => parseToolsRequest(invalid)).toThrow();
    });

    it('rejects a value request whose spec carries no EnginePolicy', () => {
        const specWithoutPolicy: Record<string, unknown> = {
            ...documentedPolicySpec(),
        };
        delete specWithoutPolicy.enginePolicy;
        for (const kind of [
            ToolsRequestKind.ValueChain,
            ToolsRequestKind.FundedValueEstimate,
        ]) {
            expect(() =>
                parseToolsRequest({
                    kind,
                    plan: baseVariant().plan,
                    runId: 1,
                    sampleSize: null,
                    spec: specWithoutPolicy,
                }),
            ).toThrow();
        }
    });

    it('rejects an unknown kind', () => {
        expect(() =>
            parseToolsRequest({ ...projectionRequest(), kind: 'bogus' }),
        ).toThrow();
    });
});

describe('takeProfitRowsRequestSchema (PT-64c)', () => {
    it('rejects an empty candidate list', () => {
        expect(() =>
            parseToolsRequest(takeProfitRequest({ rrCandidates: [] })),
        ).toThrow();
    });

    it('rejects a non-positive anchor rr', () => {
        expect(() =>
            parseToolsRequest(takeProfitRequest({ anchorRrRatio: 0 })),
        ).toThrow();
    });

    it('rejects a non-positive candidate', () => {
        expect(() =>
            parseToolsRequest(takeProfitRequest({ rrCandidates: [1, -2] })),
        ).toThrow();
    });
});

function timelineResult() {
    return {
        cardsBoughtP50: 3,
        cashP10: [5000, 4800],
        cashP50: [5000, 5200],
        cashP90: [5000, 5600],
        cumulativeSpendP10: [0, 495],
        cumulativeSpendP50: [0, 495],
        cumulativeSpendP90: [0, 495],
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
}

function valueChainResponseWith(step: object) {
    return {
        kind: ToolsResponseKind.ValueChain,
        result: { accountValue: null, failedSteps: [], steps: [step] },
        runId: 3,
    };
}

describe('toolsResultSchema (VD-24)', () => {
    it('parses every response kind and survives a structuredClone round trip', () => {
        const results: ToolsWorkerResult[] = [
            {
                kind: ToolsResponseKind.Projection,
                result: timelineResult(),
                runId: 1,
            },
            {
                kind: ToolsResponseKind.TwoStrategies,
                results: [timelineResult(), timelineResult()],
                runId: 2,
            },
            {
                kind: ToolsResponseKind.Batch,
                result: {
                    crossCheckLossProbability: 0.2,
                    fundedValueToAttemptCostRatio: 1.8,
                    lossProbability: 0.15,
                    lossProbabilityReason: null,
                    lossProbabilityStandardError: 0.02,
                    meanNet: 320,
                },
                runId: 3,
            },
            {
                kind: ToolsResponseKind.SameEv,
                results: [
                    {
                        evPerAttempt: 50,
                        evPerAttemptStandardError: 5,
                        lossRisk: 0.1,
                        noPayoutProbability: 0.4,
                    },
                    {
                        evPerAttempt: 40,
                        evPerAttemptStandardError: 4,
                        lossRisk: 0.2,
                        noPayoutProbability: 0.5,
                    },
                ],
                runId: 4,
            },
            {
                kind: ToolsResponseKind.Levers,
                rows: [],
                runId: 5,
            },
            {
                kind: ToolsResponseKind.NextRound,
                optionA: timelineResult(),
                optionB: timelineResult(),
                runId: 6,
            },
            { kind: ToolsResponseKind.Failed, reason: 'boom', runId: 7 },
            {
                kind: ToolsResponseKind.TakeProfitRows,
                rows: [
                    {
                        attemptPassProbability: 0.3,
                        daysToPassP50: 12,
                        expectedMonthlyNet: 300,
                        expectedNet: 250,
                        label: 'what-if: win rate derived from your stated point, differs from your fixed 1:2',
                        rrRatio: 1,
                        winrate: 0.5486,
                    },
                ],
                runId: 8,
            },
            {
                kind: ToolsResponseKind.ValueChain,
                result: {
                    accountValue: null,
                    failedSteps: [],
                    steps: [
                        {
                            assumptions: [],
                            kind: ValueChainStepKind.EvalStart,
                            value: {
                                creditFree: { standardError: 10, value: 100 },
                                creditInclusive: {
                                    standardError: 12,
                                    value: 120,
                                },
                                kind: ValueResultKind.Value,
                                seed: 1,
                                trials: 500,
                            },
                        },
                        {
                            assumptions: [],
                            kind: ValueChainStepKind.FreshFunded,
                            value: {
                                creditFree: { standardError: 20, value: 900 },
                                creditInclusive: {
                                    standardError: 22,
                                    value: 950,
                                },
                                kind: ValueResultKind.Value,
                                seed: 1,
                                trials: 500,
                            },
                        },
                    ],
                },
                runId: 9,
            },
            {
                kind: ToolsResponseKind.FundedValueEstimate,
                result: {
                    meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                    payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
                    probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                    sampleRange: {
                        label: FUNDED_VALUE_SAMPLE_RANGE_LABEL,
                        lower: 1.5,
                        sampleSize: 10,
                        upper: 2.7,
                    },
                    seed: 1,
                    trials: 500,
                },
                runId: 10,
            },
            {
                kind: ToolsResponseKind.FundedValueEstimate,
                result: {
                    meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                    payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
                    probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                    sampleRange: null,
                    seed: 1,
                    trials: 500,
                },
                runId: 11,
            },
        ];

        for (const result of results) {
            const cloned = structuredClone(result);
            expect(parseToolsResult(cloned)).toEqual(result);
        }
    });

    it('keeps the failed value chain steps and their reasons through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.ValueChain,
            result: {
                accountValue: null,
                failedSteps: [
                    {
                        kind: ValueChainStepKind.FirstPayoutEligible,
                        reason: 'no first-payout-eligible account',
                    },
                ],
                steps: [],
            },
            runId: 3,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('keeps the assumptions of a value chain step through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.ValueChain,
            result: {
                accountValue: null,
                failedSteps: [],
                steps: [
                    {
                        assumptions: [
                            '3 equal winning sessions: the plan payout day gate needs 3 sessions',
                            'Total profit $2,600.01, $866.67 per session',
                        ],
                        kind: ValueChainStepKind.FirstPayoutEligible,
                        value: {
                            creditFree: { standardError: 10, value: 100 },
                            creditInclusive: { standardError: 12, value: 120 },
                            kind: ValueResultKind.Value,
                            seed: 1,
                            trials: 500,
                        },
                    },
                ],
            },
            runId: 3,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('rejects a value chain step without its assumptions or with a non-text assumption', () => {
        const value = {
            creditFree: { standardError: 10, value: 100 },
            creditInclusive: { standardError: 12, value: 120 },
            kind: ValueResultKind.Value,
            seed: 1,
            trials: 500,
        };
        expect(() =>
            parseToolsResult(
                valueChainResponseWith({
                    kind: ValueChainStepKind.EvalStart,
                    value,
                }),
            ),
        ).toThrow();
        expect(() =>
            parseToolsResult(
                valueChainResponseWith({
                    assumptions: [3],
                    kind: ValueChainStepKind.EvalStart,
                    value,
                }),
            ),
        ).toThrow();
    });

    it('rejects a failed value chain step with an unknown kind', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.ValueChain,
                result: {
                    accountValue: null,
                    failedSteps: [{ kind: 'no-such-step', reason: 'x' }],
                    steps: [],
                },
                runId: 3,
            }),
        ).toThrow();
    });

    it('rejects a value chain step with a negative trial count', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.ValueChain,
                result: {
                    accountValue: null,
                    failedSteps: [],
                    steps: [
                        {
                            assumptions: [],
                            kind: ValueChainStepKind.EvalStart,
                            value: {
                                creditFree: { standardError: 10, value: 100 },
                                creditInclusive: {
                                    standardError: 12,
                                    value: 120,
                                },
                                kind: ValueResultKind.Value,
                                seed: 1,
                                trials: -1,
                            },
                        },
                    ],
                },
                runId: 1,
            }),
        ).toThrow();
    });

    it('rejects a result with a probability outside [0, 1]', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.Projection,
                result: { ...timelineResult(), pathRuin: 1.2 },
                runId: 1,
            }),
        ).toThrow();
    });

    it('rejects a take-profit row with a win rate outside [0, 1]', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.TakeProfitRows,
                rows: [
                    {
                        attemptPassProbability: 0.3,
                        daysToPassP50: 12,
                        expectedMonthlyNet: 300,
                        expectedNet: 250,
                        label: 'what-if',
                        rrRatio: 1,
                        winrate: 1.5,
                    },
                ],
                runId: 1,
            }),
        ).toThrow();
    });

    it('round trips a lever row that carries a P(attempt pays) delta', () => {
        const result: ToolsWorkerResult = {
            kind: ToolsResponseKind.Levers,
            rows: [
                {
                    deltaAttemptPaysProbability: 0.125,
                    deltaEvPerAttempt: 10,
                    deltaMonthlyNet: 50,
                    deltaPassProbability: 0.05,
                    evPerAttempt: 40,
                    kind: BankrollLeverKind.Risk,
                    label: null,
                    lossRisk: 0.2,
                    monthlyNet: 300,
                    passProbability: 0.5,
                    value: 500,
                },
            ],
            runId: 9,
        };
        const cloned = structuredClone(result);
        const parsed = parseToolsResult(cloned);
        expect(parsed).toEqual(result);
        if (parsed.kind !== ToolsResponseKind.Levers)
            throw new Error('unreachable');
        expect(parsed.rows[0]?.deltaAttemptPaysProbability).toBe(0.125);
    });
});

function copySplitRequest(
    overrides: Partial<{
        objective: SizingObjective;
        splits: number[];
        totalRisk: number;
    }> = {},
): ToolsWorkerRequest {
    return {
        funded: DEFAULT_COPY_SPLIT_FUNDED,
        kind: ToolsRequestKind.CopySplit,
        objective: SizingObjective.MonthlyNet,
        runId: 11,
        splits: [1, 2, 10],
        totalRisk: 2000,
        variant: baseVariant(),
        ...overrides,
    };
}

describe('toolsRequestSchema CopySplit kind (PT-63, F-V24, VD-24)', () => {
    it('parses the request and survives a structuredClone round trip', () => {
        const request = copySplitRequest();
        expect(parseToolsRequest(structuredClone(request))).toEqual(request);
    });

    it('carries every objective, including RuinFirst, which the engine ranks as MonthlyNet', () => {
        for (const objective of Object.values(SizingObjective)) {
            const request = copySplitRequest({ objective });
            expect(parseToolsRequest(request)).toEqual(request);
        }
    });

    it('rejects an unknown objective, an empty or oversized split list and bad splits', () => {
        expect(() =>
            parseToolsRequest({ ...copySplitRequest(), objective: 'fast' }),
        ).toThrow();
        expect(() =>
            parseToolsRequest(copySplitRequest({ splits: [] })),
        ).toThrow();
        expect(() =>
            parseToolsRequest(copySplitRequest({ splits: [1.5] })),
        ).toThrow();
        expect(() =>
            parseToolsRequest(copySplitRequest({ splits: [0] })),
        ).toThrow();
        expect(() =>
            parseToolsRequest(copySplitRequest({ splits: [21] })),
        ).toThrow();
        expect(() =>
            parseToolsRequest(
                copySplitRequest({
                    splits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                }),
            ),
        ).toThrow();
    });

    it('rejects a non-positive total risk', () => {
        expect(() =>
            parseToolsRequest(copySplitRequest({ totalRisk: 0 })),
        ).toThrow();
        expect(() =>
            parseToolsRequest(copySplitRequest({ totalRisk: -5 })),
        ).toThrow();
    });
});

describe('toolsResultSchema CopySplit kind (PT-63, F-V24)', () => {
    const result: CopySplitToolsResult = {
        kind: ToolsResponseKind.CopySplit,
        result: {
            basisLines: ['funded risk $250 per account'],
            indistinguishableSplits: [2],
            note: null,
            objective: SizingObjective.MonthlyNet,
            requestedObjective: SizingObjective.MonthlyNet,
            rows: [
                {
                    cycleNet: { standardError: 20, value: 150 },
                    daysToPassP50: 8,
                    kind: CopySplitRowKind.Simulated,
                    netPerFeeDollar: 1.5,
                    passRate: 0.4,
                    placement: { contracts: 2, placedRiskPerAccount: 800 },
                    riskPerAccount: 1000,
                    splitCount: 2,
                    totalFees: 100,
                    totalMonthlyNet: { standardError: null, value: 300 },
                    trials: 150,
                },
                {
                    kind: CopySplitRowKind.Refused,
                    reason: 'below one contract',
                    riskPerAccount: 200,
                    splitCount: 10,
                },
            ],
            trialsPerSplit: 150,
        },
        runId: 11,
    };

    it('round trips a simulated and a refused row', () => {
        expect(parseToolsResult(structuredClone(result))).toEqual(result);
    });

    it('rejects a result without its basis lines or its indistinguishable splits', () => {
        const withoutBasis: Record<string, unknown> = { ...result.result };
        delete withoutBasis.basisLines;
        expect(() =>
            parseToolsResult({ ...result, result: withoutBasis }),
        ).toThrow();
        const withoutNoise: Record<string, unknown> = { ...result.result };
        delete withoutNoise.indistinguishableSplits;
        expect(() =>
            parseToolsResult({ ...result, result: withoutNoise }),
        ).toThrow();
    });

    it('rejects a non-integer indistinguishable split', () => {
        expect(() =>
            parseToolsResult({
                ...result,
                result: { ...result.result, indistinguishableSplits: [1.5] },
            }),
        ).toThrow();
    });

    it('rejects a row with a pass rate outside [0, 1]', () => {
        const [first, ...rest] = result.result.rows;
        if (first?.kind !== CopySplitRowKind.Simulated) throw new Error('row');
        expect(() =>
            parseToolsResult({
                ...result,
                result: {
                    ...result.result,
                    rows: [{ ...first, passRate: 1.5 }, ...rest],
                },
            }),
        ).toThrow();
    });

    it('rejects a row of an unknown kind', () => {
        expect(() =>
            parseToolsResult({
                ...result,
                result: {
                    ...result.result,
                    rows: [{ kind: 'mystery', splitCount: 1 }],
                },
            }),
        ).toThrow();
    });
});

describe('runIdOf', () => {
    it('reads a numeric runId from an object and nothing else', () => {
        expect(runIdOf({ runId: 7 })).toBe(7);
        expect(runIdOf({ runId: '7' })).toBeNull();
        expect(runIdOf({})).toBeNull();
        expect(runIdOf(null)).toBeNull();
        expect(runIdOf(undefined)).toBeNull();
        expect(runIdOf('runId')).toBeNull();
    });
});
