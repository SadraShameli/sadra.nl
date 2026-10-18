'use client';

import { useMemo } from 'react';

import { StatStrip, StatStripSize, StatTone } from '~/components/StatStrip';
import { computeStreaks, type LightAssessment } from '~/lib/trading/analytics';

export function StreaksPanel({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const stats = useMemo(() => computeStreaks(assessments), [assessments]);

    return (
        <StatStrip
            className="app-trade-checklist__streaks-panel"
            items={[
                {
                    caption: 'current win run',
                    id: 'win-streak',
                    label: 'Win streak',
                    tone:
                        stats.currentWin > 0
                            ? StatTone.Positive
                            : StatTone.Default,
                    value: String(stats.currentWin),
                },
                {
                    caption: 'current loss run',
                    id: 'loss-streak',
                    label: 'Loss streak',
                    tone:
                        stats.currentLoss > 0
                            ? StatTone.Negative
                            : StatTone.Default,
                    value: String(stats.currentLoss),
                },
                {
                    caption: 'best ever',
                    id: 'longest-win',
                    label: 'Longest win',
                    tone: StatTone.Positive,
                    value: String(stats.bestWin),
                },
                {
                    caption: 'worst ever',
                    id: 'longest-loss',
                    label: 'Longest loss',
                    tone: StatTone.Negative,
                    value: String(stats.bestLoss),
                },
                {
                    caption: 'weekdays in a row',
                    id: 'trading-days',
                    label: 'Trading days',
                    tone:
                        stats.consecutiveTradingDays > 0
                            ? StatTone.Warning
                            : StatTone.Default,
                    value: String(stats.consecutiveTradingDays),
                },
            ]}
            size={StatStripSize.Large}
        />
    );
}
