import { describe, expect, it } from 'vitest';

import {
    parseToolsResult,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    AssumptionBias,
    AssumptionKind,
    type CumulativePayoutTriggerAssumption,
} from '~/lib/prop-calculator/advisor';
import {
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

const PRICED_TRIGGER: CumulativePayoutTriggerAssumption = {
    amount: 100_000,
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    kind: AssumptionKind.CumulativePayoutTriggerPriced,
    notes: ['A plan note.'],
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic test quote',
        url: 'https://example.test/policy',
    },
};

const VALUE = {
    creditFree: { standardError: 10, value: 100 },
    creditInclusive: { standardError: 12, value: 120 },
    kind: ValueResultKind.Value,
    seed: 1,
    trials: 500,
} as const;

describe('the tools page keeps the priced cumulative trigger (PT-36r, F-145)', () => {
    it('keeps the trigger of a value chain step through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.ValueChain,
            result: {
                accountValue: null,
                failedSteps: [],
                steps: [
                    {
                        assumptions: [],
                        kind: ValueChainStepKind.FreshFunded,
                        value: {
                            ...VALUE,
                            cumulativePayoutTrigger: PRICED_TRIGGER,
                        },
                    },
                ],
            },
            runId: 3,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('keeps the trigger of the account value through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.ValueChain,
            result: {
                accountValue: {
                    ...VALUE,
                    cumulativePayoutTrigger: PRICED_TRIGGER,
                },
                failedSteps: [],
                steps: [],
            },
            runId: 3,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('keeps the trigger of the funded value estimate through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.FundedValueEstimate,
            result: {
                cumulativePayoutTrigger: PRICED_TRIGGER,
                meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
                probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                sampleRange: null,
                seed: 1,
                trials: 500,
            },
            runId: 10,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('adds no trigger to a result that priced none', () => {
        const response = {
            kind: ToolsResponseKind.FundedValueEstimate,
            result: {
                meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                payoutCountDistribution: [1],
                probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                sampleRange: null,
                seed: 1,
                trials: 500,
            },
            runId: 10,
        };

        const parsed = parseToolsResult(structuredClone(response));

        expect(
            parsed.kind === ToolsResponseKind.FundedValueEstimate &&
                'cumulativePayoutTrigger' in parsed.result,
        ).toBe(false);
    });

    it('rejects a trigger that is not a priced cumulative trigger', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.FundedValueEstimate,
                result: {
                    cumulativePayoutTrigger: { bias: 'neutral', hazard: 0.3 },
                    meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                    payoutCountDistribution: [1],
                    probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                    sampleRange: null,
                    seed: 1,
                    trials: 500,
                },
                runId: 10,
            }),
        ).toThrow();
    });
});
