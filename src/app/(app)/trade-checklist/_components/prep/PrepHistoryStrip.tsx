'use client';

import type { DailyPreparationRow } from '~/lib/schemas/trading';

import { cn } from '~/lib/utils';

interface PrepHistoryStripProps {
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
}: PrepHistoryStripProps) {
    const map = new Map(history.map((h) => [h.date, h]));
    const days = lastDays(today, 30).toReversed();

    return (
        <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-15 md:grid-cols-30">
            {days.map((d) => {
                const row = map.get(d) ?? null;
                const score = row?.score ?? null;
                const dayNum = Number(d.split('-')[2]);
                const isToday = d === today;
                const isSelected = d === selectedDate;
                return (
                    <button
                        className={cn(
                            'flex aspect-square flex-col items-center justify-center rounded-md border text-xs transition',
                            scoreTone(score),
                            isSelected && 'ring-2 ring-foreground',
                            isToday &&
                                !isSelected &&
                                'ring-1 ring-foreground/50',
                        )}
                        key={d}
                        onClick={() => onSelect(d)}
                        title={`${d}${score === null ? ' · no prep' : ` · ${score.toFixed(0)}%`}`}
                        type="button"
                    >
                        <span className="font-mono">{dayNum}</span>
                    </button>
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
    for (let i = 0; i < count; i++) {
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
    if (score >= 86)
        return 'bg-emerald-500/25 border-emerald-500/50 text-emerald-200';
    if (score >= 57) return 'bg-lime-500/25 border-lime-500/50 text-lime-200';
    if (score >= 29)
        return 'bg-amber-500/25 border-amber-500/50 text-amber-200';
    return 'bg-rose-500/25 border-rose-500/50 text-rose-200';
}
