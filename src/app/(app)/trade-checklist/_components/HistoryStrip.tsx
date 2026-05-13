'use client';

import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import type { Grade, TradeAssessmentRow } from '~/lib/trading-types';

const gradeColor: Partial<Record<Grade, string>> = {
    'A+': 'text-emerald-400',
    A: 'text-emerald-400',
    'A-': 'text-emerald-300',
    'B+': 'text-emerald-300',
    B: 'text-amber-300',
    'B-': 'text-amber-300',
    'C+': 'text-amber-400',
    C: 'text-orange-400',
    'C-': 'text-orange-400',
    D: 'text-rose-500',
    F: 'text-rose-500',
};

const outcomeBadge: Record<
    string,
    {
        label: string;
        variant: 'default' | 'secondary' | 'destructive' | 'outline';
    }
> = {
    win: { label: 'W', variant: 'default' },
    loss: { label: 'L', variant: 'destructive' },
    breakeven: { label: 'BE', variant: 'secondary' },
    'no-trade': { label: '—', variant: 'outline' },
};

const GRADE_ORDER: Partial<Record<string, number>> = {
    'A+': 0,
    A: 1,
    'A-': 2,
    'B+': 3,
    B: 4,
    'B-': 5,
    'C+': 6,
    C: 7,
    'C-': 8,
    D: 9,
    F: 10,
};

type SortMode = 'newest' | 'oldest' | 'grade';

function sortedRows(
    history: TradeAssessmentRow[],
    mode: SortMode,
): TradeAssessmentRow[] {
    if (mode === 'oldest') return [...history].reverse();
    if (mode === 'grade') {
        return [...history].sort((a, b) => {
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

export function HistoryStrip({
    history,
    onSelect,
    onDelete,
}: {
    history: TradeAssessmentRow[];
    onSelect: (row: TradeAssessmentRow) => void;
    onDelete: (id: string) => void;
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
                        key={m}
                        type="button"
                        onClick={() => setSortMode(m)}
                        className={`rounded px-2 py-0.5 text-xs transition ${
                            sortMode === m
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
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
                            key={row.id}
                            className="flex items-center gap-2 px-4 py-3"
                        >
                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => onSelect(row)}
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
                                            variant={out.variant}
                                            className="font-mono text-xs"
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
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={() => onDelete(row.id)}
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
