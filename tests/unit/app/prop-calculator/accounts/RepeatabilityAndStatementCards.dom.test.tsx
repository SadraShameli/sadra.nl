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

import { MonthlyPayoutChart } from '~/app/(app)/prop-calculator/accounts/_components/overview/MonthlyPayoutChart';
import {
    type RepeatabilityCardModel,
    type StatementCardModel,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { RepeatabilityCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/RepeatabilityCard';
import { StatementCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/StatementCard';

const STATEMENT: StatementCardModel = {
    caveat: 'calendar months mix purchase cohorts',
    chart: [
        { month: '2026-06', payouts: 900, spend: 350 },
        { month: '2026-07', payouts: 1200, spend: 400 },
    ],
    months: [
        {
            cumulativeNet: '$550.00',
            isPartial: false,
            key: '2026-06',
            meetsMultipleTarget: null,
            meetsPayoutTarget: true,
            month: '2026-06',
            multiple: '2.57x',
            net: '$550.00',
            payoutCount: '1',
            payoutGrowth: 'n/a',
            payouts: '$900.00',
            spend: '$350.00',
            trailingThreeMonthMultiple: '2.57x',
        },
        {
            cumulativeNet: '$1,350.00',
            isPartial: true,
            key: '2026-07',
            meetsMultipleTarget: null,
            meetsPayoutTarget: false,
            month: '2026-07',
            multiple: '3.00x',
            net: '$800.00',
            payoutCount: '2',
            payoutGrowth: '33.3%',
            payouts: '$1,200.00',
            spend: '$400.00',
            trailingThreeMonthMultiple: '2.80x',
        },
    ],
    purchaseCohorts: [],
    targetDollars: 1000,
};

const REPEATABILITY: RepeatabilityCardModel = {
    basisNote:
        'Mean, standard deviation, worst, best and share positive are net per month. The share at or above target compares payouts per month with your monthly payout target.',
    overall: {
        best: '$800.00',
        count: '1',
        mean: '$550.00',
        shareAtOrAboveTarget: '0.0% (n = 1)',
        sharePositive: '100.0% (n = 1)',
        standardDeviation: 'n/a',
        worst: '$550.00',
    },
    perSlot: null,
    perSlotTargetNote:
        'The per-slot target divides the portfolio-wide monthly target evenly across the funded slots active that month.',
};

describe('StatementCard and RepeatabilityCard', () => {
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

    it('pins the payout count, growth and trailing three-month multiple columns of the statement table', () => {
        act(() => {
            root.render(<StatementCard model={STATEMENT} />);
        });
        const rows = [...container.querySelectorAll(':scope table tr')].map(
            (tableRow) =>
                [...tableRow.querySelectorAll('th, td')].map(
                    (cell) => cell.textContent,
                ),
        );
        expect(rows[0]).toEqual([
            'Month',
            'Spend',
            'Payouts received',
            'Payout count',
            'Net',
            'Cumulative net',
            'Multiple',
            'Trailing 3-month multiple',
            'Growth',
            'Meets target',
        ]);
        expect(rows[1]).toEqual([
            '2026-06',
            '$350.00',
            '$900.00',
            '1',
            '$550.00',
            '$550.00',
            '2.57x',
            '2.57x',
            'n/a',
            'Yes',
        ]);
        expect(rows[2]).toEqual([
            '2026-07(partial)',
            '$400.00',
            '$1,200.00',
            '2',
            '$800.00',
            '$1,350.00',
            '3.00x',
            '2.80x',
            '33.3%',
            'No',
        ]);
    });

    it('draws the monthly payout target as a reference line at the target dollars', () => {
        act(() => {
            root.render(
                <MonthlyPayoutChart
                    points={STATEMENT.chart}
                    targetDollars={1000}
                />,
            );
        });
        expect(
            container.querySelectorAll('.recharts-reference-line'),
        ).toHaveLength(1);
        expect(container.textContent).toContain('Target');
    });

    it('draws no target line without a target', () => {
        act(() => {
            root.render(
                <MonthlyPayoutChart
                    points={STATEMENT.chart}
                    targetDollars={null}
                />,
            );
        });
        expect(
            container.querySelectorAll('.recharts-reference-line'),
        ).toHaveLength(0);
    });

    it('labels the net basis and the payouts basis and shows n/a for the deviation below two months', () => {
        act(() => {
            root.render(<RepeatabilityCard model={REPEATABILITY} />);
        });
        const text = container.textContent;
        expect(text).toContain('share positive are net per month');
        expect(text).toContain(
            'The share at or above target compares payouts per month',
        );
        const terms = [...container.querySelectorAll('dt')].map(
            (term) => term.textContent,
        );
        expect(terms).toContain('Mean (net per month)');
        expect(terms).toContain('Share at or above target (payouts per month)');
        const deviation = [...container.querySelectorAll('dt')].find(
            (term) => term.textContent === 'Standard deviation (net per month)',
        );
        expect(deviation?.nextElementSibling?.textContent).toBe('n/a');
    });

    it('prints both shares as sampled rates with their n', () => {
        act(() => {
            root.render(<RepeatabilityCard model={REPEATABILITY} />);
        });
        expect(container.textContent).toContain('100.0% (n = 1)');
        expect(container.textContent).toContain('0.0% (n = 1)');
    });
});
