import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerTaskEventKind } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type CopyGroupWorkerOutcome,
    CopyGroupWorkerOutcomeKind,
    type CopyGroupWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import { CopyGroupSimulationCard } from '~/app/(app)/prop-calculator/accounts/copy-groups/CopyGroupSimulationCard';
import {
    type CopyGroupSimulationPlan,
    CopyGroupSimulationPlanKind,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSimulationModel';
import { dollars, TradingPhase } from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionKindText,
    assumptionText,
    inputAssumption,
    SizingAssumption,
    sizingRuleAssumption,
} from '~/lib/prop-calculator/advisor';
import {
    type CopyGroupSimulationOutputs,
    CopyGroupSimulationRejectionKind,
} from '~/lib/prop-calculator/simulator';

class FakeWorker {
    static instances: FakeWorker[] = [];
    listeners = new Map<string, ((event: MessageEvent<unknown>) => void)[]>();
    posted: unknown[] = [];
    terminated = false;

    constructor() {
        FakeWorker.instances.push(this);
    }

    addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
    ): void {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
    }

    emit(type: string, data: unknown): void {
        const listeners = this.listeners.get(type) ?? [];
        for (const listener of listeners) {
            listener({ data } as MessageEvent<unknown>);
        }
    }

    postMessage(message: unknown): void {
        this.posted.push(message);
    }

    terminate(): void {
        this.terminated = true;
    }
}

const REQUEST: CopyGroupWorkerRequest = {
    members: [],
    seed: 42,
    trials: 5000,
};

const READY: CopyGroupSimulationPlan = {
    assumptions: [
        inputAssumption(
            AssumptionKind.PositionSizingUnspecified,
            AssumptionBias.Neutral,
        ),
        inputAssumption(
            AssumptionKind.LiveTriggersNotChecked,
            AssumptionBias.Optimistic,
        ),
        sizingRuleAssumption(
            SizingAssumption.NoCommission,
            AssumptionBias.Optimistic,
        ),
    ],
    groupRisk: dollars(320),
    horizonDays: 30,
    kind: CopyGroupSimulationPlanKind.Ready,
    leftOutLabels: [],
    members: [
        { id: 'a', label: 'Apex main' },
        { id: 'b', label: 'MFF second' },
    ],
    request: REQUEST,
};

const OUTPUTS: CopyGroupSimulationOutputs = {
    expectedDaysToFirstBustGivenBust: { standardError: 0.4, value: 9.5 },
    expectedGroupHorizonCredit: { standardError: 21.4, value: 1234 },
    expectedGroupResetFees: { standardError: 0, value: 0 },
    expectedRealizedGroupPayout: { standardError: 88.2, value: 4567 },
    memberIds: ['a', 'b'],
    memberOutcomes: [],
    pAllBustSameDay: { standardError: 0.0058, value: 0.121 },
    pAnyBust: { standardError: 0.0071, value: 0.2347 },
    trials: 5000,
};

function click(target: HTMLButtonElement) {
    act(() => {
        target.click();
    });
}

function finish(outcome: CopyGroupWorkerOutcome, runId = 1) {
    act(() => {
        FakeWorker.instances.at(-1)?.emit('message', {
            kind: WorkerTaskEventKind.Done,
            result: outcome,
            runId,
        });
    });
}

function simulated(
    overrides: Partial<CopyGroupSimulationOutputs> = {},
): CopyGroupWorkerOutcome {
    return {
        kind: CopyGroupWorkerOutcomeKind.Simulated,
        result: { ...OUTPUTS, ...overrides },
    };
}

describe('CopyGroupSimulationCard', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(plan: CopyGroupSimulationPlan) {
        act(() => {
            root.render(<CopyGroupSimulationCard plan={plan} />);
        });
    }

    function runButton(): HTMLButtonElement {
        const found = [...container.querySelectorAll('button')].find(
            (candidate) => /simulat|run/i.test(candidate.textContent),
        );
        if (found === undefined) throw new Error('no run button');
        return found;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        FakeWorker.instances = [];
        vi.stubGlobal('Worker', FakeWorker);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('says why a group is not simulated and offers no run', () => {
        render({
            kind: CopyGroupSimulationPlanKind.Unavailable,
            reason: 'A copy group cannot be sized while a member has no cushion room left.',
        });
        expect(container.textContent).toContain(
            'A copy group cannot be sized while a member has no cushion room left.',
        );
        expect(container.querySelector('button')).toBeNull();
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('starts no worker until the trader runs it, then posts the plan request', () => {
        render(READY);
        expect(FakeWorker.instances).toHaveLength(0);
        expect(container.textContent).toContain('$320');
        expect(container.textContent).toContain('30-day');
        expect(container.textContent).toContain('5,000');

        click(runButton());
        expect(FakeWorker.instances).toHaveLength(1);
        expect(FakeWorker.instances[0]?.posted).toEqual([
            { request: REQUEST, runId: 1 },
        ]);
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(runButton().getAttribute('aria-disabled')).toBe('true');
    });

    it('keeps the run button focusable while running and starts no second run from it', () => {
        render(READY);
        click(runButton());
        const button = runButton();
        expect(button.disabled).toBe(false);
        button.focus();
        click(button);
        expect(document.activeElement).toBe(button);
        expect(FakeWorker.instances).toHaveLength(1);
        expect(FakeWorker.instances[0]?.posted).toHaveLength(1);
    });

    it('announces the finished figures through a polite live region that was already mounted', () => {
        render(READY);
        const region = container.querySelector('[role="status"]');
        expect(region).not.toBeNull();
        expect(region?.textContent).not.toContain('At least one account busts');
        click(runButton());
        finish(simulated());
        expect(container.querySelector('[role="status"]')).toBe(region);
        expect(region?.textContent).toContain('At least one account busts');
        expect(region?.textContent).toContain('23.5% (± 0.7%)');
    });

    it('shows every figure with its standard error and a label saying what it is', () => {
        render(READY);
        click(runButton());
        finish(simulated());
        const text = container.textContent;

        expect(text).toContain('At least one account busts');
        expect(text).toContain('23.5% (± 0.7%)');
        expect(text).toContain('Every account busts on the same day');
        expect(text).toContain('12.1% (± 0.6%)');
        expect(text).toContain('Payouts the group receives');
        expect(text).toContain('$4,567 (± $88)');
        expect(text).toContain('End-of-horizon credit');
        expect(text).toContain('$1,234 (± $21)');
        expect(text).toContain('not cash');
        expect(text).toContain('Days until the first bust');
        expect(text).toContain('9.5 d (± 0.4 d)');
        expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('says no account busted when the group never busts instead of showing a number', () => {
        render(READY);
        click(runButton());
        finish(
            simulated({
                expectedDaysToFirstBustGivenBust: null,
                pAllBustSameDay: { standardError: 0, value: 0 },
                pAnyBust: { standardError: 0, value: 0 },
            }),
        );
        expect(container.textContent).toContain(
            'No account busted in any trial',
        );
    });

    it('omits the standard error it does not have rather than printing zero', () => {
        render(READY);
        click(runButton());
        finish(
            simulated({
                expectedDaysToFirstBustGivenBust: {
                    standardError: null,
                    value: 9.5,
                },
            }),
        );
        expect(container.textContent).toContain('9.5 d');
        expect(container.textContent).not.toContain('9.5 d (±');
    });

    it('states the sizing and the shared trades it assumed', () => {
        render({
            ...READY,
            leftOutLabels: ['Live second'],
        });
        click(runButton());
        finish(simulated());
        const text = container.textContent;
        expect(text).toContain('same trades');
        expect(text).toContain('Live second');
        expect(text).toMatch(/left out/i);
    });

    it('lists every assumption the plan carries, optimistic ones included, and only those', () => {
        render(READY);
        const text = container.textContent;
        expect(text).toContain(
            assumptionKindText(AssumptionKind.PositionSizingUnspecified),
        );
        expect(text).toContain(
            assumptionKindText(AssumptionKind.LiveTriggersNotChecked),
        );
        expect(text).toContain(
            assumptionText(
                sizingRuleAssumption(
                    SizingAssumption.NoCommission,
                    AssumptionBias.Optimistic,
                ),
            ),
        );
        expect(text).not.toContain(
            assumptionKindText(AssumptionKind.RebuyLagAssumed),
        );
    });

    it('keeps the assumptions on the card beside the figures once they arrive', () => {
        render(READY);
        click(runButton());
        finish(simulated());
        expect(container.textContent).toContain(
            assumptionKindText(AssumptionKind.LiveTriggersNotChecked),
        );
    });

    it('lists no assumption block when the plan carries none', () => {
        render({ ...READY, assumptions: [] });
        expect(container.textContent).not.toContain(
            assumptionKindText(AssumptionKind.PositionSizingUnspecified),
        );
        expect(container.textContent).not.toMatch(/assum/i);
    });

    describe('typed rejections from the worker', () => {
        it('shows the mixed-stage rejection with its message', () => {
            render(READY);
            click(runButton());
            finish({
                kind: CopyGroupWorkerOutcomeKind.Rejected,
                rejection: {
                    kind: CopyGroupSimulationRejectionKind.MixedStage,
                    message:
                        'Every member of a simulated copy group must be in one stage before it can be simulated; group simulation needs one stage.',
                    stages: [TradingPhase.Eval, TradingPhase.Funded],
                },
            });
            expect(container.textContent).toContain(
                'Every member of a simulated copy group must be in one stage',
            );
            expect(container.textContent).not.toContain(
                'At least one account busts',
            );
        });

        it('names the refused member by its label', () => {
            render(READY);
            click(runButton());
            finish({
                kind: CopyGroupWorkerOutcomeKind.Rejected,
                rejection: {
                    kind: CopyGroupSimulationRejectionKind.MemberRefused,
                    memberId: 'b',
                    message: 'riskPerTrade $300 is below one ES contract',
                },
            });
            expect(container.textContent).toContain('MFF second');
            expect(container.textContent).toContain(
                'riskPerTrade $300 is below one ES contract',
            );
        });

        it('shows the eval-group rejection', () => {
            render(READY);
            click(runButton());
            finish({
                kind: CopyGroupWorkerOutcomeKind.Rejected,
                rejection: {
                    kind: CopyGroupSimulationRejectionKind.EvalGroupsNotSupported,
                    message:
                        'Copy-group simulation covers funded-stage groups only; eval-stage copy groups are not modeled yet.',
                },
            });
            expect(container.textContent).toContain('funded-stage groups only');
        });
    });

    describe('loading and failure', () => {
        it('shows a failed outcome with its reason and runs again on request', () => {
            render(READY);
            click(runButton());
            finish({
                kind: CopyGroupWorkerOutcomeKind.Failed,
                reason: 'Plan "x" not found for firm "mffu".',
            });
            expect(container.textContent).toContain(
                'Plan "x" not found for firm "mffu".',
            );
            click(runButton());
            expect(FakeWorker.instances).toHaveLength(2);
        });

        it('shows a worker crash as a failure, never a number', () => {
            render(READY);
            click(runButton());
            act(() => {
                FakeWorker.instances[0]?.emit('message', {
                    kind: WorkerTaskEventKind.Failed,
                    reason: 'The background worker failed.',
                    runId: 1,
                });
            });
            expect(container.textContent).toContain(
                'The background worker failed.',
            );
            expect(container.textContent).not.toContain(
                'At least one account busts',
            );
        });

        it('drops the figures once the group changes after a run, until it is run again', () => {
            render(READY);
            click(runButton());
            finish(simulated());
            expect(container.textContent).toContain('23.5%');

            render({ ...READY, request: { ...REQUEST, seed: 43 } });
            expect(container.textContent).not.toContain('23.5%');
            expect(container.textContent).toMatch(/changed since/i);

            click(runButton());
            expect(FakeWorker.instances).toHaveLength(2);
            finish(
                simulated({ pAnyBust: { standardError: 0.01, value: 0.4 } }),
                2,
            );
            expect(container.textContent).toContain('40.0% (± 1.0%)');
        });
    });
});
