'use client';

import { FilterToolbar } from '~/components/FilterToolbar';
import { ToolPanel } from '~/components/ToolPanel';
import { type SimOutputs } from '~/lib/prop-calculator';

import DaysToPassHistogramView from './charts/DaysToPassHistogramView';
import DrawdownCurveChartView from './charts/DrawdownCurveChartView';
import EquityCurveChartView from './charts/EquityCurveChartView';
import FinalBalanceHistogramView from './charts/FinalBalanceHistogramView';
import PassRateByDayChartView from './charts/PassRateByDayChartView';
import ChartTypeSelector from './ChartTypeSelector';
import { panelDescriptions } from './kpiDescriptions';
import { ChartType } from './types';

interface ChartPanelProperties {
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
}: ChartPanelProperties) {
    return (
        <ToolPanel
            className="app-prop-calculator__chart-panel"
            description={SUBTITLES[chartType](result)}
            info={DESCRIPTIONS[chartType]}
            title={TITLES[chartType]}
            titleAs="h3"
        >
            <FilterToolbar label="Chart options">
                <ChartTypeSelector
                    onChange={onChartTypeChange}
                    value={chartType}
                />
            </FilterToolbar>

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
        </ToolPanel>
    );
}
