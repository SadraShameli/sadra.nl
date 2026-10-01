import { describe, expect, it } from 'vitest';

import {
    dollars,
    LifetimeCapScope,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    CorrelationMode,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

import { payoutCapToyPlan } from './toyPlans';

const LIFETIME_CAP = 200;

function lifetimeCapPlan(scope: LifetimeCapScope): Plan {
    return payoutCapToyPlan().withOverrides({
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(0),
            reset: dollars(0),
        },
        lifetimeDollarCapScope: scope,
        maxLifetimePayoutDollars: dollars(LIFETIME_CAP),
    });
}

function portfolioNet(scope: LifetimeCapScope): number {
    return simulatePortfolio({
        accounts: 2,
        correlation: CorrelationMode.Independent,
        fundedHorizonDays: 60,
        groups: 2,
        maxEvalDays: 5,
        plan: lifetimeCapPlan(scope),
        riskPerTrade: 10,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 4,
        trials: 200,
        winrate: 0.95,
    }).expectedNet;
}

describe('simulatePortfolio: the per-user lifetime cap pools across accounts in one trial (PT-12h review)', () => {
    it('never lets the combined expected net exceed the per-user cap across two independent accounts', () => {
        expect(
            portfolioNet(LifetimeCapScope.PerUserAcrossVariant),
        ).toBeLessThanOrEqual(LIFETIME_CAP);
    });

    it('keeps a per-account scope toy plan unpooled: two accounts can combine past the per-account cap', () => {
        expect(portfolioNet(LifetimeCapScope.PerAccount)).toBeGreaterThan(
            LIFETIME_CAP,
        );
    });
});
