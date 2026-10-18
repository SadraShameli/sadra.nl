'use client';

import type { DailyPreparationRow } from '~/lib/schemas/tradingRows';

import { Button } from '~/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import { formatDisplayDate } from '~/lib/format';
import { cn } from '~/lib/utilities';

interface PrepHistoryStripProperties {
    history: DailyPreparationRow[];
    onSelect: (date: string) => void;
    selectedDate: string;
    today: string;
    todayRow: DailyPreparationRow | null;
}

export function PrepHistoryStrip({
    history,
    onSelect,
    selectedDate,
    today,
}: PrepHistoryStripProperties) {
    const map = new Map(history.map((h) => [h.date, h]));
    const days = lastDays(today, 30).toReversed();

    return (
        <div
            className={cn(
                'app-trade-checklist__prep-history-strip',
                'grid grid-cols-6 gap-1.5 sm:grid-cols-10 md:grid-cols-15 lg:grid-cols-30',
            )}
        >
            {days.map((d) => {
                const row = map.get(d) ?? null;
                const score = row?.score ?? null;
                const dayNumber = Number(d.split('-', 3)[2]);
                const isToday = d === today;
                const isSelected = d === selectedDate;
                const dayLabel = formatDisplayDate(d);
                return (
                    <Tooltip key={d}>
                        <TooltipTrigger asChild>
                            <Button
                                aria-label={`${dayLabel}: ${score === null ? 'no prep' : `${score.toFixed(0)}%`}`}
                                aria-pressed={isSelected}
                                className={cn(
                                    'app-trade-checklist__prep-history-day',
                                    'aspect-square h-auto w-full rounded-xl border p-0 font-mono text-xs',
                                    scoreTone(score),
                                    isSelected && 'ring-2 ring-foreground',
                                    isToday &&
                                        !isSelected &&
                                        'ring-1 ring-foreground/50',
                                )}
                                data-state={isSelected ? 'selected' : 'idle'}
                                onClick={() => onSelect(d)}
                                type="button"
                                variant="ghost"
                            >
                                {dayNumber}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {dayLabel} ·{' '}
                            {score === null
                                ? 'no prep'
                                : `${score.toFixed(0)}%`}
                        </TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}

function lastDays(today: string, count: number): string[] {
    const out: string[] = [];
    const parts = today.split('-').map(Number);
    const y = parts[0] ?? 1970;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const cursor = new Date(Date.UTC(y, m - 1, d));
    for (let index = 0; index < count; index++) {
        const yy = cursor.getUTCFullYear();
        const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getUTCDate()).padStart(2, '0');
        out.push(`${yy}-${mm}-${dd}`);
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return out;
}

function scoreTone(score: null | number): string {
    if (score === null)
        return 'bg-card/40 border-border/20 text-muted-foreground';
    if (score >= 86) return 'bg-success/25 border-success/50 text-success';
    if (score >= 57) return 'bg-success/10 border-success/30 text-success';
    return score >= 29
        ? 'bg-warning/25 border-warning/50 text-warning'
        : 'bg-destructive/25 border-destructive/50 text-destructive';
}
