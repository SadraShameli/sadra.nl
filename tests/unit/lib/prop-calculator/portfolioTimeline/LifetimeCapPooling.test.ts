import { describe, expect, it } from 'vitest';

import {
    FirmId,
    LifetimeCapScope,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    runAccountTimeline,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32 } from '~/lib/prop-calculator/rng';

const mffPro = findFirm(FirmId.Mffu)?.findPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});
if (mffPro === undefined) throw new Error('MFF Pro plan not found');

const CAP = mffPro.maxLifetimePayoutDollars;
if (CAP === null) throw new Error('MFF Pro has no lifetime dollar cap');

const NEAR_CERTAIN_PASS = {
    dayBudget: 3000,
    maxEvalDays: 60,
    plan: mffPro,
    riskPerTrade: 600,
    rrRatio: 3,
    tradesPerDay: 2,
    winrate: 0.95,
} as const;

describe('runAccountTimeline: the per-user lifetime cap pools across replacement cards (PT-12h, F-110 REV-5)', () => {
    it('never pays more than the cap across replacement cards by default, with no shared budget passed in', () => {
        const result = runAccountTimeline({
            ...NEAR_CERTAIN_PASS,
            rng: mulberry32(42),
        });
        expect(result.cumulativePayout.at(-1) ?? 0).toBeLessThanOrEqual(CAP);
    });

    it('threads an explicit shared budget through, so a second account sees the first account’s spend', () => {
        const sharedPayoutBudget = { remaining: CAP };
        const first = runAccountTimeline(
            { ...NEAR_CERTAIN_PASS, rng: mulberry32(42) },
            sharedPayoutBudget,
        );
        expect(first.cumulativePayout.at(-1) ?? 0).toBeLessThanOrEqual(CAP);
        expect(sharedPayoutBudget.remaining).toBeGreaterThanOrEqual(0);
        expect(CAP - sharedPayoutBudget.remaining).toBe(
            first.cumulativePayout.at(-1),
        );

        const second = runAccountTimeline(
            { ...NEAR_CERTAIN_PASS, rng: mulberry32(43) },
            sharedPayoutBudget,
        );
        expect(second.cumulativePayout.at(-1) ?? 0).toBeLessThanOrEqual(
            CAP - (first.cumulativePayout.at(-1) ?? 0),
        );
        expect(sharedPayoutBudget.remaining).toBeGreaterThanOrEqual(0);
    });

    it('keeps a per-account scope plan unpooled even when a shared budget is supplied', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const sharedPayoutBudget = { remaining: CAP };
        const result = runAccountTimeline(
            {
                ...NEAR_CERTAIN_PASS,
                plan: perAccountPlan,
                rng: mulberry32(42),
            },
            sharedPayoutBudget,
        );
        expect(result.cumulativePayout.at(-1) ?? 0).toBeGreaterThan(CAP);
        expect(sharedPayoutBudget.remaining).toBe(CAP);
    });
});

describe('simulatePortfolioTimeline: the per-user lifetime cap pools across accounts in one trial (PT-12h, F-110 REV-5)', () => {
    const MULTI_ACCOUNT_NEAR_CERTAIN_PASS = {
        accounts: 2,
        dayBudget: 400,
        maxEvalDays: 60,
        plan: mffPro,
        riskPerTrade: 600,
        rrRatio: 3,
        seed: 42,
        tradesPerDay: 2,
        trials: 10,
        winrate: 0.95,
    } as const;

    it('never shows combined payouts above the per-user cap across two MFF Pro accounts', () => {
        const out = simulatePortfolioTimeline(MULTI_ACCOUNT_NEAR_CERTAIN_PASS);
        for (const value of out.payoutP50)
            expect(value).toBeLessThanOrEqual(CAP);
        for (const value of out.payoutP90)
            expect(value).toBeLessThanOrEqual(CAP);
    });

    it('keeps a per-account scope toy plan unpooled: two accounts can combine above the per-account cap', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const out = simulatePortfolioTimeline({
            ...MULTI_ACCOUNT_NEAR_CERTAIN_PASS,
            plan: perAccountPlan,
        });
        expect(out.payoutP50.at(-1) ?? 0).toBeGreaterThan(CAP);
    });
});
