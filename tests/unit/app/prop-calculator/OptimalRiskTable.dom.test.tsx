import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import OptimalRiskTable from '~/app/(app)/prop-calculator/_components/OptimalRiskTable';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { type DayPolicy, DayStopRuleKind } from '~/lib/prop-calculator';

interface TableHarness {
    setEvalDayPolicy: Mock<(policy: DayPolicy | null) => void>;
    state: CalculatorState | null;
}

const harness = vi.hoisted(
    (): TableHarness => ({
        setEvalDayPolicy: vi.fn(),
        state: null,
    }),
);

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        setEvalDayPolicy: harness.setEvalDayPolicy,
    }),
    useCalculatorInputs: () => ({ state: harness.state }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({
        useDebouncedComputation: () => ({ pending: false, result: [] }),
    }),
);

const NOT_USED_LEAD =
    'Eval ladder applied from the ladder lab, but these results do not use it:';

const LADDER: DayPolicy = {
    ladder: [250, 500],
    maxLossesPerDay: 2,
    stopRule: { kind: DayStopRuleKind.FirstWin },
};

function stateWith(evalDayPolicy: DayPolicy | null): CalculatorState {
    return { ...defaultCalculatorState(), evalDayPolicy };
}

describe('OptimalRiskTable applied eval ladder notice', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(state: CalculatorState) {
        harness.state = state;
        const baseInputs = buildSimInputs(state);
        act(() => {
            root.render(
                <OptimalRiskTable
                    baseInputs={baseInputs}
                    currentRiskPercent={1}
                    plan={state.plan}
                />,
            );
        });
    }

    function clearButton(): HTMLButtonElement | null {
        return container.querySelector(
            'button[aria-label="Clear the applied eval ladder"]',
        );
    }

    function card(): HTMLElement | null {
        return container.querySelector<HTMLElement>(
            '.app-prop-calculator__optimal-risk',
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.setEvalDayPolicy.mockReset();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('says the sweep does not use the applied ladder', () => {
        render(stateWith(LADDER));
        expect(card()?.textContent).toContain(NOT_USED_LEAD);
        expect(clearButton()).not.toBeNull();
    });

    it('shows no notice while no ladder is applied', () => {
        render(stateWith(null));
        expect(container.textContent).not.toContain('Eval ladder');
        expect(clearButton()).toBeNull();
    });

    it('moves focus to the sweep card when Clear removes the notice', () => {
        harness.setEvalDayPolicy.mockImplementation((policy) => {
            harness.state = stateWith(policy);
        });
        render(stateWith(LADDER));
        const clear = clearButton();
        const sweep = card();
        expect(sweep).not.toBeNull();
        clear?.focus();
        expect(document.activeElement).toBe(clear);
        act(() => {
            clear?.click();
        });
        const cleared = harness.state;
        if (cleared !== null) render(cleared);
        expect(clearButton()).toBeNull();
        expect(document.activeElement).toBe(sweep);
        expect(sweep?.tabIndex).toBe(-1);
    });
});
