'use client';

import { z } from 'zod';

import { ToolbarSelect } from '~/components/ui/toolbar-select';

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

interface ChartTypeSelectorProperties {
    onChange: (next: ChartType) => void;
    value: ChartType;
}

export default function ChartTypeSelector({
    onChange,
    value,
}: ChartTypeSelectorProperties) {
    return (
        <ToolbarSelect
            label="Chart type"
            onValueChange={(v) => onChange(z.enum(ChartType).parse(v))}
            options={OPTIONS}
            value={value}
        />
    );
}

export { OPTIONS as CHART_TYPE_OPTIONS };
