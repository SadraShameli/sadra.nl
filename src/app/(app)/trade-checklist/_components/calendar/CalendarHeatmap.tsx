'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { routes, withQuery } from '~/lib/site/routes';
import { dayCellGrid, type LightAssessment } from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarHeatmapProperties {
    assessments: LightAssessment[];
    month: string;
}

export function CalendarHeatmap({
    assessments,
    month,
}: CalendarHeatmapProperties) {
    const weeks = useMemo(
        () => dayCellGrid(month, assessments),
        [month, assessments],
    );

    return (
        <div
            className={cn(
                'app-trade-checklist__calendar-heatmap',
                'flex flex-col gap-2',
            )}
        >
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {DAY_LABELS.map((d) => (
                    <div className="py-1" key={d}>
                        {d}
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-1">
                {weeks.map((week, wi) => (
                    <div className="grid grid-cols-7 gap-1" key={wi}>
                        {week.map((cell) => {
                            const dayNumber = Number(
                                cell.date.split('-', 3)[2],
                            );
                            const isClickable = cell.total > 0;
                            const inner = (
                                <div
                                    className={cn(
                                        'flex h-20 flex-col gap-1 rounded-md border p-1.5 text-xs transition',
                                        cellTone(cell.bestGrade, cell.total),
                                        !cell.inMonth && 'opacity-30',
                                        isClickable &&
                                            cell.inMonth &&
                                            'hover:scale-[1.02]',
                                    )}
                                >
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {dayNumber}
                                        </span>
                                        {cell.bestGrade && (
                                            <span className="font-serif text-xs font-medium text-foreground">
                                                {cell.bestGrade}
                                            </span>
                                        )}
                                    </div>
                                    {cell.total > 0 && (
                                        <div className="mt-auto flex flex-wrap items-center justify-between gap-1">
                                            <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                                                {cell.total} trade
                                                {cell.total === 1 ? '' : 's'}
                                            </span>
                                            <div className="flex flex-wrap gap-0.5">
                                                {Array.from(
                                                    { length: cell.wins },
                                                    (_, index) => (
                                                        <span
                                                            className="size-1.5 rounded-full bg-success"
                                                            key={`w${index}`}
                                                        />
                                                    ),
                                                )}
                                                {Array.from(
                                                    { length: cell.losses },
                                                    (_, index) => (
                                                        <span
                                                            className="size-1.5 rounded-full bg-destructive"
                                                            key={`l${index}`}
                                                        />
                                                    ),
                                                )}
                                                {Array.from(
                                                    {
                                                        length: cell.breakevens,
                                                    },
                                                    (_, index) => (
                                                        <span
                                                            className="size-1.5 rounded-full bg-warning"
                                                            key={`b${index}`}
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                            return isClickable && cell.inMonth ? (
                                <Link
                                    className={cn(
                                        'app-trade-checklist__calendar-day-link',
                                    )}
                                    href={withQuery(
                                        routes.tradeChecklist.journal,
                                        { date: cell.date },
                                    )}
                                    key={cell.date}
                                >
                                    {inner}
                                </Link>
                            ) : (
                                <div key={cell.date}>{inner}</div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function cellTone(bestGrade: null | string, total: number): string {
    if (total === 0 || !bestGrade) return 'bg-card/30 border-border/20';
    if (bestGrade.startsWith('A')) return 'bg-success/20 border-success/40';
    if (bestGrade.startsWith('B')) return 'bg-warning/20 border-warning/40';
    return bestGrade.startsWith('C')
        ? 'bg-warning/20 border-warning/40'
        : 'bg-destructive/20 border-destructive/40';
}
