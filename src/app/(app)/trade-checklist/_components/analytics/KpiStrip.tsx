'use client';

import { useMemo } from 'react';

import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { formatPercent, formatR } from '~/lib/format';
import {
    computeStreaks,
    expectancyR,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

export function KpiStrip({ assessments }: { assessments: LightAssessment[] }) {
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

    return (
        <StatStrip
            className="app-trade-checklist__kpi-strip"
            items={[
                {
                    caption: `${stats.sample} with outcomes`,
                    id: 'trades-graded',
                    label: 'Trades graded',
                    value: String(stats.total),
                },
                {
                    caption: `n=${stats.sample}`,
                    id: 'win-rate',
                    label: 'Win rate',
                    value:
                        stats.sample > 0
                            ? formatPercent(stats.winRate, 0)
                            : '-',
                },
                {
                    caption: 'across all graded outcomes',
                    id: 'cumulative-r',
                    label: 'Cumulative R',
                    value: (
                        <span className={signToneClass(stats.cumR)}>
                            {stats.sample > 0 ? formatR(stats.cumR, 1) : '-'}
                        </span>
                    ),
                },
                {
                    caption:
                        stats.currentWin > 0
                            ? 'win streak'
                            : stats.currentLoss > 0
                              ? 'loss streak'
                              : 'no streak',
                    id: 'current-streak',
                    label: 'Current streak',
                    value: (
                        <span
                            className={cn(
                                stats.currentWin > 0
                                    ? 'text-success'
                                    : stats.currentLoss > 0 &&
                                          'text-destructive',
                            )}
                        >
                            {stats.currentWin > 0
                                ? String(stats.currentWin)
                                : stats.currentLoss > 0
                                  ? String(stats.currentLoss)
                                  : '0'}
                        </span>
                    ),
                },
                {
                    caption: 'avg R per graded trade',
                    id: 'expectancy',
                    label: 'Expectancy',
                    value: (
                        <span className={signToneClass(stats.expectancy)}>
                            {stats.sample > 0 ? formatR(stats.expectancy) : '-'}
                        </span>
                    ),
                },
            ]}
            size={StatStripSize.Large}
        />
    );
}

function signToneClass(value: number): string {
    if (value > 0) return 'text-success';
    return value < 0 ? 'text-destructive' : '';
}
