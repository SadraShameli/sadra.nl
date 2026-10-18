'use client';

import { useMemo } from 'react';

import { StatStrip, StatStripSize } from '~/components/StatStrip';
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
                    value: String(stats.currentWin),
                },
                {
                    caption: 'current loss run',
                    id: 'loss-streak',
                    label: 'Loss streak',
                    value: String(stats.currentLoss),
                },
                {
                    caption: 'best ever',
                    id: 'longest-win',
                    label: 'Longest win',
                    value: String(stats.bestWin),
                },
                {
                    caption: 'worst ever',
                    id: 'longest-loss',
                    label: 'Longest loss',
                    value: String(stats.bestLoss),
                },
                {
                    caption: 'weekdays in a row',
                    id: 'trading-days',
                    label: 'Trading days',
                    value: String(stats.consecutiveTradingDays),
                },
            ]}
            size={StatStripSize.Large}
        />
    );
}
