'use client';

import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import {
    PR_KIND_ALL,
    PR_RANGE_PRESETS,
    PrFilters,
    PrRangePreset,
} from '~/lib/lifting/pr-filters';
import { PR_KIND_VALUES } from '~/lib/lifting/types';

import type { PrFiltersControls } from './usePrFilters';

import { PR_KIND_LABEL } from './prKindLabel';

export type PrFiltersToolbarProperties = {
    filters: PrFiltersControls;
};

export function PrFiltersToolbar({ filters }: PrFiltersToolbarProperties) {
    const { customRange, kind, range } = filters;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
                label="PR kind"
                onValueChange={(v) => filters.setKind(PrFilters.kindFor(v))}
                options={PR_KIND_VALUES.map((k) => ({
                    label: PR_KIND_LABEL[k],
                    value: k,
                }))}
                placeholder="All kinds"
                value={kind === PR_KIND_ALL ? undefined : kind}
            />
            <FilterSelect
                label="PR period"
                onValueChange={(v) => filters.setRange(PrFilters.presetFor(v))}
                options={PR_RANGE_PRESETS.filter(
                    (r) => r !== PrRangePreset.All,
                ).map((r) => ({ label: PrFilters.preset(r).label, value: r }))}
                placeholder={PrFilters.preset(PrRangePreset.All).label}
                value={
                    customRange || range === PrRangePreset.All
                        ? undefined
                        : range
                }
            />
            <FilterDateRange
                align="end"
                label="PR date"
                onChange={filters.setCustomRange}
                placeholder="Custom range"
                value={customRange}
            />
        </div>
    );
}
