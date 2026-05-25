'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';

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
        <Select onValueChange={(v) => onChange(v as ChartType)} value={value}>
            <SelectTrigger
                aria-label="Chart type"
                className="app-prop-calculator__chart-type-selector h-8 w-full text-xs sm:w-auto"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export { OPTIONS as CHART_TYPE_OPTIONS };
