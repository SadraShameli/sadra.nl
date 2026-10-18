'use client';

import { ChartSize } from '~/components/ui/chart';
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
            barColor="var(--chart-1)"
            barLabel="Trials"
            binCount={BIN_COUNT}
            emptyMessage="No simulation data yet."
            referenceLines={[
                {
                    color: 'var(--muted-foreground)',
                    label: 'Start',
                    x: startingBalance,
                },
                {
                    color: 'var(--success)',
                    label: 'Target',
                    x: targetBalance,
                },
            ]}
            size={ChartSize.Tall}
            values={result.finalBalances}
            wrapperClassName="app-prop-calculator__final-balance-histogram"
            xAxisLabel="Final balance"
            xAxisTickFormatter={(v) => formatCompactCurrency(v)}
        />
    );
}
