import { describe, expect, it } from 'vitest';

import {
    drawdownStats,
    equityCurveFromR,
    type LightAssessment,
} from './trading-analytics';

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
