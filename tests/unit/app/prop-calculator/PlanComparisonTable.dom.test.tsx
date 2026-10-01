import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({
        useDebouncedComputation: (
            _id: unknown,
            _key: unknown,
            _debounceMs: unknown,
            compute: () => unknown,
        ) => ({
            error: null,
            pending: false,
            result: compute(),
        }),
    }),
);

vi.mock('~/components/ui/InfoPopover', () => ({
    default: () => null,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/compare',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    async () => {
        const { defaultCalculatorState } =
            await import('~/app/(app)/prop-calculator/_components/calculatorReducer');
        return {
            useCalculatorActions: () => ({ applyState: vi.fn() }),
            useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
        };
    },
);

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import PlanComparisonTable from '~/app/(app)/prop-calculator/_components/PlanComparisonTable';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    dollars,
    NO_PLAN_OPT_INS,
    rankablePlans,
    simulate,
} from '~/lib/prop-calculator';
import { netPerScreenHour } from '~/lib/prop-calculator/economics';

function dispatchInput(input: HTMLInputElement, value: string): void {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('PlanComparisonTable $/screen hour column (F-V25, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs(state);

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <PlanComparisonTable
                    activePlan={state.plan}
                    baseInputs={baseInputs}
                    firm={state.firm}
                    planOptIns={NO_PLAN_OPT_INS}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('shows no $/screen hour column until both inputs are set', () => {
        expect(container.textContent).not.toContain('$/screen hour');
    });

    it('shows the column once hours/day and accounts/session are both set', () => {
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!hoursInput || !accountsInput) {
            throw new Error('screen-hour inputs missing');
        }
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        act(() => {
            dispatchInput(accountsInput, '3');
        });
        expect(container.textContent).toContain('$/screen hour');

        const plan = rankablePlans(state.firm.plans, false)[0];
        if (!plan) throw new Error('no plan to compare against');
        const out = simulate({
            ...baseInputs,
            plan,
            trials: Math.min(500, baseInputs.trials),
        });
        const perHour = netPerScreenHour({
            accountsPerSession: 3,
            expectedMonthlyNet: dollars(out.expectedMonthlyNet),
            sessionHoursPerDay: 4,
        });
        if (perHour.value === null) throw new Error('expected a value');
        expect(container.textContent).toContain(
            formatCurrency(perHour.value.value),
        );
    });

    it('rejects 0.5 accounts per session: no column, an inline hint (PT-61d, F-V22)', () => {
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!hoursInput || !accountsInput) {
            throw new Error('screen-hour inputs missing');
        }
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        act(() => {
            dispatchInput(accountsInput, '0.5');
        });
        expect(container.textContent).not.toContain('$/screen hour');
        expect(accountsInput.getAttribute('aria-invalid')).toBe('true');
        expect(container.textContent).toContain('Whole number, at least 1');
    });

    it('shows a P(no payout) column from the run on every row', () => {
        expect(container.textContent).toContain('P(no payout)');
        const plan = rankablePlans(state.firm.plans, false)[0];
        if (!plan) throw new Error('no plan to compare against');
        const out = simulate({
            ...baseInputs,
            plan,
            trials: Math.min(500, baseInputs.trials),
        });
        const noPayout = out.fundedPayoutCountDistribution[0];
        if (noPayout === undefined) {
            throw new Error('expected a funded payout distribution');
        }
        expect(container.textContent).toContain(formatPercent(noPayout));
    });
});
