'use client';

import { useMemo } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { formatPercent, formatR } from '~/lib/format';
import {
    computeStreaks,
    expectancyR,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

const NO_OUTCOMES_REASON =
    'Needs at least one recorded win, loss or breakeven outcome.';

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
                        stats.sample > 0 ? (
                            formatPercent(stats.winRate, 0)
                        ) : (
                            <MissingValue reason={NO_OUTCOMES_REASON} />
                        ),
                },
                {
                    caption: 'across all graded outcomes',
                    id: 'cumulative-r',
                    label: 'Cumulative R',
                    value:
                        stats.sample > 0 ? (
                            <span className={signToneClass(stats.cumR)}>
                                {formatR(stats.cumR, 1)}
                            </span>
                        ) : (
                            <MissingValue reason={NO_OUTCOMES_REASON} />
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
                    value:
                        stats.sample > 0 ? (
                            <span className={signToneClass(stats.expectancy)}>
                                {formatR(stats.expectancy)}
                            </span>
                        ) : (
                            <MissingValue reason={NO_OUTCOMES_REASON} />
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
