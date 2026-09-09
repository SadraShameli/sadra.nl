'use client';

import { type SimOutputs } from '~/lib/prop-calculator';

import HistogramChartView from './HistogramChartView';

interface Properties {
    result: SimOutputs;
}

const BIN_COUNT = 20;

export default function DaysToPassHistogramView({ result }: Properties) {
    return (
        <HistogramChartView
            aspectClassName="aspect-16/7 min-h-125 w-full"
            barColor="hsl(142 76% 45%)"
            barLabel="Passing trials"
            binCount={BIN_COUNT}
            emptyMessage="No passing trials yet."
            values={result.daysToPassValues}
            wrapperClassName="app-prop-calculator__days-to-pass-histogram"
            xAxisLabel="Days to pass"
            xAxisTickFormatter={(v) => v.toFixed(0)}
        />
    );
}
