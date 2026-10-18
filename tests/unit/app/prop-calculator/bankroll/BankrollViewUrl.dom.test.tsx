import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { BankrollUrlParameter } from '~/lib/schemas/bankrollUrlParameter';

const harness = vi.hoisted(() => ({
    headingProps: [] as unknown[],
    query: '',
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(harness.query),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: { summary: { useQuery: () => ({ data: undefined }) } },
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: (properties: unknown) => {
        harness.headingProps.push(properties);
        return null;
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({ error: null, isPending: false, result: null }),
    useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    async () => {
        const { ToolsWorkerPhase } =
            await import('~/app/(app)/prop-calculator/_components/useToolsWorker');
        return {
            useToolsRequest: () => ({
                cancel: vi.fn(),
                run: vi.fn(),
                state: { phase: ToolsWorkerPhase.Idle },
            }),
        };
    },
);

const { BankrollView } =
    await import('~/app/(app)/prop-calculator/(tools)/bankroll/BankrollView');

function lastPageQuery(): URLSearchParams {
    const properties = harness.headingProps.at(-1) as
        undefined | { pageQuery?: string };
    return new URLSearchParams(properties?.pageQuery ?? '');
}

function typeBudget(container: HTMLElement): void {
    const budget = container.querySelector('#bankroll-budget');
    if (!(budget instanceof HTMLInputElement)) {
        throw new TypeError('no budget input');
    }
    act(() => {
        Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set?.call(budget, '5000');
        budget.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('BankrollView URL state', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.headingProps = [];
        harness.query = `${BankrollUrlParameter.Start}=2000&wr=0.4`;
        window.history.replaceState(
            null,
            '',
            `/prop-calculator/bankroll?${harness.query}`,
        );
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<BankrollView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('writes a typed bankroll input into the page URL, keeping the calculator inputs', () => {
        typeBudget(container);
        const search = new URLSearchParams(window.location.search);
        expect(search.get(BankrollUrlParameter.Budget)).toBe('5000');
        expect(search.get(BankrollUrlParameter.Start)).toBe('2000');
        expect(search.get('wr')).toBe('0.4');
    });

    it('hands the bankroll inputs to the share link', () => {
        typeBudget(container);
        expect(lastPageQuery().get(BankrollUrlParameter.Budget)).toBe('5000');
        expect(lastPageQuery().get(BankrollUrlParameter.Start)).toBe('2000');
    });
});
