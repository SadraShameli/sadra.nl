import { describe, expect, it } from 'vitest';

import { StreakAnalyzer } from '~/lib/lifting/math/streak';

const MONDAY_W1 = new Date('2025-01-06T10:00:00Z');
const MONDAY_W2 = new Date('2025-01-13T10:00:00Z');
const MONDAY_W3 = new Date('2025-01-20T10:00:00Z');
const MONDAY_W4 = new Date('2025-01-27T10:00:00Z');
const MONDAY_W6 = new Date('2025-02-10T10:00:00Z');

const analyzer = new StreakAnalyzer('mon');

describe('StreakAnalyzer.currentStreak', () => {
    it('returns 0 for empty history', () => {
        expect(
            analyzer.currentStreak([], new Date('2025-01-27T12:00:00Z')),
        ).toBe(0);
    });

    it('counts consecutive weeks ending on the current week', () => {
        const dates = [MONDAY_W1, MONDAY_W2, MONDAY_W3, MONDAY_W4];
        const streak = analyzer.currentStreak(
            dates,
            new Date('2025-01-30T10:00:00Z'),
        );
        expect(streak).toBe(4);
    });

    it('breaks when there is a gap', () => {
        const dates = [MONDAY_W1, MONDAY_W2, MONDAY_W4];
        const streak = analyzer.currentStreak(
            dates,
            new Date('2025-01-30T10:00:00Z'),
        );
        expect(streak).toBe(1);
    });

    it('counts trailing streak even if current week is empty', () => {
        const dates = [MONDAY_W1, MONDAY_W2];
        const streak = analyzer.currentStreak(
            dates,
            new Date('2025-01-22T10:00:00Z'),
        );
        expect(streak).toBe(2);
    });
});

describe('StreakAnalyzer.longestStreak', () => {
    it('returns 0 for empty history', () => {
        expect(analyzer.longestStreak([])).toBe(0);
    });

    it('finds the longest consecutive run', () => {
        const dates = [MONDAY_W1, MONDAY_W2, MONDAY_W3, MONDAY_W6];
        expect(analyzer.longestStreak(dates)).toBe(3);
    });

    it('returns 1 for a single workout', () => {
        expect(analyzer.longestStreak([MONDAY_W1])).toBe(1);
    });
});

describe('StreakAnalyzer.sessionsPerWeek', () => {
    it('returns 0 for an invalid window', () => {
        expect(analyzer.sessionsPerWeek([MONDAY_W1], 0)).toBe(0);
    });

    it('averages across the trailing window', () => {
        const dates = [MONDAY_W1, MONDAY_W2, MONDAY_W3, MONDAY_W4];
        const avg = analyzer.sessionsPerWeek(
            dates,
            4,
            new Date('2025-01-30T10:00:00Z'),
        );
        expect(avg).toBe(1);
    });
});
