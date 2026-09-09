'use client';

import { formatCompactCurrency } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';

import HistogramChartView from './HistogramChartView';

interface Properties {
    result: SimOutputs;
}

const BIN_COUNT = 30;

export default function FinalBalanceHistogramView({ result }: Properties) {
    const startingBalance = result.accountSize;
    const targetBalance = result.accountSize + result.profitTarget;

    return (
        <HistogramChartView
            aspectClassName="aspect-16/7 min-h-125 w-full"
            barColor="hsl(var(--chart-1))"
            barLabel="Trials"
            binCount={BIN_COUNT}
            emptyMessage="No simulation data yet."
            referenceLines={[
                {
                    color: 'hsl(0 0% 70%)',
                    label: 'Start',
                    x: startingBalance,
                },
                {
                    color: 'hsl(142 76% 45%)',
                    label: 'Target',
                    x: targetBalance,
                },
            ]}
            values={result.finalBalances}
            wrapperClassName="app-prop-calculator__final-balance-histogram"
            xAxisLabel="Final balance"
            xAxisTickFormatter={(v) => formatCompactCurrency(v)}
        />
    );
}
