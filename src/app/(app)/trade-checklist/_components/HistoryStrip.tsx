'use client';

import { formatDistanceToNow } from 'date-fns';
import { ClipboardList, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { Grade, TradeAssessmentRow } from '~/lib/trading/types';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import { cn } from '~/lib/utilities';

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

const SORT_OPTIONS: { label: string; value: SortMode }[] = [
    { label: 'Newest', value: 'newest' },
    { label: 'Oldest', value: 'oldest' },
    { label: 'Grade', value: 'grade' },
];

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
            <EmptyState
                description="Grade a setup to start your history."
                icon={ClipboardList}
                title="No assessments yet"
            />
        );
    }

    const rows = sortedRows(history, sortMode);

    return (
        <div className={cn('app-trade-checklist__history-strip')}>
            <div className="flex items-center gap-1 border-b border-border/40 px-4 py-2">
                <ToggleGroup
                    onValueChange={(v) => {
                        if (v) setSortMode(v as SortMode);
                    }}
                    size="sm"
                    type="single"
                    value={sortMode}
                    variant="outline"
                >
                    {SORT_OPTIONS.map((o) => (
                        <ToggleGroupItem
                            className="h-7 px-2 text-xs"
                            key={o.value}
                            value={o.value}
                        >
                            {o.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>
            <ul
                className={cn(
                    'app-trade-checklist__history-list',
                    'divide-y divide-border/40',
                )}
            >
                {rows.map((row) => {
                    const out = row.outcome ? outcomeBadge[row.outcome] : null;
                    return (
                        <li
                            className="flex items-center gap-2 px-4 py-3"
                            key={row.id}
                        >
                            <Button
                                className={cn(
                                    'app-trade-checklist__history-item',
                                    'h-auto min-w-0 flex-1 justify-start p-0 text-left font-normal',
                                )}
                                onClick={() => onSelect(row)}
                                type="button"
                                variant="ghost"
                            >
                                <div className="flex flex-col items-start">
                                    <div className="flex items-baseline gap-2">
                                        <span
                                            className={cn(
                                                'font-orbitron text-sm font-bold',
                                                gradeColor[
                                                    row.grade as Grade
                                                ] ?? 'text-white',
                                            )}
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
                                                {typeof row.outcomeR ===
                                                    'number' &&
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
                                </div>
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        aria-label="Delete assessment"
                                        className="size-7 shrink-0"
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <Trash2 className="size-3.5 text-muted-foreground" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Delete assessment?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This grade and outcome will be
                                            removed permanently.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => onDelete(row.id)}
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
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
