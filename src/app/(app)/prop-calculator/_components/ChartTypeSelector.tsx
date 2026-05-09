'use client';

import { Select } from '~/components/ui/Select';

import { ChartType } from './types';

interface Option {
    value: ChartType;
    label: string;
}

const OPTIONS: Option[] = [
    { value: ChartType.Equity, label: 'Equity curves' },
    { value: ChartType.Drawdown, label: 'Drawdown curves' },
    { value: ChartType.PassRate, label: 'Cumulative pass-rate by day' },
    {
        value: ChartType.FinalBalanceHistogram,
        label: 'Final balance histogram',
    },
    { value: ChartType.DaysToPassHistogram, label: 'Days to pass histogram' },
];

interface ChartTypeSelectorProps {
    value: ChartType;
    onChange: (next: ChartType) => void;
}

export default function ChartTypeSelector({
    value,
    onChange,
}: ChartTypeSelectorProps) {
    return (
        <Select
            value={value}
            onChange={(e) => onChange(e.target.value as ChartType)}
            className="h-8 pr-8 text-xs"
            wrapperClassName="w-full sm:w-auto"
            aria-label="Chart type"
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
