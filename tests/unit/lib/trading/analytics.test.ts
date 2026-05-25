import { describe, expect, it } from 'vitest';

import {
    componentScoreCorrelation,
    computeStreaks,
    cumulativeRSeries,
    drawdownStats,
    equityCurveFromR,
    type LightAssessment,
} from '~/lib/trading/analytics';

function assessment(
    daysAgo: number,
    outcomeR: null | number,
    outcome: LightAssessment['outcome'] = 'win',
): LightAssessment {
    const created = new Date('2025-01-01T00:00:00Z');
    created.setUTCDate(created.getUTCDate() + daysAgo);
    return {
        createdAt: created.toISOString(),
        grade: 'A',
        id: `a-${daysAgo}`,
        outcome,
        outcomeR,
        planId: 'p',
        score: 90,
    };
}

describe('equityCurveFromR', () => {
    it('computes running balance and drawdown', () => {
        const rows: LightAssessment[] = [
            assessment(0, 2),
            assessment(1, -1, 'loss'),
            assessment(2, -1, 'loss'),
            assessment(3, 1),
        ];
        const curve = equityCurveFromR(rows, {
            dollarRiskPerTrade: 100,
            startingBalance: 10_000,
        });
        expect(curve).toHaveLength(4);
        expect(curve[0]?.balance).toBe(10_200);
        expect(curve[3]?.balance).toBe(10_100);
        expect(curve[2]?.drawdown).toBeCloseTo((10_200 - 10_000) / 10_200, 4);
    });

    it('includes breakeven (counted, zero contribution)', () => {
        const rows: LightAssessment[] = [
            assessment(0, 0, 'breakeven'),
            assessment(1, 1),
        ];
        const curve = equityCurveFromR(rows, {
            dollarRiskPerTrade: 100,
            startingBalance: 10_000,
        });
        expect(curve).toHaveLength(2);
        expect(curve[0]?.balance).toBe(10_000);
        expect(curve[1]?.balance).toBe(10_100);
    });
});

describe('drawdownStats', () => {
    it('returns zero for an empty curve', () => {
        const s = drawdownStats([]);
        expect(s.maxDrawdownDollars).toBe(0);
        expect(s.maxDrawdownPct).toBe(0);
        expect(s.durationTrades).toBe(0);
    });

    it('reports the worst peak-to-trough drop', () => {
        const points = [
            { balance: 10_000, date: 'a', drawdown: 0 },
            { balance: 10_500, date: 'b', drawdown: 0 },
            { balance: 10_200, date: 'c', drawdown: 0 },
            { balance: 9800, date: 'd', drawdown: 0 },
            { balance: 10_300, date: 'e', drawdown: 0 },
        ];
        const s = drawdownStats(points);
        expect(s.maxDrawdownDollars).toBe(700);
        expect(s.maxDrawdownPct).toBeCloseTo(700 / 10_500, 4);
        expect(s.durationTrades).toBe(3);
    });
});

describe('cumulativeRSeries', () => {
    it('accumulates outcomeR in chronological order', () => {
        const rows: LightAssessment[] = [
            assessment(2, 1),
            assessment(0, 2),
            assessment(1, -1, 'loss'),
        ];
        const series = cumulativeRSeries(rows);
        expect(series).toHaveLength(3);
        expect(series[0]?.cumR).toBe(2);
        expect(series[1]?.cumR).toBe(1);
        expect(series[2]?.cumR).toBe(2);
    });

    it('skips uncounted outcomes (null and unrecognised)', () => {
        const rows: LightAssessment[] = [
            assessment(0, null, null),
            assessment(1, 1),
        ];
        const series = cumulativeRSeries(rows);
        expect(series).toHaveLength(1);
        expect(series[0]?.cumR).toBe(1);
    });
});

describe('computeStreaks', () => {
    it('reports zero streaks on empty input', () => {
        const s = computeStreaks([]);
        expect(s.currentWin).toBe(0);
        expect(s.currentLoss).toBe(0);
        expect(s.bestWin).toBe(0);
        expect(s.bestLoss).toBe(0);
    });

    it('counts the current win streak (most recent trades only)', () => {
        const rows: LightAssessment[] = [
            assessment(0, 2),
            assessment(1, -1, 'loss'),
            assessment(2, 1),
            assessment(3, 2),
        ];
        const s = computeStreaks(rows);
        expect(s.currentWin).toBe(2);
        expect(s.currentLoss).toBe(0);
    });

    it('counts the current loss streak when most recent is a loss', () => {
        const rows: LightAssessment[] = [
            assessment(0, 2),
            assessment(1, -1, 'loss'),
            assessment(2, -1, 'loss'),
        ];
        const s = computeStreaks(rows);
        expect(s.currentLoss).toBe(2);
        expect(s.currentWin).toBe(0);
    });

    it('reports best run lengths across the full history', () => {
        const rows: LightAssessment[] = [
            assessment(0, 1),
            assessment(1, 1),
            assessment(2, 1),
            assessment(3, -1, 'loss'),
            assessment(4, -1, 'loss'),
            assessment(5, 1),
        ];
        const s = computeStreaks(rows);
        expect(s.bestWin).toBe(3);
        expect(s.bestLoss).toBe(2);
    });
});

describe('componentScoreCorrelation', () => {
    it('returns 5 buckets at 20/40/60/80/100 pct-of-max', () => {
        const buckets = componentScoreCorrelation([], 'mental');
        expect(buckets).toHaveLength(5);
        expect(buckets.map((b) => b.pctOfMax)).toEqual([20, 40, 60, 80, 100]);
    });

    it('skips rows without componentScores', () => {
        const buckets = componentScoreCorrelation(
            [assessment(0, 1), assessment(1, -1, 'loss')],
            'mental',
        );
        for (const b of buckets) expect(b.count).toBe(0);
    });

    it('buckets a row into the right percentile and averages outcomeR', () => {
        const row: LightAssessment = {
            ...assessment(0, 2),
            componentScores: { mental: { earned: 10, max: 10 } },
        };
        const buckets = componentScoreCorrelation([row], 'mental');
        expect(buckets[4]?.count).toBe(1);
        expect(buckets[4]?.avgR).toBe(2);
    });
});
