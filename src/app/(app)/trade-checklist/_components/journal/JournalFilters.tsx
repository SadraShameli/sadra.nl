'use client';

import { X } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { OUTCOME_VALUES, SETUP_TYPE_VALUES } from '~/lib/trading/types';
import { cn } from '~/lib/utils';

export interface JournalFilterState {
    dateFrom: null | string;
    dateTo: null | string;
    grades: string[];
    mentalFlags: (
        | 'boredomHunt'
        | 'distracted'
        | 'hesitation'
        | 'revengeOrFomo'
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

interface ChipRowProps<T extends string> {
    label: string;
    onChange: (v: T[]) => void;
    options: { key: T; label: string }[];
    selected: T[];
}

interface JournalFiltersProps {
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
}: JournalFiltersProps) {
    const windowOptions = useMemo(() => {
        const seen = new Map<string, string>();
        for (const r of rows) {
            for (const w of r.planSnapshotWindows) {
                if (!seen.has(w.id)) seen.set(w.id, w.label);
            }
        }
        return [...seen.entries()].map(([key, label]) => ({ key, label }));
    }, [rows]);

    const planOptions = plans.map((p) => ({ key: p.id, label: p.name }));

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
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <Input
                    onChange={(e) =>
                        onChange({
                            ...state,
                            query: e.target.value || null,
                        })
                    }
                    placeholder="Search notes…"
                    value={state.query ?? ''}
                />
                <div className="grid grid-cols-2 gap-3 md:contents">
                    <Input
                        aria-label="From"
                        onChange={(e) =>
                            onChange({
                                ...state,
                                dateFrom: e.target.value || null,
                                singleDate: null,
                            })
                        }
                        type="date"
                        value={state.dateFrom ?? ''}
                    />
                    <Input
                        aria-label="To"
                        onChange={(e) =>
                            onChange({
                                ...state,
                                dateTo: e.target.value || null,
                                singleDate: null,
                            })
                        }
                        type="date"
                        value={state.dateTo ?? ''}
                    />
                </div>
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

            {hasAny && (
                <div className="flex justify-end">
                    <Button
                        className="text-muted-foreground"
                        onClick={onClear}
                        size="sm"
                        variant="ghost"
                    >
                        <X className="mr-1 size-3.5" />
                        Clear filters
                    </Button>
                </div>
            )}
        </div>
    );
}

function ChipRow<T extends string>({
    label,
    onChange,
    options,
    selected,
}: ChipRowProps<T>) {
    const toggle = (key: T) => {
        if (selected.includes(key)) {
            onChange(selected.filter((s) => s !== key));
        } else {
            onChange([...selected, key]);
        }
    };
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs tracking-wider text-muted-foreground uppercase">
                {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                    <button
                        className={cn(
                            'rounded-full border px-2.5 py-1 text-xs transition',
                            selected.includes(o.key)
                                ? 'border-accent bg-accent text-foreground'
                                : 'border-border/40 text-muted-foreground hover:border-border',
                        )}
                        key={o.key}
                        onClick={() => toggle(o.key)}
                        type="button"
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
