'use client';

import { Select } from '~/components/ui/Select';

import { ChartType } from './types';

interface Option {
    label: string;
    value: ChartType;
}

const OPTIONS: Option[] = [
    { label: 'Equity curves', value: ChartType.Equity },
    { label: 'Drawdown curves', value: ChartType.Drawdown },
    { label: 'Cumulative pass-rate by day', value: ChartType.PassRate },
    {
        label: 'Final balance histogram',
        value: ChartType.FinalBalanceHistogram,
    },
    { label: 'Days to pass histogram', value: ChartType.DaysToPassHistogram },
];

interface ChartTypeSelectorProps {
    onChange: (next: ChartType) => void;
    value: ChartType;
}

export default function ChartTypeSelector({
    onChange,
    value,
}: ChartTypeSelectorProps) {
    return (
        <Select
            aria-label="Chart type"
            className={`app-prop-calculator__chart-type-selector h-8 pr-8 text-xs`}
            onChange={(e) => onChange(e.target.value as ChartType)}
            value={value}
            wrapperClassName="w-full sm:w-auto"
        >
            {OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </Select>
    );
}

export { OPTIONS as CHART_TYPE_OPTIONS };
