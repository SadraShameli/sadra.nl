'use client';

import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { Grade, TradeAssessmentRow } from '~/lib/trading-types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';

const gradeColor: Partial<Record<Grade, string>> = {
    A: 'text-emerald-400',
    'A+': 'text-emerald-400',
    'A-': 'text-emerald-300',
    B: 'text-amber-300',
    'B+': 'text-emerald-300',
    'B-': 'text-amber-300',
    C: 'text-orange-400',
    'C+': 'text-amber-400',
    'C-': 'text-orange-400',
    D: 'text-rose-500',
    F: 'text-rose-500',
};

const outcomeBadge: Record<
    string,
    {
        label: string;
        variant: 'default' | 'destructive' | 'outline' | 'secondary';
    }
> = {
    breakeven: { label: 'BE', variant: 'secondary' },
    loss: { label: 'L', variant: 'destructive' },
    'no-trade': { label: '—', variant: 'outline' },
    win: { label: 'W', variant: 'default' },
};

const GRADE_ORDER: Partial<Record<string, number>> = {
    A: 1,
    'A+': 0,
    'A-': 2,
    B: 4,
    'B+': 3,
    'B-': 5,
    C: 7,
    'C+': 6,
    'C-': 8,
    D: 9,
    F: 10,
};

type SortMode = 'grade' | 'newest' | 'oldest';

export function HistoryStrip({
    history,
    onDelete,
    onSelect,
}: {
    history: TradeAssessmentRow[];
    onDelete: (id: string) => void;
    onSelect: (row: TradeAssessmentRow) => void;
}) {
    const [sortMode, setSortMode] = useState<SortMode>('newest');

    if (history.length === 0) {
        return (
            <div className="p-4 text-center text-xs text-muted-foreground">
                No assessments yet.
            </div>
        );
    }

    const rows = sortedRows(history, sortMode);

    return (
        <div>
            <div className="flex items-center gap-1 border-b border-border/40 px-4 py-2">
                {(['newest', 'oldest', 'grade'] as SortMode[]).map((m) => (
                    <button
                        className={`rounded px-2 py-0.5 text-xs transition ${
                            sortMode === m
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                        key={m}
                        onClick={() => setSortMode(m)}
                        type="button"
                    >
                        {m === 'newest'
                            ? 'Newest'
                            : m === 'oldest'
                              ? 'Oldest'
                              : 'Grade'}
                    </button>
                ))}
            </div>
            <ul className="divide-y divide-border/40">
                {rows.map((row) => {
                    const out = row.outcome ? outcomeBadge[row.outcome] : null;
                    return (
                        <li
                            className="flex items-center gap-2 px-4 py-3"
                            key={row.id}
                        >
                            <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onSelect(row)}
                                type="button"
                            >
                                <div className="flex items-baseline gap-2">
                                    <span
                                        className={`font-orbitron text-sm font-bold ${
                                            gradeColor[row.grade as Grade] ??
                                            'text-white'
                                        }`}
                                    >
                                        {row.grade}
                                    </span>
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {row.score.toFixed(0)}
                                    </span>
                                    {out && (
                                        <Badge
                                            className="font-mono text-xs"
                                            variant={out.variant}
                                        >
                                            {out.label}
                                            {typeof row.outcomeR === 'number' &&
                                                ` ${row.outcomeR > 0 ? '+' : ''}${row.outcomeR.toFixed(1)}R`}
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {formatDistanceToNow(
                                        new Date(row.createdAt),
                                        { addSuffix: true },
                                    )}
                                </p>
                            </button>
                            <Button
                                className="size-7 shrink-0"
                                onClick={() => onDelete(row.id)}
                                size="icon"
                                type="button"
                                variant="ghost"
                            >
                                <Trash2 className="size-3.5 text-muted-foreground" />
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function sortedRows(
    history: TradeAssessmentRow[],
    mode: SortMode,
): TradeAssessmentRow[] {
    if (mode === 'oldest') return history.toReversed();
    if (mode === 'grade') {
        return history.toSorted((a, b) => {
            const ga = GRADE_ORDER[a.grade] ?? 99;
            const gb = GRADE_ORDER[b.grade] ?? 99;
            if (ga !== gb) return ga - gb;
            return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
        });
    }
    return history;
}
