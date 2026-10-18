import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import CashFlowPanel from '~/app/(app)/prop-calculator/_components/CashFlowPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';

import { hasComputingIndicator } from './computingIndicator';
import { infoText } from './infoPopover';

vi.mock(
    import('~/app/(app)/prop-calculator/_components/useCashFlowSimulation'),
    async (importOriginal) => ({
        ...(await importOriginal()),
        useCashFlowSimulation: () => ({
            effectiveTradesPerDay: 1,
            error: null,
            isTradesPerDayCapped: false,
            pending: true,
            result: null,
        }),
    }),
);

describe('CashFlowPanel on a phone', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        const state = defaultCalculatorState();
        act(() => {
            root.render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={state.firm.maxFundedAccounts(state.plan)}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function horizonGroup(): HTMLElement {
        const group = container.querySelector<HTMLElement>(
            '[role="radiogroup"][aria-label="Horizon"]',
        );
        if (group === null) throw new Error('no horizon group');
        return group;
    }

    it('shows the one computing indicator and skeletons while the first run is in flight, not computing text notes', () => {
        const panel = container.querySelector('[aria-busy="true"]');
        expect(hasComputingIndicator(panel)).toBe(true);
        expect(container.textContent).not.toMatch(
            /computing…|Computing cash flow/,
        );
        expect(
            container.querySelectorAll('[data-slot="skeleton"]').length,
        ).toBeGreaterThan(1);
    });

    it('keeps every range pill on one line and scrolls the range sideways instead of breaking a pill', () => {
        const group = horizonGroup();
        const scroller = group.parentElement;
        expect(scroller?.classList.contains('overflow-x-auto')).toBe(true);
        expect(scroller?.classList.contains('max-w-full')).toBe(true);
        expect(group.classList.contains('w-max')).toBe(true);
        const pills = [...group.querySelectorAll('button')];
        expect(pills.map((pill) => pill.textContent)).toEqual([
            '6 months',
            '1 year',
            '2 years',
            '3 years',
        ]);
        for (const pill of pills) {
            expect(pill.classList.contains('whitespace-nowrap')).toBe(true);
            expect(pill.classList.contains('shrink-0')).toBe(true);
        }
    });

    it('stacks the what-if funnel fields on phone, with a short payout rate label and its detail behind an info button', () => {
        const grid = container
            .querySelector('#cash-flow-what-if-attempts')
            ?.closest('.grid');
        expect(grid?.querySelectorAll('input')).toHaveLength(5);
        expect(grid?.classList.contains('grid-cols-2')).toBe(false);
        expect(grid?.classList.contains('md:grid-cols-3')).toBe(true);
        expect(
            container.querySelector(
                'label[for="cash-flow-what-if-payout-rate"]',
            )?.textContent,
        ).toBe('Payout rate (%)');
        expect(infoText(container, 'Payout rate (%)')).toContain(
            'funded accounts that reach a payout',
        );
    });
});
