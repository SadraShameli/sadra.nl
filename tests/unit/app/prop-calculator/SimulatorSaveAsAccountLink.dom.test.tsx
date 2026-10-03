import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulatorView } from '~/app/(app)/prop-calculator/(tools)/simulator/SimulatorView';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { accountPrefillHref } from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import { NO_PLAN_OPT_INS, type PlanOptIns } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

interface SimulatorHarness {
    planOptIns: PlanOptIns;
}

const harness = vi.hoisted((): SimulatorHarness => ({
    planOptIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
}));

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorInputsForm', () => ({
    CalculatorInputsForm: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/PercentileBar', () => ({
    default: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/value/ValueChainCard', () => ({
    ValueChainCard: () => null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/value/FundedValueCard',
    () => ({ FundedValueCard: () => null }),
);

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({ error: null, isPending: false, result: null }),
    useCalculatorActions: () => ({}),
    useCalculatorInputs: () => ({
        planOptIns: harness.planOptIns,
        simInputs: {},
        state: defaultCalculatorState(),
    }),
    useLabSlots: () => ({ chartType: 'days-to-pass', pinned: null }),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

function renderNothing(): null {
    return null;
}

describe('the simulator Save as account link', () => {
    let container: HTMLDivElement;
    let root: Root;

    function link(): HTMLAnchorElement | undefined {
        return [...container.querySelectorAll('a')].find((anchor) =>
            anchor.textContent.includes('Save as account'),
        );
    }

    function render() {
        act(() => {
            root.render(<SimulatorView />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.planOptIns = NO_PLAN_OPT_INS;
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

    it('is labelled Save as account and points at the new account form prefilled from the page state', () => {
        render();
        const state = defaultCalculatorState();
        const anchor = link();
        expect(anchor).toBeDefined();
        expect(anchor?.textContent.trim()).toBe('Save as account');
        expect(anchor?.getAttribute('href')).toBe(
            accountPrefillHref(state.firm.id, state.plan, NO_PLAN_OPT_INS),
        );
        expect(
            anchor
                ?.getAttribute('href')
                ?.startsWith(routes.propCalculator.accounts.new),
        ).toBe(true);
    });

    it('carries the plan opt-ins the page is calculating with', () => {
        const optIns: PlanOptIns = {
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        };
        harness.planOptIns = optIns;
        render();
        const state = defaultCalculatorState();
        expect(link()?.getAttribute('href')).toBe(
            accountPrefillHref(state.firm.id, state.plan, optIns),
        );
    });
});
