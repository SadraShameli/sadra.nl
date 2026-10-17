'use client';

import { ChartSize } from '~/components/ui/Chart';
import { type SimOutputs } from '~/lib/prop-calculator';

import HistogramChartView from './HistogramChartView';

interface Properties {
    result: SimOutputs;
}

const BIN_COUNT = 20;

export default function DaysToPassHistogramView({ result }: Properties) {
    return (
        <HistogramChartView
            barColor="var(--success)"
            barLabel="Passing trials"
            binCount={wholeDayBinCount(result.daysToPassValues)}
            emptyMessage="No passing trials yet."
            size={ChartSize.Tall}
            values={result.daysToPassValues}
            wrapperClassName="app-prop-calculator__days-to-pass-histogram"
            xAxisLabel="Days to pass"
            xAxisTickFormatter={(v) => v.toFixed(0)}
        />
    );
}

function wholeDayBinCount(days: readonly number[]): number {
    if (days.length === 0) return BIN_COUNT;
    const span = Math.max(...days) - Math.min(...days);
    return Math.min(BIN_COUNT, span + 1);
}
