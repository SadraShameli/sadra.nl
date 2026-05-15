'use client';

import { formatDistanceToNow } from 'date-fns';

import type { Grade } from '~/lib/trading-types';

import { Badge } from '~/components/ui/Badge';
import { cn } from '~/lib/utils';

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

const outcomeMeta: Record<
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

interface JournalRowProps {
    onSelect: () => void;
    row: {
        createdAt: Date | string;
        grade: string;
        id: string;
        mentalFlags: string[];
        notesSnippet: string;
        outcome: null | string;
        outcomeR: null | number;
        score: number;
        windowLabel: null | string;
    };
}

export function JournalRow({ onSelect, row }: JournalRowProps) {
    const out = row.outcome ? outcomeMeta[row.outcome] : null;
    return (
        <li className={cn('app-trade-checklist__journal-row')}>
            <button
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/30"
                onClick={onSelect}
                type="button"
            >
                <div className="flex w-14 flex-col items-center">
                    <span
                        className={`font-orbitron text-lg font-bold ${
                            gradeColor[row.grade as Grade] ?? 'text-white'
                        }`}
                    >
                        {row.grade}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.score.toFixed(0)}
                    </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                        {row.windowLabel && (
                            <span className="rounded-full border border-border/40 px-2 py-0.5 text-xs text-muted-foreground">
                                {row.windowLabel}
                            </span>
                        )}
                        {row.mentalFlags.map((f) => (
                            <span
                                className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300"
                                key={f}
                            >
                                {f === 'revengeOrFomo' ? 'revenge' : f}
                            </span>
                        ))}
                    </div>
                    {row.notesSnippet && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                            {row.notesSnippet}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.createdAt), {
                            addSuffix: true,
                        })}
                    </p>
                </div>
            </button>
        </li>
    );
}
