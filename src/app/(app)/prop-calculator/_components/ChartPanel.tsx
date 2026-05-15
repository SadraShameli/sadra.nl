'use client';

import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import DaysToPassHistogramView from './charts/DaysToPassHistogramView';
import DrawdownCurveChartView from './charts/DrawdownCurveChartView';
import EquityCurveChartView from './charts/EquityCurveChartView';
import FinalBalanceHistogramView from './charts/FinalBalanceHistogramView';
import PassRateByDayChartView from './charts/PassRateByDayChartView';
import ChartTypeSelector from './ChartTypeSelector';
import { panelDescriptions } from './kpiDescriptions';
import { ChartType } from './types';

interface ChartPanelProps {
    chartType: ChartType;
    maxEvalDays: number;
    onChartTypeChange: (next: ChartType) => void;
    result: SimOutputs;
    totalTrials: number;
}

const TITLES: Record<ChartType, string> = {
    [ChartType.DaysToPassHistogram]: 'Days to pass distribution',
    [ChartType.Drawdown]: 'Drawdown curves',
    [ChartType.Equity]: 'Equity curves',
    [ChartType.FinalBalanceHistogram]: 'Final balance distribution',
    [ChartType.PassRate]: 'Cumulative pass rate by day',
};

const SUBTITLES: Record<ChartType, (result: SimOutputs) => string> = {
    [ChartType.DaysToPassHistogram]: (r) =>
        `${r.daysToPassValues.length} passing trials only`,
    [ChartType.Drawdown]: (r) =>
        `${r.sampleEquityCurves.length} sampled paths · drawn from peak`,
    [ChartType.Equity]: (r) =>
        `${r.sampleEquityCurves.length} sampled paths · median bold`,
    [ChartType.FinalBalanceHistogram]: (r) =>
        `${r.finalBalances.length} trial outcomes`,
    [ChartType.PassRate]: (r) =>
        `${r.daysToPassValues.length} passing trials cumulated`,
};

const DESCRIPTIONS: Record<ChartType, string> = {
    [ChartType.DaysToPassHistogram]: panelDescriptions['days-to-pass-hist'],
    [ChartType.Drawdown]: panelDescriptions.drawdown,
    [ChartType.Equity]: panelDescriptions.equity,
    [ChartType.FinalBalanceHistogram]: panelDescriptions['final-balance-hist'],
    [ChartType.PassRate]: panelDescriptions['pass-rate'],
};

export default function ChartPanel({
    chartType,
    maxEvalDays,
    onChartTypeChange,
    result,
    totalTrials,
}: ChartPanelProps) {
    return (
        <Card className={cn('app-prop-calculator__chart-panel', 'px-6 py-6')}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        {TITLES[chartType]}
                    </h3>
                    <InfoPopover title={TITLES[chartType]}>
                        {DESCRIPTIONS[chartType]}
                    </InfoPopover>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-xs text-muted-foreground">
                        {SUBTITLES[chartType](result)}
                    </span>
                    <ChartTypeSelector
                        onChange={onChartTypeChange}
                        value={chartType}
                    />
                </div>
            </div>

            {chartType === ChartType.Equity && (
                <EquityCurveChartView result={result} />
            )}
            {chartType === ChartType.Drawdown && (
                <DrawdownCurveChartView result={result} />
            )}
            {chartType === ChartType.PassRate && (
                <PassRateByDayChartView
                    maxEvalDays={maxEvalDays}
                    result={result}
                    totalTrials={totalTrials}
                />
            )}
            {chartType === ChartType.FinalBalanceHistogram && (
                <FinalBalanceHistogramView result={result} />
            )}
            {chartType === ChartType.DaysToPassHistogram && (
                <DaysToPassHistogramView result={result} />
            )}
        </Card>
    );
}
