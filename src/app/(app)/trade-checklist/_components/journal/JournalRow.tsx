'use client';

import { gradeTextClass } from '~/app/(app)/trade-checklist/_components/GradeTone';
import { Badge } from '~/components/ui/Badge';

const outcomeMeta: Record<
    string,
    {
        label: string;
        variant: 'default' | 'destructive' | 'outline' | 'secondary';
    }
> = {
    breakeven: { label: 'BE', variant: 'secondary' },
    loss: { label: 'L', variant: 'destructive' },
    'no-trade': { label: '-', variant: 'outline' },
    win: { label: 'W', variant: 'default' },
};

export interface JournalRowData {
    createdAt: Date | string;
    grade: string;
    id: string;
    mentalFlags: string[];
    notesSnippet: string;
    outcome: null | string;
    outcomeR: null | number;
    score: number;
    windowLabel: null | string;
}

export function JournalRowBody({ row }: { row: JournalRowData }) {
    const out = row.outcome ? outcomeMeta[row.outcome] : null;
    return (
        <div className="flex items-start gap-3">
            <div className="flex w-14 flex-col items-center">
                <span
                    className={`font-orbitron text-lg font-bold ${gradeTextClass(row.grade)}`}
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
                        <Badge variant="outline">{row.windowLabel}</Badge>
                    )}
                    {row.mentalFlags.map((f) => (
                        <Badge key={f} variant="warning">
                            {f === 'revengeOrFomo' ? 'revenge' : f}
                        </Badge>
                    ))}
                </div>
                {row.notesSnippet && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                        {row.notesSnippet}
                    </p>
                )}
            </div>
        </div>
    );
}
