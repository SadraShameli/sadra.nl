import { endOfDay, startOfDay, subDays } from 'date-fns';

import { PR_KIND_VALUES, type PrKind } from '~/lib/lifting/types';

export const PR_KIND_ALL = '__all__';

export type PrKindFilter = PrKind | typeof PR_KIND_ALL;

export const PrRangePreset = {
    All: 'all',
    Days7: '7',
    Days30: '30',
    Days90: '90',
    Days365: '365',
} as const;

export type PrRangePreset = (typeof PrRangePreset)[keyof typeof PrRangePreset];

export interface PrRangePresetDefinition {
    days: null | number;
    label: string;
}

const PR_RANGE_PRESET_DEFINITIONS: Record<
    PrRangePreset,
    PrRangePresetDefinition
> = {
    [PrRangePreset.All]: { days: null, label: 'All time' },
    [PrRangePreset.Days7]: { days: 7, label: 'Last 7 days' },
    [PrRangePreset.Days30]: { days: 30, label: 'Last 30 days' },
    [PrRangePreset.Days90]: { days: 90, label: 'Last 90 days' },
    [PrRangePreset.Days365]: { days: 365, label: 'Last year' },
};

export const PR_RANGE_PRESETS: readonly PrRangePreset[] = [
    PrRangePreset.All,
    PrRangePreset.Days7,
    PrRangePreset.Days30,
    PrRangePreset.Days90,
    PrRangePreset.Days365,
];

export interface FilterablePr {
    achievedAt: Date | string;
    kind: string;
}

export interface PrDateRange {
    from: Date | undefined;
    to?: Date | undefined;
}

export interface PrFilterCriteria {
    customRange: PrDateRange | undefined;
    kind: PrKindFilter;
    range: PrRangePreset;
}

export const PR_FILTER_DEFAULTS: PrFilterCriteria = {
    customRange: undefined,
    kind: PR_KIND_ALL,
    range: PrRangePreset.All,
};

export const PrFilters = {
    filter<T extends FilterablePr>(
        rows: readonly T[],
        criteria: PrFilterCriteria,
        now: Date,
    ): T[] {
        const byKind =
            criteria.kind === PR_KIND_ALL
                ? [...rows]
                : rows.filter((pr) => pr.kind === criteria.kind);
        const customFrom = criteria.customRange?.from;
        if (customFrom) {
            const from = startOfDay(customFrom);
            const to = endOfDay(criteria.customRange?.to ?? customFrom);
            return byKind.filter((pr) => {
                const achievedAt = new Date(pr.achievedAt);
                return achievedAt >= from && achievedAt <= to;
            });
        }
        const days = PrFilters.preset(criteria.range).days;
        if (days === null) return byKind;
        const since = subDays(now, days);
        return byKind.filter((pr) => new Date(pr.achievedAt) >= since);
    },

    isActive(criteria: PrFilterCriteria): boolean {
        return (
            criteria.range !== PrRangePreset.All ||
            Boolean(criteria.customRange?.from) ||
            criteria.kind !== PR_KIND_ALL
        );
    },

    kindFor(value: string | undefined): PrKindFilter {
        return PR_KIND_VALUES.find((kind) => kind === value) ?? PR_KIND_ALL;
    },

    preset(value: PrRangePreset): PrRangePresetDefinition {
        return PR_RANGE_PRESET_DEFINITIONS[value];
    },

    presetFor(value: string | undefined): PrRangePreset {
        return (
            PR_RANGE_PRESETS.find((preset) => preset === value) ??
            PrRangePreset.All
        );
    },
};
