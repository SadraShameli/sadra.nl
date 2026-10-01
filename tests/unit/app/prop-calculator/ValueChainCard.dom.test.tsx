import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import {
    type ValueCardsInput,
    ValueCardsInputKind,
    type ValueCardsSpec,
} from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import {
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
} from '~/lib/prop-calculator/advisor';
import {
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { MffuVariant } from '~/lib/prop-calculator/core';

const DEBOUNCE_MS = 180;

const toolsWorkerBox = vi.hoisted(() => ({
    instances: [] as {
        runSpy: ReturnType<typeof vi.fn<(request: unknown) => void>>;
        setState: (state: unknown) => void;
    }[],
    renders: 0,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useToolsWorker',
    async (importOriginal) => {
        const React = await import('react');
        const actual = await importOriginal<typeof UseToolsWorkerModule>();
        return {
            ToolsWorkerPhase: actual.ToolsWorkerPhase,
            useToolsWorker: () => {
                toolsWorkerBox.renders += 1;
                const [state, setState] = React.useState<unknown>({
                    phase: actual.ToolsWorkerPhase.Idle,
                });
                const indexReference = React.useRef<null | number>(null);
                if (indexReference.current === null) {
                    indexReference.current = toolsWorkerBox.instances.length;
                    toolsWorkerBox.instances.push({
                        runSpy: vi.fn<(request: unknown) => void>(),
                        setState,
                    });
                }
                const instance =
                    toolsWorkerBox.instances[indexReference.current];
                return {
                    cancel: vi.fn(),
                    run: (request: unknown) => {
                        instance?.runSpy(request);
                    },
                    state,
                };
            },
        };
    },
);

const { FundedValueCard } =
    await import('~/app/(app)/prop-calculator/_components/value/FundedValueCard');
const { ValueChainCard } =
    await import('~/app/(app)/prop-calculator/_components/value/ValueChainCard');
const { ToolsWorkerPhase: RealToolsWorkerPhase } =
    await import('~/app/(app)/prop-calculator/_components/useToolsWorker');

function fakeCards(): ValueCardsSpec {
    const firm = findFirm(FirmId.Mffu);
    const plan = firm?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return {
        plan: {
            firmId: FirmId.Mffu,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serializePlanId(plan.id),
        },
        spec: {
            enginePolicy: buildEnginePolicy({
                fundedHorizonDays: 90,
                plan,
                rulebook: DEFAULT_RULEBOOK,
            }).policy,
            rulebook: DEFAULT_RULEBOOK,
            run: { maxEvalDays: 40, seed: 17, trials: 30 },
        },
    };
}

function ready(cards: ValueCardsSpec): ValueCardsInput {
    return { cards, kind: ValueCardsInputKind.Ready };
}

function setSampleSizeText(container: HTMLElement, text: string) {
    const input = container.querySelector('input');
    if (input === null) throw new Error('sample size input missing');
    const valueDescriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    );
    act(() => {
        valueDescriptor?.set?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function valueResult(seed: number, trials: number, creditInclusive: number) {
    return {
        creditFree: { standardError: null, value: creditInclusive - 10 },
        creditInclusive: { standardError: 5, value: creditInclusive },
        kind: ValueResultKind.Value,
        seed,
        trials,
    };
}

describe('ValueChainCard (PT-66)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        toolsWorkerBox.instances = [];
        toolsWorkerBox.renders = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('requests the value chain for the given cards on mount', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        expect(instance).toBeDefined();
        expect(instance?.runSpy).toHaveBeenCalledTimes(1);
        const [request] = instance?.runSpy.mock.calls[0] as [
            { kind: ToolsRequestKind },
        ];
        expect(request.kind).toBe(ToolsRequestKind.ValueChain);
    });

    it('shows the four step values once the worker succeeds', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];

        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.FreshFunded,
                                value: valueResult(1, 500, 900),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.FirstPayoutEligible,
                                value: valueResult(1, 500, 1400),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.PostFirstPayout,
                                value: valueResult(1, 500, 950),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        expect(container.textContent).toContain('Eval start');
        expect(container.textContent).toContain('Fresh funded');
        expect(container.textContent).toContain('First payout eligible');
        expect(container.textContent).toContain('Post first payout');
        expect(container.textContent).toContain('$100');
        expect(container.textContent).toContain('$900');
    });

    it('headlines the credit-free value and shows the credit-inclusive value beside it', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.FreshFunded,
                                value: valueResult(1, 500, 900),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.FirstPayoutEligible,
                                value: valueResult(1, 500, 1400),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.PostFirstPayout,
                                value: valueResult(1, 500, 950),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        expect(container.textContent).toContain('$90');
        expect(container.textContent).toContain('$890');
        expect(container.textContent).toContain('+$800 from the previous step');
        expect(container.textContent).toContain('credit-free');
        expect(container.textContent).toContain(
            'with end-of-horizon credit $100',
        );
    });

    it('lists every failed step by its label with the reason in an alert paragraph next to the built steps', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];

        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [
                            {
                                kind: ValueChainStepKind.FirstPayoutEligible,
                                reason: 'no first-payout-eligible account of 50000 dollars passes the payout gates',
                            },
                            {
                                kind: ValueChainStepKind.PostFirstPayout,
                                reason: 'the first-payout-eligible step failed, so there is no account to take the first payout from',
                            },
                        ],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.FreshFunded,
                                value: valueResult(1, 500, 900),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        const alerts = [...container.querySelectorAll('[role="alert"]')].map(
            (alert) => alert.textContent,
        );
        expect(alerts).toEqual([
            'First payout eligible: no first-payout-eligible account of 50000 dollars passes the payout gates',
            'Post first payout: the first-payout-eligible step failed, so there is no account to take the first payout from',
        ]);
        expect(container.textContent).toContain('Eval start');
        expect(container.textContent).toContain('Fresh funded');
    });

    it('shows no failure paragraph when every step built', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows the assumptions of the first-payout-eligible step under its label', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                            {
                                assumptions: [
                                    '1 equal winning session: the plan payout day gate needs 1 session',
                                    'One closed trade per session',
                                ],
                                kind: ValueChainStepKind.FirstPayoutEligible,
                                value: valueResult(1, 500, 1400),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        const list = container.querySelector(
            '[aria-label="First payout eligible assumptions"]',
        );
        expect(list).not.toBeNull();
        expect(
            [...(list?.querySelectorAll('li') ?? [])].map(
                (item) => item.textContent,
            ),
        ).toEqual([
            '1 equal winning session: the plan payout day gate needs 1 session',
            'One closed trade per session',
        ]);
        expect(
            container.querySelector('[aria-label="Eval start assumptions"]'),
        ).toBeNull();
    });

    it('lists the assumptions of every step that carries them, one labelled list per step', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: ['Eval basis line'],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                            {
                                assumptions: ['Post payout line'],
                                kind: ValueChainStepKind.PostFirstPayout,
                                value: valueResult(1, 500, 950),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        expect(
            container.querySelector('[aria-label="Eval start assumptions"]')
                ?.textContent,
        ).toBe('Eval basis line');
        expect(
            container.querySelector(
                '[aria-label="Post first payout assumptions"]',
            )?.textContent,
        ).toBe('Post payout line');
        expect(
            container.querySelector('[aria-label="Fresh funded assumptions"]'),
        ).toBeNull();
    });

    it('names the documented policy and says how a gap is computed', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.ValueChain,
                    result: {
                        accountValue: null,
                        failedSteps: [],
                        steps: [
                            {
                                assumptions: [],
                                kind: ValueChainStepKind.EvalStart,
                                value: valueResult(1, 500, 100),
                            },
                        ],
                    },
                    runId: request.runId,
                },
            });
        });

        expect(container.textContent).toContain('under the documented policy');
        expect(container.textContent).toContain(
            "A gap is the credit-free value minus the previous built step's, with the two standard errors combined in quadrature",
        );
    });

    it('waits for the inputs to settle before requesting the value chain again', () => {
        vi.useFakeTimers();
        try {
            act(() => {
                root.render(<ValueChainCard cards={ready(fakeCards())} />);
            });
            const instance = toolsWorkerBox.instances[0];
            expect(instance?.runSpy).toHaveBeenCalledTimes(1);

            const changed = fakeCards();
            act(() => {
                root.render(
                    <ValueChainCard
                        cards={ready({
                            ...changed,
                            spec: {
                                ...changed.spec,
                                run: { ...changed.spec.run, seed: 18 },
                            },
                        })}
                    />,
                );
            });
            expect(instance?.runSpy).toHaveBeenCalledTimes(1);

            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS);
            });
            expect(instance?.runSpy).toHaveBeenCalledTimes(2);
            const [second] = instance?.runSpy.mock.calls[1] as [
                { spec: { run: { seed: number } } },
            ];
            expect(second.spec.run.seed).toBe(18);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops re-rendering once the inputs have settled', () => {
        vi.useFakeTimers();
        try {
            act(() => {
                root.render(<ValueChainCard cards={ready(fakeCards())} />);
            });
            act(() => {
                toolsWorkerBox.instances[0]?.setState({
                    phase: RealToolsWorkerPhase.Running,
                });
            });
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS * 3);
            });
            const settledRenders = toolsWorkerBox.renders;
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS * 10);
            });
            expect(toolsWorkerBox.renders).toBe(settledRenders);
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows a pending line and marks the section busy while the worker runs', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Running,
            });
        });
        expect(container.textContent).toContain('Computing...');
        expect(
            container.querySelector('section')?.getAttribute('aria-busy'),
        ).toBe('true');
    });

    it('says so when the computation was cancelled', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Cancelled,
            });
        });
        expect(container.textContent).toContain('Computation cancelled.');
        expect(
            container.querySelector('section')?.getAttribute('aria-busy'),
        ).toBe('false');
    });

    it('renders the results inside a polite live region', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it('shows the refusal reason and requests nothing when the calculator inputs are refused', () => {
        act(() => {
            root.render(
                <ValueChainCard
                    cards={{
                        kind: ValueCardsInputKind.Refused,
                        reason: 'payoutRequestOverride: must be more than zero',
                    }}
                />,
            );
        });
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toContain('payoutRequestOverride: must be more than zero');
        expect(toolsWorkerBox.instances[0]?.runSpy).not.toHaveBeenCalled();
    });

    it('requests once the refused inputs become valid', () => {
        act(() => {
            root.render(
                <ValueChainCard
                    cards={{
                        kind: ValueCardsInputKind.Refused,
                        reason: 'bad input',
                    }}
                />,
            );
        });
        vi.useFakeTimers();
        try {
            act(() => {
                root.render(<ValueChainCard cards={ready(fakeCards())} />);
            });
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS);
            });
            expect(toolsWorkerBox.instances[0]?.runSpy).toHaveBeenCalledTimes(
                1,
            );
            expect(container.querySelector('[role="alert"]')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows the engine failure reason instead of the step values when the worker fails', () => {
        act(() => {
            root.render(<ValueChainCard cards={ready(fakeCards())} />);
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];

        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'toolsWorker: no plan for the requested firm and serial',
            });
        });

        expect(container.textContent).toContain(
            'toolsWorker: no plan for the requested firm and serial',
        );
        expect(request.runId).toBeDefined();
    });
});

function succeedFundedValue(
    sampleRange: null | { lower: number; sampleSize: number; upper: number },
) {
    const instance = toolsWorkerBox.instances[0];
    const [request] = instance?.runSpy.mock.calls.at(-1) as [{ runId: number }];
    act(() => {
        instance?.setState({
            phase: RealToolsWorkerPhase.Succeeded,
            result: {
                kind: ToolsResponseKind.FundedValueEstimate,
                result: {
                    meanPayoutsPerAccount: { standardError: 0.04, value: 2.5 },
                    payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
                    probabilityZeroPayouts: { standardError: 0.01, value: 0.1 },
                    sampleRange:
                        sampleRange === null
                            ? null
                            : {
                                  ...sampleRange,
                                  label: 'what your own n accounts could show by chance',
                              },
                    seed: 17,
                    trials: 30,
                },
                runId: request.runId,
            },
        });
    });
}

describe('FundedValueCard (PT-66)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        toolsWorkerBox.instances = [];
        toolsWorkerBox.renders = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('requests the estimate with the rulebook threshold as the sample size', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        const [request] = toolsWorkerBox.instances[0]?.runSpy.mock.calls[0] as [
            { kind: ToolsRequestKind; sampleSize: null | number },
        ];
        expect(request.kind).toBe(ToolsRequestKind.FundedValueEstimate);
        expect(request.sampleSize).toBe(10);
    });

    it('requests with no sample size and shows no range until one is set', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={null}
                />,
            );
        });
        const [request] = toolsWorkerBox.instances[0]?.runSpy.mock.calls[0] as [
            { sampleSize: null | number },
        ];
        expect(request.sampleSize).toBeNull();
        succeedFundedValue(null);
        expect(container.textContent).toContain('2.50 ± 0.04');
        expect(container.textContent).toContain('10.0%');
        expect(container.textContent).toContain('enter a sample size');
        expect(container.textContent).not.toContain(' to ');
    });

    it('shows the sample range with its chance label once a sample size exists', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        succeedFundedValue({ lower: 1.5, sampleSize: 10, upper: 3.5 });
        expect(container.textContent).toContain('1.50 to 3.50');
        expect(container.textContent).toContain(
            'what your own n accounts could show by chance',
        );
    });

    it('requests again with the entered sample size only after typing settles', () => {
        vi.useFakeTimers();
        try {
            act(() => {
                root.render(
                    <FundedValueCard
                        cards={ready(fakeCards())}
                        rulebookSampleThreshold={10}
                    />,
                );
            });
            const instance = toolsWorkerBox.instances[0];
            expect(instance?.runSpy).toHaveBeenCalledTimes(1);

            const input = container.querySelector('input');
            if (input === null) throw new Error('sample size input missing');
            const valueDescriptor = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value',
            );
            act(() => {
                valueDescriptor?.set?.call(input, '25');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            expect(instance?.runSpy).toHaveBeenCalledTimes(1);

            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS);
            });
            expect(instance?.runSpy).toHaveBeenCalledTimes(2);
            const [second] = instance?.runSpy.mock.calls[1] as [
                { sampleSize: null | number },
            ];
            expect(second.sampleSize).toBe(25);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops re-rendering once the inputs have settled', () => {
        vi.useFakeTimers();
        try {
            act(() => {
                root.render(
                    <FundedValueCard
                        cards={ready(fakeCards())}
                        rulebookSampleThreshold={10}
                    />,
                );
            });
            act(() => {
                toolsWorkerBox.instances[0]?.setState({
                    phase: RealToolsWorkerPhase.Running,
                });
            });
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS * 3);
            });
            const settledRenders = toolsWorkerBox.renders;
            act(() => {
                vi.advanceTimersByTime(DEBOUNCE_MS * 10);
            });
            expect(toolsWorkerBox.renders).toBe(settledRenders);
            expect(toolsWorkerBox.instances[0]?.runSpy).toHaveBeenCalledTimes(
                1,
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows a pending line and marks the section busy while the worker runs', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Running,
            });
        });
        expect(container.textContent).toContain('Computing...');
        expect(
            container.querySelector('section')?.getAttribute('aria-busy'),
        ).toBe('true');
    });

    it('says so when the computation was cancelled', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Cancelled,
            });
        });
        expect(container.textContent).toContain('Computation cancelled.');
    });

    it('names the sample size the range was computed for', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        succeedFundedValue({ lower: 1.5, sampleSize: 10, upper: 3.5 });
        expect(container.textContent).toContain('n = 10');
    });

    it.each(['0', '1.5', '-1'])(
        'flags %s as an invalid sample size, requests nothing for it and hides the results',
        (text) => {
            vi.useFakeTimers();
            try {
                act(() => {
                    root.render(
                        <FundedValueCard
                            cards={ready(fakeCards())}
                            rulebookSampleThreshold={10}
                        />,
                    );
                });
                succeedFundedValue({ lower: 1.5, sampleSize: 10, upper: 3.5 });
                const instance = toolsWorkerBox.instances[0];
                expect(instance?.runSpy).toHaveBeenCalledTimes(1);

                setSampleSizeText(container, text);
                act(() => {
                    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
                });

                const input = container.querySelector('input');
                expect(input?.getAttribute('aria-invalid')).toBe('true');
                const describedBy =
                    input?.getAttribute('aria-describedby') ?? '';
                expect(describedBy).not.toBe('');
                expect(
                    container.querySelector(`#${describedBy}`)?.textContent,
                ).toContain('whole number');
                expect(instance?.runSpy).toHaveBeenCalledTimes(1);
                expect(container.textContent).not.toContain('1.50 to 3.50');
            } finally {
                vi.useRealTimers();
            }
        },
    );

    it('does not flag an empty field and keeps using the rulebook threshold', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        const input = container.querySelector('input');
        expect(input?.getAttribute('aria-invalid')).toBe('false');
        expect(container.querySelector('[id$="sample-size-error"]')).toBeNull();
    });

    it('does not repeat the refusal the value chain card shows, and requests nothing (PT-67 addendum)', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={{
                        kind: ValueCardsInputKind.Refused,
                        reason: 'bad payout request',
                    }}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.textContent).not.toContain('bad payout request');
        expect(toolsWorkerBox.instances[0]?.runSpy).not.toHaveBeenCalled();
    });

    it('disables its sample size input and says it was not computed while the inputs are refused, pointing at the value chain card (PT-67 review)', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={{
                        kind: ValueCardsInputKind.Refused,
                        reason: 'bad payout request',
                    }}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        expect(container.querySelector('input')?.disabled).toBe(true);
        expect(container.textContent).toContain(
            'Not computed while the value inputs are refused; the reason is shown in the value chain card.',
        );
        expect(container.textContent).not.toContain('bad payout request');
    });

    it('keeps its sample size input enabled when the inputs are ready (PT-67 review)', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={10}
                />,
            );
        });
        expect(container.querySelector('input')?.disabled).toBe(false);
        expect(container.textContent).not.toContain('Not computed while');
    });

    it('shows the refusal text once when both value cards are refused (PT-67 addendum)', () => {
        const refused: ValueCardsInput = {
            kind: ValueCardsInputKind.Refused,
            reason: 'Payout request size ($): must be more than zero',
        };
        act(() => {
            root.render(
                <>
                    <ValueChainCard cards={refused} />
                    <FundedValueCard
                        cards={refused}
                        rulebookSampleThreshold={10}
                    />
                </>,
            );
        });
        const occurrences = container.textContent.split(
            'Payout request size ($): must be more than zero',
        );
        expect(occurrences).toHaveLength(2);
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    it('shows the engine failure reason', () => {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={null}
                />,
            );
        });
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'no plan resolved',
            });
        });
        expect(container.textContent).toContain('no plan resolved');
    });
});
