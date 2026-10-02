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

import {
    type CalculatorAction,
    CalculatorActionType,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import OptimalRiskTable from '~/app/(app)/prop-calculator/_components/OptimalRiskTable';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    PolicySizing,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';

interface TableHarness {
    dispatch: Mock<(action: CalculatorAction) => void>;
    rows: readonly unknown[];
    setEvalDayPolicy: Mock<(policy: DayPolicy | null) => void>;
    state: CalculatorState | null;
}

const harness = vi.hoisted((): TableHarness => ({
    dispatch: vi.fn(),
    rows: [],
    setEvalDayPolicy: vi.fn(),
    state: null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        dispatch: harness.dispatch,
        setEvalDayPolicy: harness.setEvalDayPolicy,
    }),
    useCalculatorInputs: () => ({ state: harness.state }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({
        useDebouncedComputation: () => ({
            error: null,
            pending: false,
            result: harness.rows,
        }),
    }),
);

const NOT_USED_LEAD =
    'Eval ladder applied from the ladder lab, but these results do not use it:';

const LADDER: DayPolicy = {
    ladder: [250, 500],
    maxLossesPerDay: 2,
    sizing: PolicySizing.ContractCapped,
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


function fakeOutputs(monthlyNet: number, cycleNet: number): SimOutputs {
    return {
        bustProbability: 0.1,
        daysToPassP50: 12,
        evalPassProbability: 0.5,
        expectedMonthlyNet: monthlyNet,
        expectedNet: cycleNet,
        fundedSurvivalProbability: 0.4,
        maxLosingStreakP95: 4,
        roiOnCost: { value: 1.5 },
    } as unknown as SimOutputs;
}

function sweepRow(
    riskPct: number,
    monthlyNet: number,
    cycleNet: number,
    bankroll: null | { lossProbability: null | number; noPayoutProbability: null | number } = null,
) {
    return {
        accountSize: 50_000,
        bankroll,
        out: fakeOutputs(monthlyNet, cycleNet),
        riskPct,
    };
}

describe('OptimalRiskTable objective ranking (PT-63, F-V15)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        objective: SizingObjective,
        bankroll: null | ReturnType<typeof dollars> = null,
    ) {
        const state = { ...defaultCalculatorState(), objective };
        harness.state = state;
        act(() => {
            root.render(
                <OptimalRiskTable
                    bankroll={bankroll}
                    baseInputs={buildSimInputs(state)}
                    currentRiskPercent={1}
                    plan={state.plan}
                />,
            );
        });
    }

    function bodyRows(): HTMLTableRowElement[] {
        return [...container.querySelectorAll<HTMLTableRowElement>(':scope tbody tr')];
    }

    function starredRiskTexts(): string[] {
        return bodyRows()
            .filter((row) => row.textContent.includes('★'))
            .map((row) => row.querySelector(':scope td')?.textContent ?? '');
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.dispatch.mockReset();
        harness.rows = [
            sweepRow(0.5, 100, 900),
            sweepRow(2, 300, 100),
            sweepRow(3, 200, 500),
        ];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        harness.rows = [];
    });

    it.each([
        SizingObjective.MonthlyNet,
        SizingObjective.CycleCash,
        SizingObjective.RuinFirst,
    ])('shows monthly net and cycle net on every row under %s', (objective) => {
        render(objective);
        const headers = [...container.querySelectorAll('th')].map(
            (header) => header.textContent,
        );
        expect(headers).toContain('Monthly net');
        expect(headers).toContain('Cycle net');
        const text = bodyRows().map((row) => row.textContent);
        expect(text[0]).toContain('$100');
        expect(text[0]).toContain('$900');
        expect(text[1]).toContain('$300');
        expect(text[1]).toContain('$100');
    });

    it('stars the highest monthly net under MonthlyNet', () => {
        render(SizingObjective.MonthlyNet);
        expect(starredRiskTexts()).toHaveLength(1);
        expect(starredRiskTexts()[0]).toContain('(2%)');
    });

    it('stars the highest cycle net under CycleCash', () => {
        render(SizingObjective.CycleCash);
        expect(starredRiskTexts()).toHaveLength(1);
        expect(starredRiskTexts()[0]).toContain('(0.5%)');
    });

    it('keeps the monthly net star under RuinFirst and says risk sizing stays on monthly net', () => {
        render(SizingObjective.RuinFirst);
        expect(starredRiskTexts()[0]).toContain('(2%)');
        expect(container.textContent).toContain(
            'RuinFirst ranks plans to buy; risk sizing stays on monthly net (Hard Rule 3)',
        );
    });

    it('does not show the RuinFirst note under the other objectives', () => {
        render(SizingObjective.MonthlyNet);
        expect(container.textContent).not.toContain('RuinFirst ranks plans');
    });

    it('names the active objective on the chip', () => {
        render(SizingObjective.CycleCash);
        const chip = container.querySelector(
            '.app-prop-calculator__objective-chip',
        );
        expect(chip?.textContent).toContain('cycle cash');
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Ranking objective"]',
        );
        expect(select?.value).toBe(SizingObjective.CycleCash);
    });

    it('sets the chosen objective through the SetObjective action, never by replacing the whole state', () => {
        render(SizingObjective.MonthlyNet);
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Ranking objective"]',
        );
        if (select === null) throw new Error('chip select missing');
        act(() => {
            select.value = SizingObjective.CycleCash;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(harness.dispatch).toHaveBeenCalledTimes(1);
        expect(harness.dispatch).toHaveBeenCalledWith({
            objective: SizingObjective.CycleCash,
            type: CalculatorActionType.SetObjective,
        });
    });

    it('adds P(no payout) and P(batch < 0) columns only when a bankroll is set', () => {
        harness.rows = [
            sweepRow(2, 300, 100, {
                lossProbability: 0.25,
                noPayoutProbability: 0.1,
            }),
        ];
        render(SizingObjective.MonthlyNet, dollars(5000));
        const headers = [...container.querySelectorAll('th')].map(
            (header) => header.textContent,
        );
        expect(headers).toContain('P(no payout)');
        expect(headers).toContain('P(batch < 0)');
        expect(bodyRows()[0]?.textContent).toContain('25.0%');
        expect(bodyRows()[0]?.textContent).toContain('10.0%');
    });

    it('says what the bankroll figures are priced at', () => {
        harness.rows = [
            sweepRow(2, 300, 100, {
                lossProbability: 0.25,
                noPayoutProbability: 0.1,
            }),
        ];
        render(SizingObjective.MonthlyNet, dollars(5000));
        expect(container.textContent).toContain(
            'Bankroll figures are priced at $5,000',
        );
    });

    it('leaves the bankroll columns out without a bankroll', () => {
        render(SizingObjective.MonthlyNet);
        const headers = [...container.querySelectorAll('th')].map(
            (header) => header.textContent,
        );
        expect(headers).not.toContain('P(no payout)');
        expect(headers).not.toContain('P(batch < 0)');
    });
});
