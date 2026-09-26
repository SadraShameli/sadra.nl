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
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    describeAppliedEvalLadder,
    InputsSummaryField,
    inputsSummaryRows,
} from '~/app/(app)/prop-calculator/_components/inputsSummaryRows';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { formatCurrency } from '~/lib/format';
import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    RungSizing,
} from '~/lib/prop-calculator';

interface SummaryHarness {
    setEvalDayPolicy: Mock<(policy: DayPolicy | null) => void>;
    setRungSizing: Mock<(rungSizing: RungSizing) => void>;
    state: CalculatorState | null;
}

const harness = vi.hoisted((): SummaryHarness => ({
    setEvalDayPolicy: vi.fn(),
    setRungSizing: vi.fn(),
    state: null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        setEvalDayPolicy: harness.setEvalDayPolicy,
        setRungSizing: harness.setRungSizing,
    }),
    useCalculatorInputs: () => ({ state: harness.state }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/EditInputsDialog', () => ({
    EditInputsDialog: () => null,
}));

const LADDER: DayPolicy = {
    ladder: [200, 300, 400],
    maxLossesPerDay: null,
    stopRule: { k: 2, kind: DayStopRuleKind.AfterKLosses },
};

function stateWith(
    evalDayPolicy: DayPolicy | null,
    rungSizing: RungSizing = RungSizing.CapToCushion,
): CalculatorState {
    return { ...defaultCalculatorState(), evalDayPolicy, rungSizing };
}

describe('describeAppliedEvalLadder', () => {
    it('is null when no eval ladder is applied', () => {
        expect(describeAppliedEvalLadder(stateWith(null))).toBeNull();
    });

    it('lists every rung in dollars, in order', () => {
        const text = describeAppliedEvalLadder(stateWith(LADDER)) ?? '';
        const at = [200, 300, 400].map((rung) =>
            text.indexOf(formatCurrency(rung)),
        );
        expect(at.every((index) => index >= 0)).toBe(true);
        expect(at).toEqual(at.toSorted((a, b) => a - b));
    });

    it.each<[DayStopRule, string]>([
        [{ k: 2, kind: DayStopRuleKind.AfterKLosses }, 'after 2 losses'],
        [{ k: 1, kind: DayStopRuleKind.AfterKLosses }, 'after 1 loss'],
        [
            { dollars: 750, kind: DayStopRuleKind.AfterTarget },
            `at ${formatCurrency(750)} of profit`,
        ],
        [{ kind: DayStopRuleKind.DayGreen }, 'once the day is green'],
        [{ kind: DayStopRuleKind.FirstWin }, 'after the first win'],
        [{ kind: DayStopRuleKind.None }, 'no day stop'],
    ])('names the stop rule it was applied with (%o)', (stopRule, words) => {
        expect(
            describeAppliedEvalLadder(stateWith({ ...LADDER, stopRule })),
        ).toContain(words);
    });

    it('names a max losses cap when the policy has one', () => {
        expect(
            describeAppliedEvalLadder(
                stateWith({ ...LADDER, maxLossesPerDay: 3 }),
            ),
        ).toContain('at most 3 losses a day');
        expect(describeAppliedEvalLadder(stateWith(LADDER))).not.toContain(
            'at most',
        );
    });

    it.each([RungSizing.CapToCushion, RungSizing.SkipIfUnaffordable])(
        'leaves the rung sizing out, since it is a calculator input for every trade and not part of the ladder (%s)',
        (rungSizing) => {
            const text = (
                describeAppliedEvalLadder(stateWith(LADDER, rungSizing)) ?? ''
            ).toLowerCase();
            expect(text).not.toContain('cushion');
            expect(text).not.toContain('skip');
            expect(text).not.toContain('rung');
        },
    );

    it('has no em dash', () => {
        expect(describeAppliedEvalLadder(stateWith(LADDER))).not.toContain('—');
    });
});

function rungSizingRow(state: CalculatorState) {
    return inputsSummaryRows(state).find(
        (row) => row.label === 'Unaffordable rung',
    );
}

describe('the unaffordable rung summary row', () => {
    it('is left out while the rung sizing is the default', () => {
        expect(DEFAULT_RUNG_SIZING).toBe(RungSizing.CapToCushion);
        expect(rungSizingRow(stateWith(null))).toBeUndefined();
        expect(rungSizingRow(stateWith(LADDER))).toBeUndefined();
    });

    it.each([null, LADDER])(
        'shows a non-default rung sizing as a calculator input for every trade, with or without an applied ladder (%o)',
        (evalDayPolicy) => {
            expect(
                rungSizingRow(
                    stateWith(evalDayPolicy, RungSizing.SkipIfUnaffordable),
                ),
            ).toEqual({
                field: InputsSummaryField.RungSizing,
                label: 'Unaffordable rung',
                value: 'Skip trade, eval and funded',
            });
        },
    );

    it('comes after every other row, so the fixed rows keep their order', () => {
        const fields = inputsSummaryRows(
            stateWith(null, RungSizing.SkipIfUnaffordable),
        ).map((row) => row.field);
        expect(fields.at(-1)).toBe(InputsSummaryField.RungSizing);
        expect(fields.slice(0, -1)).toEqual(
            inputsSummaryRows(stateWith(null)).map((row) => row.field),
        );
    });
});

describe('InputsSummary', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(state: CalculatorState) {
        harness.state = state;
        act(() => {
            root.render(<InputsSummary />);
        });
    }

    function clearButton(): HTMLButtonElement | undefined {
        return [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Clear',
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.setEvalDayPolicy.mockClear();
        harness.setRungSizing.mockClear();
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

    it('shows the applied eval ladder outside the lab', () => {
        const state = stateWith(LADDER, RungSizing.SkipIfUnaffordable);
        render(state);
        expect(container.textContent).toContain(
            describeAppliedEvalLadder(state),
        );
    });

    it('clears the applied eval ladder from the summary', () => {
        render(stateWith(LADDER));
        const clear = clearButton();
        expect(clear).toBeDefined();
        expect(clear?.getAttribute('aria-label')).toBe(
            'Clear the applied eval ladder',
        );
        act(() => {
            clear?.click();
        });
        expect(harness.setEvalDayPolicy).toHaveBeenCalledExactlyOnceWith(null);
    });

    it('clears only the ladder and keeps a changed rung sizing on screen as its own row', () => {
        render(stateWith(LADDER, RungSizing.SkipIfUnaffordable));
        act(() => {
            clearButton()?.click();
        });
        expect(harness.setEvalDayPolicy).toHaveBeenCalledExactlyOnceWith(null);
        expect(harness.setRungSizing).not.toHaveBeenCalled();

        render(stateWith(null, RungSizing.SkipIfUnaffordable));
        expect(clearButton()).toBeUndefined();
        expect(container.textContent).toContain('Unaffordable rung');
        expect(container.textContent).toContain('Skip trade, eval and funded');
    });

    it('shows no ladder line and no Clear action when none is applied', () => {
        render(stateWith(null));
        expect(clearButton()).toBeUndefined();
        expect(container.textContent).not.toContain('Eval ladder');
    });
});
