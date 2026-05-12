'use client';

import { formatDistanceToNow } from 'date-fns';

import { Badge } from '~/components/ui/Badge';
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
    D: 'text-rose-400',
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

export function HistoryStrip({ history }: { history: TradeAssessmentRow[] }) {
    if (history.length === 0) {
        return (
            <div className="p-4 text-center text-xs text-muted-foreground">
                No assessments yet.
            </div>
        );
    }

    return (
        <ul className="divide-y divide-border/40">
            {history.map((row) => {
                const out = row.outcome ? outcomeBadge[row.outcome] : null;
                return (
                    <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                        <div className="min-w-0 flex-1">
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
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(row.createdAt), {
                                    addSuffix: true,
                                })}
                            </p>
                        </div>
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
                    </li>
                );
            })}
        </ul>
    );
}
