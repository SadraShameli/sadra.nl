import { describe, expect, it } from 'vitest';

import {
    capRiskToRemainingDailyLoss,
    floorToWholeCents,
    fraction,
    ONE_CENT,
    resolveAffordableRisk,
    resolveLiveTradeRisk,
} from '~/lib/prop-calculator/core';

describe('resolveLiveTradeRisk', () => {
    it('risks zero once the cushion is exactly exhausted', () => {
        expect(resolveLiveTradeRisk(0, fraction(0.05))).toBe(0);
    });

    it('never risks a positive amount when underwater (cushion negative)', () => {
        expect(resolveLiveTradeRisk(-500, fraction(0.05))).toBe(0);
    });

    it("sizes to Apex's confirmed 5% pre-lock rate: $3,000 cushion -> $150 risk", () => {
        expect(resolveLiveTradeRisk(3000, fraction(0.05))).toBeCloseTo(150, 10);
    });

    it("sizes to Apex's confirmed 10% post-lock rate: the same $3,000 cushion doubles to $300 risk once locked", () => {
        const preLockRisk = resolveLiveTradeRisk(3000, fraction(0.05));
        const postLockRisk = resolveLiveTradeRisk(3000, fraction(0.1));

        expect(postLockRisk).toBeCloseTo(300, 10);
        expect(postLockRisk).toBeCloseTo(preLockRisk * 2, 10);
    });

    it('scales linearly with the cushion for a fixed percentage', () => {
        const small = resolveLiveTradeRisk(1000, fraction(0.05));
        const large = resolveLiveTradeRisk(2000, fraction(0.05));

        expect(large).toBeCloseTo(small * 2, 10);
    });
});

describe('capRiskToRemainingDailyLoss (R-3: no trade loses more than the remaining daily loss limit)', () => {
    it('leaves the risk alone on a plan with no daily loss limit', () => {
        expect(capRiskToRemainingDailyLoss(3050, null, -1900, 30)).toBe(3050);
    });

    it('leaves a risk inside the remaining limit alone', () => {
        expect(capRiskToRemainingDailyLoss(450, 2000, 0, 0)).toBe(450);
    });

    it('cuts a $729 risk to the $290 left of a $500 limit after a $210 loss today', () => {
        expect(capRiskToRemainingDailyLoss(729, 500, -210, 0)).toBe(290);
    });

    it("counts today's gains toward the room left, like the funded engine", () => {
        expect(capRiskToRemainingDailyLoss(900, 500, 150, 0)).toBe(650);
    });

    it('leaves room for the commission, so risk plus commission never exceeds what is left', () => {
        expect(capRiskToRemainingDailyLoss(900, 500, -267, 30)).toBe(203);
    });

    it('risks nothing once less than one cent of room is left after the commission', () => {
        expect(capRiskToRemainingDailyLoss(900, 500, -469.995, 30)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -500, 0)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -600, 0)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -480, 30)).toBe(0);
    });

    it('keeps a sub-cent risk when the limit has room for it, so the cushion floor alone decides', () => {
        expect(capRiskToRemainingDailyLoss(0.004, 500, -100, 0)).toBe(0.004);
    });

    it('refuses even a sub-cent risk once the room left is under one cent', () => {
        expect(capRiskToRemainingDailyLoss(0.004, 500, -499.992, 0)).toBe(0);
    });

    it('matches the funded resolveAffordableRisk rule when there is no commission', () => {
        for (const [risk, limit, todayPnL] of [
            [729, 500, -210],
            [100, 500, -210],
            [900, 2000, 400],
        ] as const) {
            expect(capRiskToRemainingDailyLoss(risk, limit, todayPnL, 0)).toBe(
                resolveAffordableRisk(risk, limit, todayPnL, 0),
            );
        }
    });
});

describe('ONE_CENT lives with the branded unit helpers (WP18g)', () => {
    it('is one cent in dollars, exported from the core barrel', () => {
        expect(ONE_CENT).toBe(0.01);
    });

    it('is the room below which the per-trade cap refuses a trade', () => {
        expect(
            capRiskToRemainingDailyLoss(900, 500, -500 + 2 * ONE_CENT, 0),
        ).toBeCloseTo(2 * ONE_CENT, 10);
        expect(
            capRiskToRemainingDailyLoss(900, 500, -500 + ONE_CENT / 2, 0),
        ).toBe(0);
    });
});

describe('floorToWholeCents reads an amount in whole cents (WP18g review)', () => {
    it('drops a sub-cent leftover: 10,000.004 and 10,000.009 both read as 10,000.00', () => {
        expect(floorToWholeCents(10_000.004)).toBe(10_000);
        expect(floorToWholeCents(10_000.009)).toBe(10_000);
    });

    it('keeps a whole cent that floating point stores a hair low: 65,000.01 minus 55,000 reads as 10,000.01', () => {
        expect(floorToWholeCents(65_000.01 - 55_000)).toBe(10_000.01);
    });

    it('floors a negative amount toward the lower cent', () => {
        expect(floorToWholeCents(-0.004)).toBe(-0.01);
    });
});
