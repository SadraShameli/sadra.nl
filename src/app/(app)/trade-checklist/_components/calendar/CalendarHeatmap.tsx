'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { routes, withQuery } from '~/lib/site/routes';
import { dayCellGrid, type LightAssessment } from '~/lib/trading/analytics';
import { cn } from '~/lib/utils';

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
                                            <span className="font-orbitron text-xs font-bold text-white">
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
                                                {Array.from({
                                                    length: cell.wins,
                                                }).map((_, index) => (
                                                    <span
                                                        className="size-1.5 rounded-full bg-emerald-400"
                                                        key={`w${index}`}
                                                    />
                                                ))}
                                                {Array.from({
                                                    length: cell.losses,
                                                }).map((_, index) => (
                                                    <span
                                                        className="size-1.5 rounded-full bg-rose-500"
                                                        key={`l${index}`}
                                                    />
                                                ))}
                                                {Array.from({
                                                    length: cell.breakevens,
                                                }).map((_, index) => (
                                                    <span
                                                        className="size-1.5 rounded-full bg-amber-400"
                                                        key={`b${index}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                            if (isClickable && cell.inMonth) {
                                return (
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
                                );
                            }
                            return <div key={cell.date}>{inner}</div>;
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function cellTone(bestGrade: null | string, total: number): string {
    if (total === 0 || !bestGrade) return 'bg-card/30 border-border/20';
    if (bestGrade.startsWith('A'))
        return 'bg-emerald-500/20 border-emerald-500/40';
    if (bestGrade.startsWith('B')) return 'bg-amber-500/20 border-amber-500/40';
    if (bestGrade.startsWith('C'))
        return 'bg-orange-500/20 border-orange-500/40';
    return 'bg-rose-500/20 border-rose-500/40';
}
