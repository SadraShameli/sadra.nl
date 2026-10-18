'use client';

import { useMemo } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { formatPercent, formatR } from '~/lib/format';
import {
    computeStreaks,
    type LightAssessment,
    outcomeTally,
} from '~/lib/trading/analytics';

import { NO_OUTCOMES_REASON, NO_R_REASON } from './outcomeReasons';
import { expectancyStat, outcomeCount } from './outcomeStats';

export function KpiStrip({ assessments }: { assessments: LightAssessment[] }) {
    const stats = useMemo(() => {
        const streak = computeStreaks(assessments);
        return {
            currentLoss: streak.currentLoss,
            currentWin: streak.currentWin,
            tally: outcomeTally(assessments),
            total: assessments.length,
        };
    }, [assessments]);
    const { tally } = stats;

    return (
        <StatStrip
            className="app-trade-checklist__kpi-strip"
            items={[
                {
                    caption: `${outcomeCount(tally.outcomes)}, ${String(tally.withR)} with R`,
                    id: 'trades-graded',
                    label: 'Trades graded',
                    value: String(stats.total),
                },
                {
                    caption: `n=${String(tally.outcomes)}`,
                    id: 'win-rate',
                    label: 'Win rate',
                    value:
                        tally.outcomes > 0 ? (
                            formatPercent(tally.winRate, 0)
                        ) : (
                            <MissingValue reason={NO_OUTCOMES_REASON} />
                        ),
                },
                {
                    caption: `across ${outcomeCount(tally.withR)} with R`,
                    id: 'cumulative-r',
                    label: 'Cumulative R',
                    value:
                        tally.withR > 0 ? (
                            formatR(tally.sumR, 1)
                        ) : (
                            <MissingValue reason={NO_R_REASON} />
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
                    value: String(
                        stats.currentWin > 0
                            ? stats.currentWin
                            : stats.currentLoss,
                    ),
                },
                expectancyStat(tally),
            ]}
            size={StatStripSize.Large}
        />
    );
}
