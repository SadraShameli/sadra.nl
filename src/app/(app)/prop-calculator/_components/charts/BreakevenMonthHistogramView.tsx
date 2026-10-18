'use client';

import { ChartSize } from '~/components/ui/chart';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import HistogramChartView from './HistogramChartView';

interface Properties {
    result: PortfolioTimelineResult;
}

const BIN_COUNT = 20;

export default function BreakevenMonthHistogramView({ result }: Properties) {
    return (
        <HistogramChartView
            barColor="var(--chart-1)"
            barLabel="Trials"
            binCount={BIN_COUNT}
            emptyMessage="No trials went cash-flow positive within this horizon"
            size={ChartSize.Tall}
            values={result.breakEvenMonthValues}
            wrapperClassName="app-prop-calculator__breakeven-month-histogram"
            xAxisLabel="Break-even month"
            xAxisTickFormatter={(v) => v.toFixed(1)}
        />
    );
}
