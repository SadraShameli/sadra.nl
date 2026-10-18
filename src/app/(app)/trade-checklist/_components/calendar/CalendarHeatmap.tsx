'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { GradeTile } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { formatDisplayDate } from '~/lib/format';
import { routes, withQuery } from '~/lib/site/routes';
import {
    type DayCell,
    dayCellGrid,
    type LightAssessment,
} from '~/lib/trading/analytics';
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
                            const isTraded = cell.total > 0 && cell.inMonth;
                            const inner = (
                                <div
                                    className={cn(
                                        'flex h-12 flex-col justify-between gap-1 rounded-sm border p-1 transition-colors md:h-24 md:rounded-2xl md:p-2.5',
                                        isTraded
                                            ? 'border-line-strong bg-muted/40 group-hover:border-ink-muted/60 group-hover:bg-muted/60'
                                            : 'border-line',
                                        !cell.inMonth &&
                                            'border-transparent opacity-40',
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-1">
                                        <span
                                            className={cn(
                                                'font-mono text-xs tabular-nums',
                                                isTraded
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground',
                                            )}
                                        >
                                            {dayNumber}
                                        </span>
                                        {isTraded && (
                                            <span className="hidden text-xs text-muted-foreground lg:inline">
                                                {cell.total === 1
                                                    ? '1 trade'
                                                    : `${cell.total} trades`}
                                            </span>
                                        )}
                                    </div>
                                    {isTraded && (
                                        <div className="flex items-end justify-between gap-1">
                                            {cell.bestGrade !== null && (
                                                <GradeTile
                                                    className="size-6 rounded-md text-xs md:size-8 md:rounded-lg md:text-base"
                                                    grade={cell.bestGrade}
                                                />
                                            )}
                                            <span className="hidden font-mono text-xs text-muted-foreground tabular-nums md:inline">
                                                {tally(cell)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                            return isTraded ? (
                                <Link
                                    aria-label={`${formatDisplayDate(cell.date)}: ${cell.total === 1 ? '1 trade' : `${cell.total} trades`}`}
                                    className={cn(
                                        'app-trade-checklist__calendar-day-link',
                                        'group rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:rounded-2xl',
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

function tally(cell: DayCell): string {
    return [
        cell.wins > 0 ? `${cell.wins}W` : null,
        cell.losses > 0 ? `${cell.losses}L` : null,
        cell.breakevens > 0 ? `${cell.breakevens}BE` : null,
    ]
        .filter((part) => part !== null)
        .join(' ');
}
