import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import StrategyAnalysis from '~/app/(app)/prop-calculator/_components/StrategyAnalysis';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { NOT_APPLICABLE } from '~/lib/format';
import { dollars, type SimInputs, simulate } from '~/lib/prop-calculator';
import { requiredR } from '~/lib/prop-calculator/economics';

vi.mock('~/components/ui/InfoPopover', () => ({
    default: () => null,
}));

function inputsOf(overrides: Partial<SimInputs> = {}): SimInputs {
    return { ...buildSimInputs(defaultCalculatorState()), ...overrides };
}

describe('StrategyAnalysis edge leverage and net R to pass (F-V9, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

    it('shows the edge leverage readout as EV per attempt over attempt cost', () => {
        const baseInputs = inputsOf();
        const result = simulate(baseInputs);
        const leverage = result.expectedNetPerAttempt / result.costPerAttempt;
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={baseInputs} result={result} />,
            );
        });
        expect(container.textContent).toContain('Edge leverage');
        expect(container.textContent).toContain(`${leverage.toFixed(2)}×`);
    });

    it('shows net R to pass from the required-R economics helper', () => {
        const baseInputs = inputsOf();
        const result = simulate(baseInputs);
        const required = requiredR(
            dollars(result.profitTarget),
            dollars(baseInputs.riskPerTrade),
        );
        if (required.value === null) throw new Error('expected a value');
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={baseInputs} result={result} />,
            );
        });
        expect(container.textContent).toContain('Net R to pass');
        expect(container.textContent).toContain(
            `${required.value.toFixed(1)}R`,
        );
    });

    it('shows n/a for net R to pass on an instant-funded plan, which has no eval', () => {
        const baseInputs = inputsOf();
        const instantPlan = baseInputs.plan.withOverrides({
            isInstantFunded: true,
        });
        const withInstant = { ...baseInputs, plan: instantPlan };
        const result = simulate(withInstant);
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={withInstant} result={result} />,
            );
        });
        const netRLabel = [...container.querySelectorAll('span')].find(
            (node) => node.textContent === 'Net R to pass',
        );
        const value = netRLabel?.nextElementSibling;
        expect(value?.textContent).toBe(NOT_APPLICABLE);
    });
});
