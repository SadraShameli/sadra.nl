'use client';

import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { type DateRange } from 'react-day-picker';

import Eyebrow from '~/components/Eyebrow';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DateRangePicker } from '~/components/ui/DatePicker';
import { Input } from '~/components/ui/Input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import { OUTCOME_VALUES, SETUP_TYPE_VALUES } from '~/lib/trading/types';
import { cn } from '~/lib/utilities';

export interface JournalFilterState {
    dateFrom: null | string;
    dateTo: null | string;
    grades: string[];
    mentalFlags: (
        'boredomHunt' | 'distracted' | 'hesitation' | 'revengeOrFomo'
    )[];
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

const MENTAL_FLAG_OPTIONS: {
    key: JournalFilterState['mentalFlags'][number];
    label: string;
}[] = [
    { key: 'hesitation', label: 'Hesitation' },
    { key: 'distracted', label: 'Distracted' },
    { key: 'revengeOrFomo', label: 'Revenge/FOMO' },
    { key: 'boredomHunt', label: 'Boredom' },
];

interface ChipRowProperties<T extends string> {
    label: string;
    onChange: (v: T[]) => void;
    options: { key: T; label: string }[];
    selected: T[];
}

interface JournalFiltersProperties {
    onChange: (state: JournalFilterState) => void;
    onClear: () => void;
    plans: { id: string; name: string }[];
    rows: { planSnapshotWindows: { id: string; label: string }[] }[];
    state: JournalFilterState;
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
        return [...seen].map(([key, label]) => ({ key, label }));
    }, [rows]);

    const planOptions = plans.map((p) => ({ key: p.id, label: p.name }));

    const dateRange: DateRange | undefined = useMemo(() => {
        if (!state.dateFrom && !state.dateTo) return;
        const range: DateRange = {
            from: state.dateFrom ? parseISO(state.dateFrom) : undefined,
        };
        if (state.dateTo) range.to = parseISO(state.dateTo);
        return range;
    }, [state.dateFrom, state.dateTo]);

    const hasAny =
        state.grades.length > 0 ||
        state.outcomes.length > 0 ||
        state.windowIds.length > 0 ||
        state.setupTypes.length > 0 ||
        state.mentalFlags.length > 0 ||
        state.planIds.length > 0 ||
        (state.query !== null && state.query.length > 0) ||
        state.dateFrom !== null ||
        state.dateTo !== null ||
        state.singleDate !== null;

    return (
        <div
            className={cn(
                'app-trade-checklist__journal-filters',
                'flex flex-col gap-4 rounded-lg border border-border/40 bg-card/60 p-4',
            )}
        >
            <div className="grid items-center gap-3 md:grid-cols-[1fr_auto]">
                <Input
                    onChange={(event) =>
                        onChange({
                            ...state,
                            query: event.target.value || null,
                        })
                    }
                    placeholder="Search notes…"
                    value={state.query ?? ''}
                />
                <DateRangePicker
                    onChange={(range) =>
                        onChange({
                            ...state,
                            dateFrom: range?.from
                                ? format(range.from, 'yyyy-MM-dd')
                                : null,
                            dateTo: range?.to
                                ? format(range.to, 'yyyy-MM-dd')
                                : null,
                            singleDate: null,
                        })
                    }
                    placeholder="Filter by date"
                    value={dateRange}
                />
            </div>

            <ChipRow
                label="Grade"
                onChange={(grades) => onChange({ ...state, grades })}
                options={GRADES.map((g) => ({ key: g, label: g }))}
                selected={state.grades}
            />

            <ChipRow
                label="Outcome"
                onChange={(outcomes) => onChange({ ...state, outcomes })}
                options={OUTCOME_VALUES.map((o) => ({
                    key: o,
                    label:
                        o === 'no-trade'
                            ? 'Skipped'
                            : o.charAt(0).toUpperCase() + o.slice(1),
                }))}
                selected={state.outcomes}
            />

            <ChipRow
                label="Mental flag"
                onChange={(mentalFlags) => onChange({ ...state, mentalFlags })}
                options={MENTAL_FLAG_OPTIONS}
                selected={state.mentalFlags}
            />

            <ChipRow
                label="Setup type"
                onChange={(setupTypes) => onChange({ ...state, setupTypes })}
                options={SETUP_TYPE_VALUES.map((s) => ({
                    key: s,
                    label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
                selected={state.setupTypes}
            />

            {windowOptions.length > 0 && (
                <ChipRow
                    label="Window"
                    onChange={(windowIds) => onChange({ ...state, windowIds })}
                    options={windowOptions}
                    selected={state.windowIds}
                />
            )}

            {planOptions.length > 1 && (
                <ChipRow
                    label="Plan"
                    onChange={(planIds) => onChange({ ...state, planIds })}
                    options={planOptions}
                    selected={state.planIds}
                />
            )}

            <ClearFiltersButton active={hasAny} onReset={onClear} />
        </div>
    );
}

function ChipRow<T extends string>({
    label,
    onChange,
    options,
    selected,
}: ChipRowProperties<T>) {
    return (
        <div className="flex flex-col gap-1">
            <Eyebrow as="span">{label}</Eyebrow>
            <ToggleGroup
                className="flex flex-wrap justify-start gap-1.5"
                onValueChange={(value: string[]) => onChange(value as T[])}
                size="sm"
                type="multiple"
                value={selected}
                variant="outline"
            >
                {options.map((o) => (
                    <ToggleGroupItem
                        className="rounded-full"
                        key={o.key}
                        value={o.key}
                    >
                        {o.label}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
}
