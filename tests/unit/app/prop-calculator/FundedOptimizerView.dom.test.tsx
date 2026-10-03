import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FundedSweepResult } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import type * as PropCalculatorModule from '~/lib/prop-calculator';

import {
    CalculatorActionType,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { RUIN_FIRST_RISK_TABLE_NOTE } from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { SizingObjective } from '~/lib/prop-calculator/advisor';

const box = vi.hoisted(() => ({
    accountPolicy: null as null | PropCalculatorModule.FirmAccountPolicy,
}));

vi.mock('~/lib/prop-calculator', async (importOriginal) => {
    const actual = await importOriginal<typeof PropCalculatorModule>();
    return {
        ...actual,
        findFirm: (id: unknown) => {
            const firm = actual.findFirm(id as never);
            return firm === undefined ||
                id !== actual.FirmId.TopStep ||
                box.accountPolicy === null
                ? firm
                : (Object.assign(
                      Object.create(Object.getPrototypeOf(firm) as object),
                      firm,
                      { accountPolicy: box.accountPolicy },
                  ) as PropCalculatorModule.TradingFirm);
        },
    };
});

const sessionMock = vi.fn(() => ({
    data: null as null | { user: { id: string } },
    error: null,
    isPending: false,
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => sessionMock(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: renderNothing,
}));

const currentState = vi.hoisted(() => ({
    state: null as CalculatorState | null,
}));

const dispatched = vi.hoisted(() => ({
    actions: [] as unknown[],
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    ObjectiveQueryFailure: {
        BankrollSummary: 'bankroll-summary',
        Rulebook: 'rulebook',
    },
    useCalculatorActions: () => ({
        dispatch: (action: unknown) => {
            dispatched.actions.push(action);
        },
    }),
    useCalculatorInputs: () => ({ state: currentState.state }),
    useObjectiveChoice: () => ({ automaticBasis: null, queryFailure: null }),
}));

const sweepBox = vi.hoisted(() => ({
    result: null as FundedSweepResult | null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep',
    () => ({
        useFundedSweep: () =>
            sweepBox.result === null
                ? {
                      phase: WorkerTaskPhase.Running,
                      progress: null,
                      reason: null,
                      result: null,
                  }
                : {
                      phase: WorkerTaskPhase.Done,
                      progress: null,
                      reason: null,
                      result: sweepBox.result,
                  },
    }),
);

function renderNothing(): null {
    return null;
}

const {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    LifetimePayoutCapOverrideKind,
    serializePlanId,
} = await import('~/lib/prop-calculator');
const { FundedCandidateBuildKind } =
    await import('~/lib/prop-calculator/optimize');
const { simulate } = await import('~/lib/prop-calculator/simulator');
const { TopStepVariant } = await import('~/lib/prop-calculator/core');
const { FundedOptimizerView } =
    await import('~/app/(app)/prop-calculator/(tools)/funded-optimizer/FundedOptimizerView');

class VerifiedNoCountTriggerPolicy extends FirmAccountPolicy {
    override lifetimePayoutCapOverride() {
        return { kind: LifetimePayoutCapOverrideKind.NoCountTrigger } as const;
    }
}

function requirePlan(
    value: null | PropCalculatorModule.Plan | undefined,
    message: string,
): PropCalculatorModule.Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

function stateWith(patch: Partial<CalculatorState>): CalculatorState {
    return { ...defaultCalculatorState(), ...patch };
}

function topStepPlan(): PropCalculatorModule.Plan {
    return requirePlan(
        findFirm(FirmId.TopStep)?.findPlanBySerial(
            serializePlanId({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        ),
        'expected the TopStep 50K Standard/Standard plan to resolve',
    );
}

describe('FundedOptimizerView names the lifetime payout cap basis (PT-25c)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sessionMock.mockReturnValue({
            data: null,
            error: null,
            isPending: false,
        });
        box.accountPolicy = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        currentState.state = null;
        box.accountPolicy = null;
        vi.unstubAllGlobals();
    });

    it('says the lifetime payout cap basis is not yet checked for a firm with no verified trigger', () => {
        currentState.state = stateWith({ plan: topStepPlan() });
        act(() => {
            root.render(<FundedOptimizerView />);
        });
        expect(container.textContent).toContain(
            'lifetime payout cap: not yet checked',
        );
    });

    it('says the lifetime payout cap basis is a verified no-count trigger when the firm carries one', () => {
        box.accountPolicy = new VerifiedNoCountTriggerPolicy();
        currentState.state = stateWith({ plan: topStepPlan() });
        act(() => {
            root.render(<FundedOptimizerView />);
        });
        expect(container.textContent).toContain(
            'lifetime payout cap: a verified no-count trigger',
        );
    });
});

describe('FundedOptimizerView follows and names the shared objective (PT-83, F-V15)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const swept = stateWith({ plan: topStepPlan(), trials: 20 });
    const sweptOutputs = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 20,
        plan: topStepPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.5,
    });
    const sweep: FundedSweepResult = {
        kind: FundedCandidateBuildKind.Built,
        notes: [],
        rows: [
            ['high-monthly', 300, 100],
            ['high-cycle', 100, 300],
            ['middle', 200, 200],
        ].map(([label, monthly, cycle]) => ({
            candidate: { label: String(label), overrides: {} },
            out: {
                ...sweptOutputs,
                expectedMonthlyNet: Number(monthly),
                expectedNet: Number(cycle),
            },
        })),
    };
    const monthlyOrder = ['high-monthly', 'middle', 'high-cycle'];
    const cycleOrder = ['high-cycle', 'middle', 'high-monthly'];

    function renderView(objective: SizingObjective): void {
        currentState.state = { ...swept, objective };
        act(() => {
            root.render(<FundedOptimizerView />);
        });
    }

    function shownLabels(): string[] {
        return [...container.querySelectorAll(':scope tbody tr')].map(
            (row) => row.querySelector(':scope td')?.textContent ?? '',
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        sessionMock.mockReturnValue({
            data: null,
            error: null,
            isPending: false,
        });
        sweepBox.result = sweep;
        dispatched.actions = [];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        currentState.state = null;
        sweepBox.result = null;
        vi.unstubAllGlobals();
    });

    it('sorts by monthly net and names it under MonthlyNet', () => {
        renderView(SizingObjective.MonthlyNet);
        expect(container.querySelector('h2')?.textContent).toBe(
            'Funded optimizer, ranked by monthly net',
        );
        expect(shownLabels()).toStrictEqual(monthlyOrder);
    });

    it('sorts by cycle net and names it under CycleCash', () => {
        renderView(SizingObjective.CycleCash);
        expect(container.querySelector('h2')?.textContent).toBe(
            'Funded optimizer, ranked by cycle cash',
        );
        expect(shownLabels()).toStrictEqual(cycleOrder);
    });

    it('keeps monthly net under RuinFirst and shows the typed not-applicable note', () => {
        renderView(SizingObjective.RuinFirst);
        expect(container.querySelector('h2')?.textContent).toBe(
            'Funded optimizer, ranked by monthly net',
        );
        expect(shownLabels()).toStrictEqual(monthlyOrder);
        expect(container.textContent).toContain(RUIN_FIRST_RISK_TABLE_NOTE);
    });

    it('mounts the shared objective chip in place of the old Monthly or Cycle toggle', () => {
        renderView(SizingObjective.MonthlyNet);
        const chip = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Ranking objective"]',
        );
        if (chip === null) throw new Error('objective chip missing');
        expect(chip.value).toBe(SizingObjective.MonthlyNet);
        expect(container.textContent).not.toContain('This run only');
        expect(container.textContent).not.toContain('Steady state');
        act(() => {
            Reflect.set(
                HTMLSelectElement.prototype,
                'value',
                SizingObjective.CycleCash,
                chip,
            );
            chip.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(dispatched.actions).toStrictEqual([
            {
                objective: SizingObjective.CycleCash,
                type: CalculatorActionType.SetObjective,
            },
        ]);
    });
});
