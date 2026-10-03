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

import {
    PayoutBalanceBandKey,
    type PayoutSizesCardModel,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PayoutSizesCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/PayoutSizesCard';

function model(
    overrides: Partial<PayoutSizesCardModel> = {},
): PayoutSizesCardModel {
    return {
        bucketWidth: '$350.00',
        byAccountSize: [],
        byBalance: [
            {
                count: '1',
                key: PayoutBalanceBandKey.LowBalance,
                label: 'Low balance at payout',
                mean: '$100.00, n = 1',
                median: '$100.00',
            },
            {
                count: '1',
                key: PayoutBalanceBandKey.AboveCushion,
                label: 'Above the retained cushion',
                mean: '$800.00, n = 1',
                median: '$800.00',
            },
            {
                count: '0',
                key: PayoutBalanceBandKey.NoSnapshot,
                label: 'No snapshot on or before the payout',
                mean: 'n/a',
                median: 'n/a',
            },
        ],
        byFirm: [],
        byStage: [],
        count: 2,
        disclosures: [],
        grossOnlyPayouts: 0,
        histogram: [
            { binCenter: 27_500, binEnd: 45_000, binStart: 10_000, count: 1 },
            { binCenter: 62_500, binEnd: 80_000, binStart: 45_000, count: 1 },
        ],
        lowBalanceCount: 1,
        mean: '$450.00, n = 2',
        median: '$450.00',
        p10: '$170.00',
        p90: '$730.00',
        ...overrides,
    };
}

describe('PayoutSizesCard', () => {
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

    function render(value: PayoutSizesCardModel) {
        act(() => {
            root.render(<PayoutSizesCard model={value} />);
        });
    }

    it('shows the balance band rows with count, mean and median', () => {
        render(model());
        const title = [...container.querySelectorAll('h3')].find(
            (heading) => heading.textContent === 'By balance at payout',
        );
        const rows = [
            ...(title?.parentElement?.querySelectorAll(':scope tbody tr') ??
                []),
        ].map((tableRow) =>
            [...tableRow.querySelectorAll('td')].map(
                (cell) => cell.textContent,
            ),
        );
        expect(rows).toEqual([
            ['Low balance at payout', '1', '$100.00, n = 1', '$100.00'],
            ['Above the retained cushion', '1', '$800.00, n = 1', '$800.00'],
            ['No snapshot on or before the payout', '0', 'n/a', 'n/a'],
        ]);
    });

    it('draws the library bins as given and names the real bucket width', () => {
        render(model());
        expect(container.textContent).toContain('Bucket width $350.00');
        expect(
            container.querySelectorAll('.recharts-bar-rectangle'),
        ).toHaveLength(2);
    });

    it('says no paid payout yet when there is none', () => {
        render(model({ count: 0, histogram: [] }));
        expect(container.textContent).toContain('No paid payout yet.');
    });
});
