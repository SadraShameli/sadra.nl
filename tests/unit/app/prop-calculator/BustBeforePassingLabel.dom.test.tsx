import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { kpiDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import ResultsPanel from '~/app/(app)/prop-calculator/_components/ResultsPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatPercent } from '~/lib/format';
import { type SimOutputs, simulate } from '~/lib/prop-calculator';

vi.mock('~/components/ui/InfoPopover', () => ({
    default: ({ children, title }: { children: ReactNode; title: string }) => (
        <div data-info-title={title}>{children}</div>
    ),
}));

describe('the simulator results (PT-93, F-V9, F-V13): "Bust before passing" naming and the attempt economics card', () => {
    let container: HTMLDivElement;
    let root: Root;
    let result: SimOutputs;

    beforeAll(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        const state = { ...defaultCalculatorState(), trials: 20 };
        const inputs = buildSimInputs(state);
        result = simulate(inputs);
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={inputs.plan}
                    result={result}
                />,
            );
        });
    });

    afterAll(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('renders the KPI label "Bust before passing" with the bust probability as its value', () => {
        const label = [...container.querySelectorAll('.uppercase')].find(
            (node) => node.textContent === 'Bust before passing',
        );
        if (!label) throw new Error('Bust before passing label missing');
        const card = label.closest('[data-slot="card"]');
        expect(card?.textContent).toContain(
            formatPercent(result.bustProbability),
        );
    });

    it('titles the KPI info with the same name and the shared description', () => {
        const info = container.querySelector(
            '[data-info-title="Bust before passing"]',
        );
        expect(info?.textContent).toBe(kpiDescriptions.bustBeforePassing);
    });

    it('never says "Risk of ruin" anywhere on the page', () => {
        expect(container.textContent.toLowerCase()).not.toContain(
            'risk of ruin',
        );
        expect(container.querySelector('[data-info-title]')).not.toBeNull();
        for (const node of container.querySelectorAll('[data-info-title]')) {
            expect(
                node instanceof HTMLElement
                    ? node.dataset.infoTitle?.toLowerCase()
                    : undefined,
            ).not.toContain('ruin');
        }
    });

    it('shows the attempt economics rows with the breakeven explained in a popover (PT-93, F-V9)', () => {
        const card = container.querySelector(
            '[data-testid="attempt-economics-card"]',
        );
        if (!card) throw new Error('attempt economics card missing');
        for (const label of [
            'Attempt price',
            'Breakeven pass rate',
            'Funded value / attempt cost',
        ]) {
            expect(card.textContent).toContain(label);
        }
        expect(
            card.querySelector('[data-info-title="Breakeven pass rate"]')
                ?.textContent,
        ).toBe(kpiDescriptions.breakevenPassRate);
    });
});
