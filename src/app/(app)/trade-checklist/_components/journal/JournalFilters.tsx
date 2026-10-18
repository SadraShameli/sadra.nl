'use client';

import { useMemo } from 'react';

import {
    MENTAL_FLAG_LABEL,
    MENTAL_FLAGS,
    type MentalFlag,
    OUTCOME_LABEL,
} from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { FilterToolbar } from '~/components/FilterToolbar';
import { Badge } from '~/components/ui/badge';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { FilterIsoDateRange } from '~/components/ui/filter-iso-date-range';
import { FilterMultiSelect } from '~/components/ui/filter-multi-select';
import { Input } from '~/components/ui/input';
import { formatDisplayDate } from '~/lib/format';
import { OUTCOME_VALUES, SETUP_TYPE_VALUES } from '~/lib/trading/types';

export interface JournalFilterState {
    dateFrom: null | string;
    dateTo: null | string;
    grades: string[];
    mentalFlags: MentalFlag[];
    outcomes: string[];
    planIds: string[];
    query: null | string;
    setupTypes: string[];
    singleDate: null | string;
    windowIds: string[];
}

const GRADES = [
    'A+',
    'A',
    'A-',
    'B+',
    'B',
    'B-',
    'C+',
    'C',
    'C-',
    'D',
    'F',
] as const;

const GRADE_OPTIONS = GRADES.map((value) => ({ label: value, value }));

const OUTCOME_OPTIONS = OUTCOME_VALUES.map((value) => ({
    label: OUTCOME_LABEL[value],
    value,
}));

const MENTAL_FLAG_OPTIONS = MENTAL_FLAGS.map((value) => ({
    label: MENTAL_FLAG_LABEL[value],
    value,
}));

const SETUP_TYPE_OPTIONS = SETUP_TYPE_VALUES.map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
}));

interface JournalFiltersProperties {
    onChange: (state: JournalFilterState) => void;
    onClear: () => void;
    plans: { id: string; name: string }[];
    rows: { planSnapshotWindows: { id: string; label: string }[] }[];
    state: JournalFilterState;
}

export function isJournalFiltered(state: JournalFilterState): boolean {
    return (
        state.grades.length > 0 ||
        state.outcomes.length > 0 ||
        state.windowIds.length > 0 ||
        state.setupTypes.length > 0 ||
        state.mentalFlags.length > 0 ||
        state.planIds.length > 0 ||
        (state.query !== null && state.query.length > 0) ||
        state.dateFrom !== null ||
        state.dateTo !== null ||
        state.singleDate !== null
    );
}

export function JournalFilters({
    onChange,
    onClear,
    plans,
    rows,
    state,
}: JournalFiltersProperties) {
    const windowOptions = useMemo(() => {
        const seen = new Map<string, string>();
        for (const r of rows) {
            for (const w of r.planSnapshotWindows) {
                if (!seen.has(w.id)) seen.set(w.id, w.label);
            }
        }
        return [...seen].map(([value, label]) => ({ label, value }));
    }, [rows]);

    const planOptions = plans.map((p) => ({ label: p.name, value: p.id }));

    return (
        <FilterToolbar
            className="app-trade-checklist__journal-filters"
            label="Journal filters"
        >
            <FilterMultiSelect
                label="Grade"
                onChange={(grades) => onChange({ ...state, grades })}
                options={GRADE_OPTIONS}
                placeholder="All grades"
                selected={state.grades}
            />
            <FilterMultiSelect
                label="Outcome"
                onChange={(outcomes) => onChange({ ...state, outcomes })}
                options={OUTCOME_OPTIONS}
                placeholder="All outcomes"
                selected={state.outcomes}
            />
            <FilterMultiSelect
                label="Mental flag"
                onChange={(mentalFlags) => onChange({ ...state, mentalFlags })}
                options={MENTAL_FLAG_OPTIONS}
                placeholder="Any mental flag"
                selected={state.mentalFlags}
            />
            <FilterMultiSelect
                label="Setup type"
                onChange={(setupTypes) => onChange({ ...state, setupTypes })}
                options={SETUP_TYPE_OPTIONS}
                placeholder="All setup types"
                selected={state.setupTypes}
            />
            {windowOptions.length > 0 && (
                <FilterMultiSelect
                    label="Window"
                    onChange={(windowIds) => onChange({ ...state, windowIds })}
                    options={windowOptions}
                    placeholder="All windows"
                    selected={state.windowIds}
                />
            )}
            {planOptions.length > 1 && (
                <FilterMultiSelect
                    label="Plan"
                    onChange={(planIds) => onChange({ ...state, planIds })}
                    options={planOptions}
                    placeholder="All plans"
                    selected={state.planIds}
                />
            )}
            <FilterIsoDateRange
                label="Journal date"
                onChange={(range) =>
                    onChange({
                        ...state,
                        dateFrom: range.from,
                        dateTo: range.to,
                        singleDate: null,
                    })
                }
                placeholder="Filter by date"
                value={{ from: state.dateFrom, to: state.dateTo }}
            />
            {state.singleDate !== null && (
                <Badge>On {formatDisplayDate(state.singleDate)}</Badge>
            )}
            <Input
                aria-label="Search notes"
                className={SEARCH_FIELD_CLASS}
                onChange={(event) =>
                    onChange({
                        ...state,
                        query: event.target.value || null,
                    })
                }
                placeholder="Search notes…"
                value={state.query ?? ''}
            />
            <ClearFiltersButton
                active={isJournalFiltered(state)}
                onReset={onClear}
            />
        </FilterToolbar>
    );
}
