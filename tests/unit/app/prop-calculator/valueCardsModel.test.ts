import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    calculatorFieldLabelOf,
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
    valueChainCardFailures,
    valueChainCardSteps,
    valueChainToolsRequest,
} from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { ToolsRequestKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { CENTS_PER_DOLLAR, findFirm, FirmId } from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    type CumulativePayoutTriggerAssumption,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    CreditBasis,
    type ValueChainResult,
    type ValueChainStep,
    ValueChainStepKind,
    valueGap,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { TopStepVariant } from '~/lib/prop-calculator/core';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

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
        expect(cards.spec.run).toEqual({
            maxEvalDays: 60,
            seed: 7,
            trials: 500,
        });
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
        [
            'a payout request that is not a whole number of cents',
            { payoutRequestSize: 600.005 },
        ],
        ['a fractional retained cushion', { retainedCushion: 100.123 }],
    ] as const)(
        'refuses with a reason instead of throwing for %s',
        (_name, overrides) => {
            const input = valueCardsInputFor(
                calculatorInputs({ ...overrides }),
                DEFAULT_RULEBOOK,
            );
            expect(input.kind).toBe(ValueCardsInputKind.Refused);
            if (input.kind === ValueCardsInputKind.Refused) {
                expect(input.reason.length).toBeGreaterThan(0);
            }
        },
    );

    it('names the offending calculator field in the refusal, not the engine field (PT-67 addendum)', () => {
        const input = valueCardsInputFor(
            calculatorInputs({ payoutRequestSize: 0 }),
            DEFAULT_RULEBOOK,
        );
        const reason =
            input.kind === ValueCardsInputKind.Refused ? input.reason : '';
        expect(reason).toContain('Payout request size ($)');
        expect(reason).toContain('must be more than zero');
        expect(reason).not.toContain('payoutRequestOverride');
    });

    it('names the retained cushion field, not retainedCushionRequest (PT-67 addendum)', () => {
        const input = valueCardsInputFor(
            calculatorInputs({ retainedCushion: 100.123 }),
            DEFAULT_RULEBOOK,
        );
        const reason =
            input.kind === ValueCardsInputKind.Refused ? input.reason : '';
        expect(reason).toContain('Retained cushion on payout ($)');
        expect(reason).not.toContain('retainedCushionRequest');
    });

    it('names both calculator fields once each when both are refused (PT-67 addendum)', () => {
        const input = valueCardsInputFor(
            calculatorInputs({
                payoutRequestSize: 0,
                retainedCushion: 100.123,
            }),
            DEFAULT_RULEBOOK,
        );
        const reason =
            input.kind === ValueCardsInputKind.Refused ? input.reason : '';
        expect(reason.split('Payout request size ($)')).toHaveLength(2);
        expect(reason.split('Retained cushion on payout ($)')).toHaveLength(2);
    });
});

describe('calculatorFieldLabelOf (PT-67 review)', () => {
    it('names a calculator field by its label', () => {
        expect(calculatorFieldLabelOf(['payoutRequestOverride'])).toBe(
            'Payout request size ($)',
        );
        expect(calculatorFieldLabelOf(['retainedCushionRequest'])).toBe(
            'Retained cushion on payout ($)',
        );
    });

    it('names an unlabelled engine field by its own name, with its nested path, instead of a generic text', () => {
        expect(calculatorFieldLabelOf(['commissionPerRoundTrip'])).toBe(
            'commissionPerRoundTrip',
        );
        expect(
            calculatorFieldLabelOf(['lifetimePayoutCapOverride', 'cap']),
        ).toBe('lifetimePayoutCapOverride.cap');
    });

    it('falls back to a generic name only when the issue carries no path', () => {
        expect(calculatorFieldLabelOf([])).toBe('Engine policy');
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

function chainStep(
    kind: ValueChainStepKind,
    creditFree: number,
    creditInclusive: number,
    assumptions: readonly string[] = [],
): ValueChainStep {
    return {
        assumptions,
        kind,
        value: valueResult(1, 500, creditFree, creditInclusive),
    };
}

function valueChainResult(): ValueChainResult {
    return {
        accountValue: null,
        failedSteps: [],
        steps: [
            chainStep(ValueChainStepKind.EvalStart, 90, 100),
            chainStep(ValueChainStepKind.FreshFunded, 800, 900),
            chainStep(ValueChainStepKind.FirstPayoutEligible, 1200, 1400),
            chainStep(ValueChainStepKind.PostFirstPayout, 900, 950),
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

    it('takes the gap from valueGap on the credit-free basis, the one shared gap (PT-67 addendum)', () => {
        const result = valueChainResult();
        const steps = valueChainCardSteps(result);
        for (const [index, step] of steps.entries()) {
            const previous = result.steps[index - 1];
            const current = result.steps[index];
            if (previous === undefined || current === undefined) {
                expect(step.gapFromPrevious).toBeNull();
                continue;
            }
            expect(step.gapFromPrevious).toEqual(
                valueGap(previous.value, current.value, CreditBasis.CreditFree),
            );
        }
    });

    it('carries the gap standard error from the two credit-free standard errors', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps[1]?.gapFromPrevious?.standardError).toBeCloseTo(
            Math.hypot(3, 3),
            10,
        );
    });

    it('keeps both credit bases per step so the headline can be credit-free', () => {
        const steps = valueChainCardSteps(valueChainResult());
        expect(steps[0]?.creditFree).toEqual({ standardError: 3, value: 90 });
        expect(steps[0]?.creditInclusive).toEqual({
            standardError: 5,
            value: 100,
        });
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

describe('valueChainCardSteps with failed steps (PT-67d)', () => {
    it('draws no gap for a step whose preceding kind failed', () => {
        const result: ValueChainResult = {
            accountValue: null,
            failedSteps: [
                {
                    kind: ValueChainStepKind.FirstPayoutEligible,
                    reason: 'no account',
                },
            ],
            steps: [
                chainStep(ValueChainStepKind.EvalStart, 90, 100),
                chainStep(ValueChainStepKind.FreshFunded, 800, 900),
                chainStep(ValueChainStepKind.PostFirstPayout, 900, 950),
            ],
        };

        const steps = valueChainCardSteps(result);

        expect(steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.PostFirstPayout,
        ]);
        expect(steps[1]?.gapFromPrevious?.value).toBe(710);
        expect(steps[2]?.gapFromPrevious).toBeNull();
    });

    it('draws no gap for fresh funded when the eval start failed', () => {
        const result: ValueChainResult = {
            accountValue: null,
            failedSteps: [
                { kind: ValueChainStepKind.EvalStart, reason: 'no account' },
            ],
            steps: [
                chainStep(ValueChainStepKind.FreshFunded, 800, 900),
                chainStep(ValueChainStepKind.FirstPayoutEligible, 1200, 1400),
            ],
        };

        const steps = valueChainCardSteps(result);

        expect(steps[0]?.gapFromPrevious).toBeNull();
        expect(steps[1]?.gapFromPrevious?.value).toBe(400);
    });

    it('takes the gap from the adjacent kind in the fixed step order, not from the previous array entry', () => {
        const result: ValueChainResult = {
            accountValue: null,
            failedSteps: [],
            steps: [
                chainStep(ValueChainStepKind.FreshFunded, 800, 900),
                chainStep(ValueChainStepKind.EvalStart, 90, 100),
            ],
        };

        const byKind = new Map(
            valueChainCardSteps(result).map((step) => [step.kind, step]),
        );

        expect(
            byKind.get(ValueChainStepKind.EvalStart)?.gapFromPrevious,
        ).toBeNull();
        expect(
            byKind.get(ValueChainStepKind.FreshFunded)?.gapFromPrevious?.value,
        ).toBe(710);
    });

    it('carries each step assumptions to the card', () => {
        const result: ValueChainResult = {
            accountValue: null,
            failedSteps: [],
            steps: [
                chainStep(ValueChainStepKind.EvalStart, 90, 100),
                chainStep(ValueChainStepKind.FirstPayoutEligible, 1200, 1400, [
                    '3 equal winning sessions',
                ]),
            ],
        };

        const steps = valueChainCardSteps(result);

        expect(steps[0]?.assumptions).toEqual([]);
        expect(steps[1]?.assumptions).toEqual(['3 equal winning sessions']);
    });
});

describe('valueChainCardFailures (PT-67d)', () => {
    it('is empty when every step built', () => {
        expect(valueChainCardFailures(valueChainResult())).toEqual([]);
    });

    it('names every failed step by its label with the reason, in the fixed step order', () => {
        const result: ValueChainResult = {
            accountValue: null,
            failedSteps: [
                {
                    kind: ValueChainStepKind.PostFirstPayout,
                    reason: 'depends on the eligible step',
                },
                {
                    kind: ValueChainStepKind.FirstPayoutEligible,
                    reason: 'no account passes',
                },
            ],
            steps: [],
        };

        expect(valueChainCardFailures(result)).toEqual([
            {
                kind: ValueChainStepKind.FirstPayoutEligible,
                text: 'First payout eligible: no account passes',
            },
            {
                kind: ValueChainStepKind.PostFirstPayout,
                text: 'Post first payout: depends on the eligible step',
            },
        ]);
    });
});

describe('value figure text (PT-66)', () => {
    it('shows a currency estimate with its standard error when there is one', () => {
        expect(uncertainCurrencyText({ standardError: 5, value: 100 })).toBe(
            '$100 ± $5',
        );
    });

    it('omits the standard error when it is null', () => {
        expect(uncertainCurrencyText({ standardError: null, value: 100 })).toBe(
            '$100',
        );
    });

    it('signs a currency gap', () => {
        expect(signedCurrencyText(710)).toBe('+$710');
        expect(signedCurrencyText(-300)).toBe('-$300');
        expect(signedCurrencyText(0)).toBe('+$0');
    });

    it('shows a payout count with two decimals and its standard error', () => {
        expect(uncertainCountText({ standardError: 0.041, value: 1.234 })).toBe(
            '1.23 ± 0.04',
        );
        expect(uncertainCountText({ standardError: null, value: 1.234 })).toBe(
            '1.23',
        );
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
        expect(
            toolsWorkerPendingText({ phase: ToolsWorkerPhase.Running }),
        ).toBe('Computing...');
        expect(
            toolsWorkerPendingText({ phase: ToolsWorkerPhase.Cancelled }),
        ).toBe('Computation cancelled.');
    });

    it('reports nothing for idle, failed or succeeded', () => {
        expect(
            toolsWorkerPendingText({ phase: ToolsWorkerPhase.Idle }),
        ).toBeNull();
        expect(
            toolsWorkerPendingText({
                phase: ToolsWorkerPhase.Failed,
                reason: 'x',
            }),
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

describe('valueChainCardSteps keeps each step live-transfer assumption (PT-63d, F-V26, PT-73g leftover)', () => {
    const hazard: LiveTransferHazardAssumption = {
        bias: AssumptionBias.Neutral,
        continuation: LiveTransferContinuationKind.NotModeled,
        hazard: 0.3,
        kind: AssumptionKind.LiveTransferHazard,
        notes: ['A plan note.'],
        sentLiveShare: 0.41,
    };

    it('carries the assumption of the step that priced a hazard and nothing for the others', () => {
        const result = valueChainResult();
        const priced: ValueChainResult = {
            ...result,
            steps: result.steps.map((step) =>
                step.kind === ValueChainStepKind.FreshFunded
                    ? {
                          ...step,
                          value: { ...step.value, liveTransfer: hazard },
                      }
                    : step,
            ),
        };
        const steps = valueChainCardSteps(priced);
        expect(
            steps.find((step) => step.kind === ValueChainStepKind.FreshFunded)
                ?.liveTransfer,
        ).toBe(hazard);
        expect(
            steps
                .filter((step) => step.kind !== ValueChainStepKind.FreshFunded)
                .map((step) => step.liveTransfer),
        ).toStrictEqual([undefined, undefined, undefined]);
    });

    it('lets the card read the assumption from its steps and not from the raw result', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/_components/value/ValueChainCard.tsx',
            ),
            'utf8',
        );
        expect(source).not.toContain('result.steps');
        expect(source).toContain('step.liveTransfer');
    });
});

describe('valueChainCardSteps keeps each step priced cumulative trigger (PT-36r, F-145)', () => {
    const trigger: CumulativePayoutTriggerAssumption = {
        amount: 100_000,
        bias: AssumptionBias.Neutral,
        continuation: LiveTransferContinuationKind.NotModeled,
        kind: AssumptionKind.CumulativePayoutTriggerPriced,
        notes: [],
        source: {
            fetchedOn: '2026-09-01',
            quote: 'a synthetic test quote',
            url: 'https://example.test/policy',
        },
    };

    it('carries the trigger of the step that priced one and nothing for the others', () => {
        const result = valueChainResult();
        const priced: ValueChainResult = {
            ...result,
            steps: result.steps.map((step) =>
                step.kind === ValueChainStepKind.FreshFunded
                    ? {
                          ...step,
                          value: {
                              ...step.value,
                              cumulativePayoutTrigger: trigger,
                          },
                      }
                    : step,
            ),
        };
        const steps = valueChainCardSteps(priced);
        expect(
            steps.find((step) => step.kind === ValueChainStepKind.FreshFunded)
                ?.cumulativePayoutTrigger,
        ).toBe(trigger);
        expect(
            steps
                .filter((step) => step.kind !== ValueChainStepKind.FreshFunded)
                .map((step) => step.cumulativePayoutTrigger),
        ).toStrictEqual([undefined, undefined, undefined]);
    });
});
