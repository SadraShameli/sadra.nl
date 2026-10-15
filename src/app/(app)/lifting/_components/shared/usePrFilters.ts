'use client';

import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import {
    type FilterablePr,
    PR_FILTER_DEFAULTS,
    type PrFilterCriteria,
    PrFilters,
    type PrKindFilter,
    PrRangePreset,
} from '~/lib/lifting/pr-filters';

export interface PrFiltersControls {
    customRange: DateRange | undefined;
    isActive: boolean;
    kind: PrKindFilter;
    range: PrRangePreset;
    reset: () => void;
    setCustomRange: (range: DateRange | undefined) => void;
    setKind: (kind: PrKindFilter) => void;
    setRange: (range: PrRangePreset) => void;
}

export interface PrFiltersState<T> extends PrFiltersControls {
    filteredRows: T[];
}

export function usePrFilters<T extends FilterablePr>(
    rows: readonly T[] | undefined,
): PrFiltersState<T> {
    const [kind, setKind] = useState<PrKindFilter>(PR_FILTER_DEFAULTS.kind);
    const [range, setRangeState] = useState<PrRangePreset>(
        PR_FILTER_DEFAULTS.range,
    );
    const [customRange, setCustomRangeState] = useState<DateRange | undefined>(
        PR_FILTER_DEFAULTS.customRange,
    );

    const criteria = useMemo<PrFilterCriteria>(
        () => ({ customRange, kind, range }),
        [customRange, kind, range],
    );

    const filteredRows = useMemo(
        () => PrFilters.filter(rows ?? [], criteria, currentTime),
        [rows, criteria],
    );

    const setRange = (next: PrRangePreset) => {
        setRangeState(next);
        setCustomRangeState(undefined);
    };

    const setCustomRange = (next: DateRange | undefined) => {
        setCustomRangeState(next);
        if (next?.from) setRangeState(PrRangePreset.All);
    };

    const reset = () => {
        setRangeState(PR_FILTER_DEFAULTS.range);
        setCustomRangeState(PR_FILTER_DEFAULTS.customRange);
        setKind(PR_FILTER_DEFAULTS.kind);
    };

    return {
        customRange,
        filteredRows,
        isActive: PrFilters.isActive(criteria),
        kind,
        range,
        reset,
        setCustomRange,
        setKind,
        setRange,
    };
}

function currentTime(): Date {
    return new Date();
}
