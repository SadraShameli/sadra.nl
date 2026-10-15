'use client';

import { type DateRange } from 'react-day-picker';

import { FilterDateRange } from '~/components/ui/FilterDateRange';
import { FilterSelect } from '~/components/ui/FilterSelect';
import { PR_KIND_VALUES } from '~/lib/lifting/types';

export const PR_KIND_ALL = '__all__';

const PR_RANGE_VALUES = ['all', '7', '30', '90', '365'] as const;
export type PrRange = (typeof PR_RANGE_VALUES)[number];
const PR_RANGE_LABEL: Record<PrRange, string> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
    all: 'All time',
};

export type PrFiltersToolbarProperties = {
    customRange: DateRange | undefined;
    kind: string;
    onCustomRangeChange: (range: DateRange | undefined) => void;
    onKindChange: (kind: string) => void;
    onRangeChange: (range: PrRange) => void;
    range: PrRange;
};

export function PrFiltersToolbar({
    customRange,
    kind,
    onCustomRangeChange,
    onKindChange,
    onRangeChange,
    range,
}: PrFiltersToolbarProperties) {
    return (
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
            <FilterSelect
                label="PR kind"
                onValueChange={(v) => onKindChange(v ?? PR_KIND_ALL)}
                options={PR_KIND_VALUES.map((k) => ({
                    label: (
                        <span className="capitalize">
                            {k.replaceAll('_', ' ')}
                        </span>
                    ),
                    value: k,
                }))}
                placeholder="All kinds"
                value={kind === PR_KIND_ALL ? undefined : kind}
            />
            <FilterSelect
                label="PR period"
                onValueChange={(v) =>
                    onRangeChange(PR_RANGE_VALUES.find((r) => r === v) ?? 'all')
                }
                options={PR_RANGE_VALUES.filter((r) => r !== 'all').map(
                    (r) => ({ label: PR_RANGE_LABEL[r], value: r }),
                )}
                placeholder={PR_RANGE_LABEL.all}
                value={customRange || range === 'all' ? undefined : range}
            />
            <FilterDateRange
                align="end"
                label="PR date"
                onChange={onCustomRangeChange}
                placeholder="Custom range"
                value={customRange}
            />
        </div>
    );
}
