import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import {
    type ValueCardsInput,
    ValueCardsInputKind,
    type ValueCardsSpec,
} from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    buildEnginePolicy,
    type CumulativePayoutTriggerAssumption,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor';
import {
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { MffuVariant } from '~/lib/prop-calculator/core';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

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

const LIVE_TRANSFER: LiveTransferHazardAssumption = {
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: AssumptionKind.LiveTransferHazard,
    notes: ['A plan note.'],
    sentLiveShare: 0.41,
};

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

const FUNDED_TRIGGER_LIST =
    'ul[aria-label="Cumulative payout trigger behind the Fresh funded value"]';
const EVAL_TRIGGER_LIST =
    'ul[aria-label="Cumulative payout trigger behind the Eval start value"]';

const FUNDED_STEP_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the Fresh funded value"]';
const POST_PAYOUT_STEP_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the Post first payout value"]';
const EVAL_STEP_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the Eval start value"]';

function chainSteps(
    hazardSteps: readonly ValueChainStepKind[],
    triggerSteps: readonly ValueChainStepKind[] = [],
) {
    const kinds = [
        ValueChainStepKind.EvalStart,
        ValueChainStepKind.FreshFunded,
        ValueChainStepKind.FirstPayoutEligible,
        ValueChainStepKind.PostFirstPayout,
    ];
    return kinds.map((kind, index) => ({
        assumptions: [],
        kind,
        value: valueResult(
            100 * (index + 1),
            hazardSteps.includes(kind) ? LIVE_TRANSFER : undefined,
            triggerSteps.includes(kind) ? PRICED_TRIGGER : undefined,
        ),
    }));
}

function valueResult(
    creditInclusive: number,
    liveTransfer?: LiveTransferHazardAssumption,
    cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption,
) {
    return {
        creditFree: { standardError: null, value: creditInclusive - 10 },
        creditInclusive: { standardError: 5, value: creditInclusive },
        ...(cumulativePayoutTrigger !== undefined && {
            cumulativePayoutTrigger,
        }),
        kind: ValueResultKind.Value,
        ...(liveTransfer !== undefined && { liveTransfer }),
        seed: 1,
        trials: 500,
    };
}

describe('ValueChainCard prints the live-transfer hazard behind each step (PT-73g step 4)', () => {
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

    function succeedWith(
        hazardSteps: readonly ValueChainStepKind[],
        triggerSteps: readonly ValueChainStepKind[] = [],
    ) {
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
                        steps: chainSteps(hazardSteps, triggerSteps),
                    },
                    runId: request.runId,
                },
            });
        });
    }

    it('prints the hazard, the share sent live and the continuation notes under each step that priced a hazard', () => {
        succeedWith([
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.PostFirstPayout,
        ]);

        for (const selector of [FUNDED_STEP_LIST, POST_PAYOUT_STEP_LIST]) {
            const list = container.querySelector(selector);
            expect(list).not.toBeNull();
            const text = list?.textContent ?? '';
            expect(text).toContain(
                'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
            );
            expect(text).toContain('41.0% of runs are sent live');
            expect(text).toContain('A plan note.');
        }
    });

    it('prints no line under a step that priced no hazard', () => {
        succeedWith([ValueChainStepKind.FreshFunded]);

        expect(container.querySelector(FUNDED_STEP_LIST)).not.toBeNull();
        expect(container.querySelector(EVAL_STEP_LIST)).toBeNull();
        expect(container.querySelector(POST_PAYOUT_STEP_LIST)).toBeNull();
    });

    it('prints no live-transfer line when no step priced a hazard', () => {
        succeedWith([]);

        expect(container.textContent).toContain('Fresh funded');
        expect(container.textContent).not.toContain('Live transfer');
    });

    it('prints the priced cumulative trigger under each step that priced one, with no hazard entered', () => {
        succeedWith([], [ValueChainStepKind.FreshFunded]);

        const list = container.querySelector(FUNDED_TRIGGER_LIST);
        expect(list).not.toBeNull();
        expect(list?.textContent).toContain(assumptionText(PRICED_TRIGGER));
        expect(container.querySelector(EVAL_TRIGGER_LIST)).toBeNull();
        expect(container.querySelector(FUNDED_STEP_LIST)).toBeNull();
    });

    it('prints no trigger line when no step priced a trigger', () => {
        succeedWith([ValueChainStepKind.FreshFunded]);

        expect(container.querySelector(FUNDED_TRIGGER_LIST)).toBeNull();
    });
});
