'use client';

import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import HistogramChartView from './HistogramChartView';

interface Properties {
    result: PortfolioTimelineResult;
}

const BIN_COUNT = 20;

export default function BreakevenMonthHistogramView({ result }: Properties) {
    return (
        <HistogramChartView
            aspectClassName="aspect-4/3 min-h-90 w-full"
            barColor="hsl(142 76% 45%)"
            barLabel="Trials"
            binCount={BIN_COUNT}
            emptyMessage="No trials went cash-flow positive within this horizon."
            values={result.breakEvenMonthValues}
            wrapperClassName="app-prop-calculator__breakeven-month-histogram"
            xAxisLabel="Break-even month"
            xAxisTickFormatter={(v) => v.toFixed(1)}
        />
    );
}
