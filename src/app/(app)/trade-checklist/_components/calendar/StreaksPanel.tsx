'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/card';
import { computeStreaks, type LightAssessment } from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

export function StreaksPanel({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const stats = useMemo(() => computeStreaks(assessments), [assessments]);

    const tiles = [
        {
            cls: stats.currentWin > 0 ? 'text-success' : '',
            hint: 'current win run',
            label: 'Win streak',
            value: String(stats.currentWin),
        },
        {
            cls: stats.currentLoss > 0 ? 'text-destructive' : '',
            hint: 'current loss run',
            label: 'Loss streak',
            value: String(stats.currentLoss),
        },
        {
            cls: 'text-success',
            hint: 'best ever',
            label: 'Longest win',
            value: String(stats.bestWin),
        },
        {
            cls: 'text-destructive',
            hint: 'worst ever',
            label: 'Longest loss',
            value: String(stats.bestLoss),
        },
        {
            cls: stats.consecutiveTradingDays > 0 ? 'text-warning' : '',
            hint: 'weekdays in a row',
            label: 'Trading days',
            value: String(stats.consecutiveTradingDays),
        },
    ];

    return (
        <div
            className={cn(
                'app-trade-checklist__streaks-panel',
                'grid grid-cols-2 gap-3 md:grid-cols-5',
            )}
        >
            {tiles.map((t) => (
                <Card className="p-4" key={t.label}>
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                        {t.label}
                    </p>
                    <p
                        className={cn(
                            'mt-1 font-mono text-2xl font-bold text-foreground',
                            t.cls,
                        )}
                    >
                        {t.value}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.hint}
                    </p>
                </Card>
            ))}
        </div>
    );
}
