'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { formatPercent, formatR } from '~/lib/format';
import {
    computeStreaks,
    expectancyR,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

export function KpiTiles({ assessments }: { assessments: LightAssessment[] }) {
    const stats = useMemo(() => {
        const exp = expectancyR(assessments);
        const streak = computeStreaks(assessments);
        const cumR = assessments
            .filter(
                (a) =>
                    a.outcomeR !== null &&
                    Number.isFinite(a.outcomeR) &&
                    a.outcome !== null &&
                    ['breakeven', 'loss', 'win'].includes(a.outcome),
            )
            .reduce((s, a) => s + (a.outcomeR ?? 0), 0);
        return {
            cumR,
            currentLoss: streak.currentLoss,
            currentWin: streak.currentWin,
            expectancy: exp.avgR,
            sample: exp.sample,
            total: assessments.length,
            winRate: exp.winRate,
        };
    }, [assessments]);

    const tiles = [
        {
            hint: `${stats.sample} with outcomes`,
            label: 'Trades graded',
            value: String(stats.total),
        },
        {
            hint: `n=${stats.sample}`,
            label: 'Win rate',
            value: stats.sample > 0 ? formatPercent(stats.winRate, 0) : '—',
        },
        {
            cls:
                stats.cumR > 0
                    ? 'text-emerald-400'
                    : stats.cumR < 0
                      ? 'text-rose-400'
                      : '',
            hint: 'across all graded outcomes',
            label: 'Cumulative R',
            value: stats.sample > 0 ? formatR(stats.cumR, 1) : '—',
        },
        {
            cls:
                stats.currentWin > 0
                    ? 'text-emerald-400'
                    : stats.currentLoss > 0
                      ? 'text-rose-400'
                      : '',
            hint:
                stats.currentWin > 0
                    ? 'win streak'
                    : stats.currentLoss > 0
                      ? 'loss streak'
                      : 'no streak',
            label: 'Current streak',
            value:
                stats.currentWin > 0
                    ? String(stats.currentWin)
                    : stats.currentLoss > 0
                      ? String(stats.currentLoss)
                      : '0',
        },
        {
            cls:
                stats.expectancy > 0
                    ? 'text-emerald-400'
                    : stats.expectancy < 0
                      ? 'text-rose-400'
                      : '',
            hint: 'avg R per graded trade',
            label: 'Expectancy',
            value: stats.sample > 0 ? formatR(stats.expectancy) : '—',
        },
    ];

    return (
        <div
            className={cn(
                'app-trade-checklist__kpi-tiles',
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
                            'mt-1 font-mono text-2xl font-bold text-white',
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
