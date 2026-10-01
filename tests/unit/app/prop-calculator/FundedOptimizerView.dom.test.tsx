import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PropCalculatorModule from '~/lib/prop-calculator';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';

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
                box.accountPolicy === null ? firm : (Object.assign(
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

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ state: currentState.state }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep',
    () => ({
        useFundedSweep: () => ({
            phase: WorkerTaskPhase.Running,
            progress: null,
            reason: null,
            result: null,
        }),
    }),
);

function renderNothing(): null {
    return null;
}

const { findFirm, FirmAccountPolicy, FirmId, LifetimePayoutCapOverrideKind, serializePlanId } =
    await import('~/lib/prop-calculator');
const { TopStepVariant } = await import('~/lib/prop-calculator/core');
const { FundedOptimizerView } = await import(
    '~/app/(app)/prop-calculator/(tools)/funded-optimizer/FundedOptimizerView'
);

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
        sessionMock.mockReturnValue({ data: null, error: null, isPending: false });
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
