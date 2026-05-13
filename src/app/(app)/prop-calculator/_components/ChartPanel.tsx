'use client';

import { Card } from '~/components/ui/Card';
import { type SimOutputs } from '~/lib/prop-calculator';

import DaysToPassHistogramView from './charts/DaysToPassHistogramView';
import DrawdownCurveChartView from './charts/DrawdownCurveChartView';
import EquityCurveChartView from './charts/EquityCurveChartView';
import FinalBalanceHistogramView from './charts/FinalBalanceHistogramView';
import PassRateByDayChartView from './charts/PassRateByDayChartView';
import ChartTypeSelector from './ChartTypeSelector';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';
import { ChartType } from './types';

interface ChartPanelProps {
    chartType: ChartType;
    onChartTypeChange: (next: ChartType) => void;
    result: SimOutputs;
    totalTrials: number;
    maxEvalDays: number;
}

const TITLES: Record<ChartType, string> = {
    [ChartType.Equity]: 'Equity curves',
    [ChartType.Drawdown]: 'Drawdown curves',
    [ChartType.PassRate]: 'Cumulative pass rate by day',
    [ChartType.FinalBalanceHistogram]: 'Final balance distribution',
    [ChartType.DaysToPassHistogram]: 'Days to pass distribution',
};

const SUBTITLES: Record<ChartType, (result: SimOutputs) => string> = {
    [ChartType.Equity]: (r) =>
        `${r.sampleEquityCurves.length} sampled paths · median bold`,
    [ChartType.Drawdown]: (r) =>
        `${r.sampleEquityCurves.length} sampled paths · drawn from peak`,
    [ChartType.PassRate]: (r) =>
        `${r.daysToPassValues.length} passing trials cumulated`,
    [ChartType.FinalBalanceHistogram]: (r) =>
        `${r.finalBalances.length} trial outcomes`,
    [ChartType.DaysToPassHistogram]: (r) =>
        `${r.daysToPassValues.length} passing trials only`,
};

const DESCRIPTIONS: Record<ChartType, string> = {
    [ChartType.Equity]: panelDescriptions.equity,
    [ChartType.Drawdown]: panelDescriptions.drawdown,
    [ChartType.PassRate]: panelDescriptions['pass-rate'],
    [ChartType.FinalBalanceHistogram]: panelDescriptions['final-balance-hist'],
    [ChartType.DaysToPassHistogram]: panelDescriptions['days-to-pass-hist'],
};

export default function ChartPanel({
    chartType,
    onChartTypeChange,
    result,
    totalTrials,
    maxEvalDays,
}: ChartPanelProps) {
    return (
        <Card className="px-6 py-6">
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
                        value={chartType}
                        onChange={onChartTypeChange}
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
                    result={result}
                    totalTrials={totalTrials}
                    maxEvalDays={maxEvalDays}
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
