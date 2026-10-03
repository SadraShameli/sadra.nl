import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type OutcomesCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { RealizedOutcomesCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/RealizedOutcomesCard';

type Row = OutcomesCardModel['rows'][number];

function row(overrides: Partial<Row> = {}): Row {
    return {
        fundedSurvival: '100.0% (n = 1)',
        fundedSurvivalCounts: '3 accounts, 1 independent',
        key: 'plan-a',
        modeledFundedSurvival: 'Pending',
        modeledPassRate: 'Pending',
        openFunded: '0',
        passRate: '100.0% (n = 1)',
        passRateCounts: '3 attempts, 1 independent',
        plan: 'Alpha Prop $50K',
        sessionsToFunded: 'n/a',
        ...overrides,
    };
}

describe('RealizedOutcomesCard', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows three copies as 3 accounts, 1 independent, beside the rate they collapse into', () => {
        act(() => {
            root.render(
                <RealizedOutcomesCard
                    model={{ disclosures: [], rows: [row()] }}
                />,
            );
        });
        expect(container.textContent).toContain('3 attempts, 1 independent');
        expect(container.textContent).toContain('3 accounts, 1 independent');
    });

    it('shows n = 0 and the level none for a rate with no decided attempt', () => {
        act(() => {
            root.render(
                <RealizedOutcomesCard
                    model={{
                        disclosures: [],
                        rows: [
                            row({
                                fundedSurvivalCounts:
                                    '0 accounts, 0 independent',
                                passRate: 'n/a (n = 0), no sample',
                                passRateCounts: '0 attempts, 0 independent',
                            }),
                        ],
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('n/a (n = 0), no sample');
    });

    it('prints the majority vote rule as help text', () => {
        const rule =
            'Accounts bought together in one copy group count once: the group counts as a success only when more than half of its accounts succeeded, and a tie counts as a failure.';
        act(() => {
            root.render(
                <RealizedOutcomesCard
                    model={{ disclosures: [rule], rows: [row()] }}
                />,
            );
        });
        expect(container.textContent).toContain(rule);
    });
});
