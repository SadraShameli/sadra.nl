import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalculatorInputsForm } from '~/app/(app)/prop-calculator/_components/CalculatorInputsForm';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

const harness = vi.hoisted(() => {
    const typed: number[] = [];
    return {
        setRebuyLagDays: (value: number) => {
            typed.push(value);
        },
        typed,
    };
});

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    async () => {
        const { defaultCalculatorState: defaults } =
            await import('~/app/(app)/prop-calculator/_components/calculatorReducer');
        return {
            useCalculatorActions: () => ({
                setFundedHorizonDays: vi.fn(),
                setRebuyLagDays: harness.setRebuyLagDays,
            }),
            useCalculatorInputs: () => ({
                firms: [],
                state: { ...defaults(), rebuyLagDays: 2.5 },
            }),
        };
    },
);

vi.mock('~/app/(app)/prop-calculator/_components/TradingInputs', () => ({
    default: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/FirmPlanPicker', () => ({
    default: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/PlanStatsBadges', () => ({
    default: () => null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        AppliedEvalLadderNotice: () => null,
    }),
);

describe('CalculatorInputsForm rebuy lag field (PT-111, F-76)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        harness.typed.length = 0;
        act(() => {
            root.render(<CalculatorInputsForm />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    function field(): HTMLInputElement {
        const input =
            container.querySelector<HTMLInputElement>('#rebuy-lag-days');
        if (input === null) throw new Error('no rebuy lag input');
        return input;
    }

    it('shows a labelled field beside the funded horizon holding the state value', () => {
        const label = container.querySelector('label[for="rebuy-lag-days"]');
        expect(label?.textContent).toBe('Rebuy lag (trading days)');
        expect(field().value).toBe('2.5');
        expect(field().type).toBe('number');
        const ids = [...container.querySelectorAll('input')].map(
            (input) => input.id,
        );
        expect(ids.indexOf('rebuy-lag-days')).toBe(
            ids.indexOf('funded-horizon-days') + 1,
        );
    });

    it('takes its bounds from the shared scalar bounds and allows half days', () => {
        expect(field().min).toBe(String(CALCULATOR_SCALAR_BOUNDS.rebuyLag.min));
        expect(field().max).toBe(String(CALCULATOR_SCALAR_BOUNDS.rebuyLag.max));
        expect(Number(field().step)).toBeLessThanOrEqual(0.5);
    });

    it('sends the typed lag to the setter as a number', () => {
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '3.5', field());
            field().dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(harness.typed).toEqual([3.5]);
    });

    it('explains what the lag is', () => {
        expect(container.textContent).toContain('slot sits empty');
        expect(defaultCalculatorState().rebuyLagDays).toBe(0);
    });
});
