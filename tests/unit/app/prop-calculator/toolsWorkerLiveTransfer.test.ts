import { describe, expect, it } from 'vitest';

import {
    parseToolsResult,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    AssumptionBias,
    AssumptionKind,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor';
import {
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

const LIVE_TRANSFER: LiveTransferHazardAssumption = {
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: AssumptionKind.LiveTransferHazard,
    notes: ['A plan note.'],
    sentLiveShare: 0.41,
};

describe('the tools page keeps the live-transfer assumption (PT-73f)', () => {
    it('keeps the assumption of a value chain step through the response schema', () => {
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
                            creditFree: { standardError: 10, value: 100 },
                            creditInclusive: { standardError: 12, value: 120 },
                            kind: ValueResultKind.Value,
                            liveTransfer: LIVE_TRANSFER,
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

    it('keeps the assumption of the account value through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.ValueChain,
            result: {
                accountValue: {
                    creditFree: { standardError: 10, value: 100 },
                    creditInclusive: { standardError: 12, value: 120 },
                    kind: ValueResultKind.Value,
                    liveTransfer: LIVE_TRANSFER,
                    seed: 1,
                    trials: 500,
                },
                failedSteps: [],
                steps: [],
            },
            runId: 3,
        };

        expect(parseToolsResult(structuredClone(response))).toEqual(response);
    });

    it('keeps the assumption of the funded value estimate through the response schema', () => {
        const response = {
            kind: ToolsResponseKind.FundedValueEstimate,
            result: {
                liveTransfer: LIVE_TRANSFER,
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

    it('still parses a result without an assumption and adds none', () => {
        const response = {
            kind: ToolsResponseKind.FundedValueEstimate,
            result: {
                meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
                payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
                probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
                sampleRange: null,
                seed: 1,
                trials: 500,
            },
            runId: 10,
        };

        const parsed = parseToolsResult(structuredClone(response));

        expect(parsed).toEqual(response);
        expect(
            parsed.kind === ToolsResponseKind.FundedValueEstimate &&
                'liveTransfer' in parsed.result,
        ).toBe(false);
    });

    it('rejects an assumption that is not a live-transfer assumption', () => {
        expect(() =>
            parseToolsResult({
                kind: ToolsResponseKind.FundedValueEstimate,
                result: {
                    liveTransfer: { bias: 'neutral', hazard: 0.3 },
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
