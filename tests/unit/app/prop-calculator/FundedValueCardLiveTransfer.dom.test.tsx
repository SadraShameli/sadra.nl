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

const { FundedValueCard } =
    await import('~/app/(app)/prop-calculator/_components/value/FundedValueCard');
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

const NOTE_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the funded value"]';

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

const TRIGGER_LIST =
    'ul[aria-label="Cumulative payout trigger behind the funded value"]';

function fundedValueResult(
    liveTransfer?: LiveTransferHazardAssumption,
    cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption,
) {
    return {
        ...(cumulativePayoutTrigger !== undefined && {
            cumulativePayoutTrigger,
        }),
        ...(liveTransfer !== undefined && { liveTransfer }),
        meanPayoutsPerAccount: { standardError: 0.2, value: 2.1 },
        payoutCountDistribution: [0.1, 0.4, 0.3, 0.2],
        probabilityZeroPayouts: { standardError: 0.02, value: 0.1 },
        sampleRange: null,
        seed: 1,
        trials: 500,
    };
}

describe('FundedValueCard live-transfer hazard lines (PT-73f)', () => {
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
        liveTransfer?: LiveTransferHazardAssumption,
        cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption,
    ) {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={null}
                />,
            );
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.FundedValueEstimate,
                    result: fundedValueResult(
                        liveTransfer,
                        cumulativePayoutTrigger,
                    ),
                    runId: request.runId,
                },
            });
        });
    }

    it('prints the hazard, the share sent live and the continuation notes when the estimate priced a hazard', () => {
        succeedWith(LIVE_TRANSFER);

        const list = container.querySelector(NOTE_LIST);
        expect(list).not.toBeNull();
        const text = list?.textContent ?? '';
        expect(text).toContain(
            'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
        );
        expect(text).toContain('41.0% of runs are sent live');
        expect(text).toContain('A plan note.');
    });

    it('prints no live-transfer line when the estimate priced no hazard', () => {
        succeedWith();

        expect(container.textContent).toContain(
            'Mean payouts per funded account',
        );
        expect(container.querySelector(NOTE_LIST)).toBeNull();
        expect(container.textContent).not.toContain('Live transfer');
    });

    it('prints the priced cumulative trigger line when the estimate priced one, with no hazard entered', () => {
        succeedWith(undefined, PRICED_TRIGGER);

        const list = container.querySelector(TRIGGER_LIST);
        expect(list).not.toBeNull();
        expect(list?.textContent).toContain(assumptionText(PRICED_TRIGGER));
        expect(container.querySelector(NOTE_LIST)).toBeNull();
    });

    it('prints no trigger line when the estimate priced none', () => {
        succeedWith(LIVE_TRANSFER);

        expect(container.querySelector(TRIGGER_LIST)).toBeNull();
    });
});

describe('FundedValueCard speaks dollars (F-V17, PT-82)', () => {
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
        result: object,
        rulebookSampleThreshold: null | number,
    ) {
        act(() => {
            root.render(
                <FundedValueCard
                    cards={ready(fakeCards())}
                    rulebookSampleThreshold={rulebookSampleThreshold}
                />,
            );
        });
        const instance = toolsWorkerBox.instances[0];
        const [request] = instance?.runSpy.mock.calls[0] as [{ runId: number }];
        act(() => {
            instance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.FundedValueEstimate,
                    result,
                    runId: request.runId,
                },
            });
        });
    }

    it('leads with the funded value in dollars and shows the dollar range n accounts could show under the existing label', () => {
        succeedWith(
            {
                ...fundedValueResult(),
                dollarSampleRange: {
                    label: 'what your own n accounts could show by chance',
                    lower: 2100,
                    sampleSize: 10,
                    upper: 6900,
                },
                fundedValue: { standardError: 300, value: 4500 },
            },
            10,
        );

        const text = container.textContent;
        expect(text).toContain('$4,500 ± $300');
        expect(text).toContain('$2,100 to $6,900');
        expect(text).toContain(
            'what your own n accounts could show by chance, n = 10',
        );
        expect(text.indexOf('$4,500 ± $300')).toBeLessThan(
            text.indexOf('Mean payouts per funded account'),
        );
        expect(text).toContain('Mean payouts per funded account');
    });

    it('shows no dollar cards for a result without a funded value, keeping the payout counts', () => {
        succeedWith(fundedValueResult(), null);

        const text = container.textContent;
        expect(text).not.toContain('Expected payout per funded account');
        expect(text).toContain('Mean payouts per funded account');
    });

    it('asks for a sample size under the dollar range until one exists', () => {
        succeedWith(
            {
                ...fundedValueResult(),
                dollarSampleRange: null,
                fundedValue: { standardError: 300, value: 4500 },
            },
            null,
        );

        const text = container.textContent;
        expect(text).toContain('$4,500 ± $300');
        expect(text).toContain('enter a sample size');
    });

    it('says why there is no dollar range when n is set but the run gave no standard error', () => {
        succeedWith(
            {
                ...fundedValueResult(),
                dollarSampleRange: null,
                fundedValue: { standardError: null, value: 4500 },
            },
            10,
        );

        const text = container.textContent;
        expect(text).toContain('$4,500');
        expect(text).toContain('too few funded trials for a standard error');
    });
});
