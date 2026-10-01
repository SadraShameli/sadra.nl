import { describe, expect, it } from 'vitest';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    fundedValueEstimateToolsRequest,
    fundedValueSampleSize,
    isInvalidSampleSizeField,
    parseFundedValueSampleSizeField,
    sampleRangeSubText,
    sampleRangeText,
    signedCurrencyText,
    toolsWorkerFailureReason,
    toolsWorkerPendingText,
    uncertainCountText,
    uncertainCurrencyText,
    type ValueCardsCalculatorInputs,
    valueCardsInputFor,
    ValueCardsInputKind,
    valueChainCardSteps,
    valueChainToolsRequest,
} from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { ToolsRequestKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { CENTS_PER_DOLLAR, findFirm, FirmId } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK, type RulebookParameters } from '~/lib/prop-calculator/advisor';
import {
    type ValueChainResult,
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { TopStepVariant } from '~/lib/prop-calculator/core';

function calculatorInputs(
    overrides: Partial<ValueCardsCalculatorInputs> = {},
): ValueCardsCalculatorInputs {
    return {
        fundedHorizonDays: 60,
        instrument: null,
        maxEvalDays: 60,
        payoutRequestSize: null,
        plan: topStep50kPlan(),
        retainedCushion: null,
        seed: 7,
        stopPoints: null,
        takesFundedReset: false,
        takesOneTimeEarlyWithdrawal: false,
        trials: 500,
        ...overrides,
    };
}

function readyCards(
    inputs: ValueCardsCalculatorInputs,
    rulebook: RulebookParameters,
) {
    const input = valueCardsInputFor(inputs, rulebook);
    if (input.kind !== ValueCardsInputKind.Ready) {
        throw new Error(`expected ready value cards, got: ${input.reason}`);
    }
    return input.cards;
}

function topStep50kPlan() {
    const firm = findFirm(FirmId.TopStep);
    const plan = firm?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan not found');
    return plan;
}

describe('valueCardsInputFor (PT-66)', () => {
    it('builds a plan reference and an EnginePolicy-backed spec from the calculator inputs', () => {
        const cards = readyCards(calculatorInputs(), DEFAULT_RULEBOOK);
        expect(cards.plan.firmId).toBe(FirmId.TopStep);
        expect(cards.plan.optIns).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
        expect(cards.spec.enginePolicy.fundedHorizonDays).toBe(60);
        expect(cards.spec.rulebook).toBe(DEFAULT_RULEBOOK);
        expect(cards.spec.run).toEqual({ maxEvalDays: 60, seed: 7, trials: 500 });
    });

    it('overrides the retained cushion request from the calculator state when it is set', () => {
        const cards = readyCards(
            calculatorInputs({ retainedCushion: 3000 }),
            DEFAULT_RULEBOOK,
        );
        expect(cards.spec.enginePolicy.retainedCushionRequest).toBe(3000);
    });

    it('falls back to the rulebook payout request when the calculator has none entered', () => {
        const rulebook: RulebookParameters = {
            ...DEFAULT_RULEBOOK,
            payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 75_000 },
        };
        const cards = readyCards(calculatorInputs(), rulebook);
        expect(cards.spec.enginePolicy.payoutRequestOverride).toBe(
            75_000 / CENTS_PER_DOLLAR,
        );
    });

    it('uses the calculator payout request size when one is entered', () => {
        const cards = readyCards(
            calculatorInputs({ payoutRequestSize: 600 }),
            DEFAULT_RULEBOOK,
        );
        expect(cards.spec.enginePolicy.payoutRequestOverride).toBe(600);
    });

    it.each([
        ['a payout request of zero', { payoutRequestSize: 0 }],
        ['a payout request that is not a whole number of cents', { payoutRequestSize: 600.005 }],
        ['a fractional retained cushion', { retainedCushion: 100.123 }],
    ] as const)('refuses with a reason instead of throwing for %s', (_name, overrides) => {
        const input = valueCardsInputFor(
            calculatorInputs({ ...overrides }),
            DEFAULT_RULEBOOK,
        );
        expect(input.kind).toBe(ValueCardsInputKind.Refused);
        if (input.kind === ValueCardsInputKind.Refused) {
            expect(input.reason.length).toBeGreaterThan(0);
        }
    });

    it('names the offending calculator input in the refusal', () => {
        const input = valueCardsInputFor(
            calculatorInputs({ payoutRequestSize: 0 }),
            DEFAULT_RULEBOOK,
        );
        expect(input.kind === ValueCardsInputKind.Refused && input.reason).toContain(
            'payoutRequestOverride',
        );
    });
});

describe('value chain and funded value request builders (PT-66)', () => {
    it('builds a ValueChain request carrying the full spec and plan reference', () => {
        const cards = readyCards(calculatorInputs(), DEFAULT_RULEBOOK);
        const request = valueChainToolsRequest(cards, 5);
        expect(request).toEqual({
            kind: ToolsRequestKind.ValueChain,
            plan: cards.plan,
            runId: 5,
            spec: cards.spec,
        });
    });

    it('builds a FundedValueEstimate request carrying the sample size', () => {
        const cards = readyCards(calculatorInputs(), DEFAULT_RULEBOOK);
        const request = fundedValueEstimateToolsRequest(cards, 12, 6);
        expect(request).toEqual({
            kind: ToolsRequestKind.FundedValueEstimate,
            plan: cards.plan,
            runId: 6,
            sampleSize: 12,
            spec: cards.spec,
        });
    });
});

function valueChainResult(): ValueChainResult {
    return {
        accountValue: null,
        steps: [
            { kind: ValueChainStepKind.EvalStart, value: valueResult(1, 500, 90, 100) },
            { kind: ValueChainStepKind.FreshFunded, value: valueResult(1, 500, 800, 900) },
            {
                kind: ValueChainStepKind.FirstPayoutEligible,
                value: valueResult(1, 500, 1200, 1400),
            },
            {
                kind: ValueChainStepKind.PostFirstPayout,
                value: valueResult(1, 500, 900, 950),
            },
        ],
    };
}

function valueResult(
    seed: number,
    trials: number,
    creditFree: number,
    creditInclusive: number,
) {
    return {
        creditFree: { standardError: 3, value: creditFree },
        creditInclusive: { standardError: 5, value: creditInclusive },
        kind: ValueResultKind.Value as const,
        seed,
        trials,
    };
}

describe('valueChainCardSteps (PT-66)', () => {
    it('has no gap for the first step and a credit-free gap from the previous step for every other one', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps).toHaveLength(4);
        expect(steps[0]?.gapFromPrevious).toBeNull();
        expect(steps[1]?.gapFromPrevious?.value).toBe(710);
        expect(steps[2]?.gapFromPrevious?.value).toBe(400);
        expect(steps[3]?.gapFromPrevious?.value).toBe(-300);
    });

    it('carries the gap standard error from the two credit-free standard errors', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps[1]?.gapFromPrevious?.standardError).toBeCloseTo(Math.hypot(3, 3), 10);
    });

    it('keeps both credit bases per step so the headline can be credit-free', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps[0]?.creditFree).toEqual({ standardError: 3, value: 90 });
        expect(steps[0]?.creditInclusive).toEqual({ standardError: 5, value: 100 });
    });

    it('keeps each step value in order', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
    });
});

describe('value figure text (PT-66)', () => {
    it('shows a currency estimate with its standard error when there is one', () => {
        expect(uncertainCurrencyText({ standardError: 5, value: 100 })).toBe('$100 ± $5');
    });

    it('omits the standard error when it is null', () => {
        expect(uncertainCurrencyText({ standardError: null, value: 100 })).toBe('$100');
    });

    it('signs a currency gap', () => {
        expect(signedCurrencyText(710)).toBe('+$710');
        expect(signedCurrencyText(-300)).toBe('-$300');
        expect(signedCurrencyText(0)).toBe('+$0');
    });

    it('shows a payout count with two decimals and its standard error', () => {
        expect(uncertainCountText({ standardError: 0.041, value: 1.234 })).toBe('1.23 ± 0.04');
        expect(uncertainCountText({ standardError: null, value: 1.234 })).toBe('1.23');
    });

    it('shows the sample range as lower to upper, and nothing until a sample size exists', () => {
        expect(
            sampleRangeText({
                label: 'what your own n accounts could show by chance',
                lower: 0.5,
                sampleSize: 10,
                upper: 1.75,
            }),
        ).toBe('0.50 to 1.75');
        expect(sampleRangeText(null)).toBeNull();
    });
});

describe('sampleRangeSubText (PT-66)', () => {
    it('names the sample size the range was computed for', () => {
        expect(
            sampleRangeSubText({
                label: 'what your own n accounts could show by chance',
                lower: 0.5,
                sampleSize: 10,
                upper: 1.75,
            }),
        ).toBe('what your own n accounts could show by chance, n = 10');
    });

    it('asks for a sample size when there is no range', () => {
        expect(sampleRangeSubText(null)).toBe('enter a sample size');
    });
});

describe('fundedValueSampleSize (PT-66)', () => {
    it('is empty until a threshold or an entered value exists', () => {
        expect(fundedValueSampleSize(null, null)).toBeNull();
    });

    it('uses the rulebook threshold when nothing is entered', () => {
        expect(fundedValueSampleSize(10, null)).toBe(10);
    });

    it('prefers the entered value over the rulebook threshold', () => {
        expect(fundedValueSampleSize(10, 25)).toBe(25);
    });
});

describe('parseFundedValueSampleSizeField (PT-66)', () => {
    it('parses a positive integer', () => {
        expect(parseFundedValueSampleSizeField('12')).toBe(12);
    });

    it('rejects zero, negative, decimal and non-numeric text', () => {
        expect(parseFundedValueSampleSizeField('0')).toBeNull();
        expect(parseFundedValueSampleSizeField('-3')).toBeNull();
        expect(parseFundedValueSampleSizeField('1.5')).toBeNull();
        expect(parseFundedValueSampleSizeField('abc')).toBeNull();
        expect(parseFundedValueSampleSizeField('')).toBeNull();
    });
});

describe('isInvalidSampleSizeField (PT-66)', () => {
    it('treats an empty or blank field as not invalid so the threshold applies', () => {
        expect(isInvalidSampleSizeField('')).toBe(false);
        expect(isInvalidSampleSizeField(' '.repeat(3))).toBe(false);
    });

    it('accepts a positive integer', () => {
        expect(isInvalidSampleSizeField('12')).toBe(false);
    });

    it('flags zero, negative and decimal text', () => {
        expect(isInvalidSampleSizeField('0')).toBe(true);
        expect(isInvalidSampleSizeField('-1')).toBe(true);
        expect(isInvalidSampleSizeField('2.5')).toBe(true);
        expect(isInvalidSampleSizeField('abc')).toBe(true);
    });
});

describe('toolsWorkerPendingText (PT-66)', () => {
    it('reports a running computation and a cancelled one', () => {
        expect(toolsWorkerPendingText({ phase: ToolsWorkerPhase.Running })).toBe('Computing...');
        expect(toolsWorkerPendingText({ phase: ToolsWorkerPhase.Cancelled })).toBe(
            'Computation cancelled.',
        );
    });

    it('reports nothing for idle, failed or succeeded', () => {
        expect(toolsWorkerPendingText({ phase: ToolsWorkerPhase.Idle })).toBeNull();
        expect(
            toolsWorkerPendingText({ phase: ToolsWorkerPhase.Failed, reason: 'x' }),
        ).toBeNull();
    });
});

describe('toolsWorkerFailureReason (PT-66)', () => {
    it('surfaces the reason only when the worker failed', () => {
        expect(
            toolsWorkerFailureReason({ phase: ToolsWorkerPhase.Idle }),
        ).toBeNull();
        expect(
            toolsWorkerFailureReason({ phase: ToolsWorkerPhase.Running }),
        ).toBeNull();
        expect(
            toolsWorkerFailureReason({ phase: ToolsWorkerPhase.Cancelled }),
        ).toBeNull();
        expect(
            toolsWorkerFailureReason({
                phase: ToolsWorkerPhase.Failed,
                reason: 'no plan resolved',
            }),
        ).toBe('no plan resolved');
    });
});
