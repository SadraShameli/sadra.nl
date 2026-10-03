import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

import { FundedPayoutsCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/FundedPayoutsCard';
import { type FundedPayoutsCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

type Row = FundedPayoutsCardModel['rows'][number];

function model(rows: readonly Row[]): FundedPayoutsCardModel {
    return {
        disclosures: [
            'A funded account still younger than the horizon is listed open and left out of the distribution.',
        ],
        horizonDays: 365,
        payoutCountCap: 10,
        rows,
    };
}

function row(overrides: Partial<Row> = {}): Row {
    return {
        counts: ['0', '4', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
        fundedValueFlag: null,
        key: 'plan-a',
        modeledCounts: ['60.0%', '20.0%', '10.0%'],
        modeledFundedValue: '$900.00',
        modeledProbabilities: [0.6, 0.2, 0.1, 0.05, 0.03, 0.02, 0, 0, 0, 0, 0],
        openAccounts: '1',
        plan: 'Alpha Prop $50K',
        realizedFundedValue: '$100.00, n = 4',
        realizedProbabilities: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ...overrides,
    };
}

describe('FundedPayoutsCard', () => {
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

    function render(value: FundedPayoutsCardModel) {
        act(() => {
            root.render(<FundedPayoutsCard model={value} />);
        });
    }

    it('draws the realized probabilities beside the modeled distribution for each plan', () => {
        render(model([row()]));
        const text = container.textContent;
        expect(text).toContain('# payouts per funded account, realized');
        expect(text).toContain('# payouts per funded account, modeled');
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(2);
    });

    it('draws only the modeled distribution while no funded account is fully observed, and says so', () => {
        render(model([row({ realizedProbabilities: [] })]));
        expect(container.textContent).toContain(
            'No fully observed funded account yet, so there is no realized distribution.',
        );
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(1);
    });

    it('draws only the realized distribution while the engine has not answered', () => {
        render(model([row({ modeledProbabilities: null })]));
        expect(container.textContent).toContain(
            'The modeled distribution is pending the engine cards.',
        );
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(1);
    });

    it('keeps the counts table with the too young column and the disclosures', () => {
        render(model([row()]));
        const headers = [...container.querySelectorAll('thead th')].map(
            (header) => header.textContent,
        );
        expect(headers).toContain('Too young');
        expect(headers).toContain('10+');
        expect(container.textContent).toContain('listed open');
    });
});
