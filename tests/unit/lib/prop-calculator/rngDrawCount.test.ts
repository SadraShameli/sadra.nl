import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    LucidVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    RungSizing,
    scoreLadder,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { runAccountTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    runEvalWithRetries,
    runFundedHorizon,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

interface CountedRng {
    draws: () => number;
    rng: Rng;
}

function countedRng(seed: number): CountedRng {
    const inner = mulberry32(seed);
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return inner();
        },
    };
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

const rapidEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

const lucidPro = planFor({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Pro,
});

const DAY_POLICY = flatDayPolicy(400, 2, { kind: DayStopRuleKind.None });

const EVAL_OPTIONS = {
    commission: dollars(0),
    dayPolicy: DAY_POLICY,
    maxAttempts: 3,
    maxEvalDays: 150,
    rrRatio: 2,
    rungSizing: RungSizing.CapToCushion,
    shouldCaptureEquity: false,
    winrate: fraction(0.5),
} as const;

describe('rng draw counts', () => {
    it('pins the eval-with-retries draw count', () => {
        const counted = countedRng(42);
        runEvalWithRetries({
            ...EVAL_OPTIONS,
            plan: rapidEod,
            rng: counted.rng,
            totals: new TradeTotals(),
        });
        expect(counted.draws()).toBe(28);
    });

    it('pins a full eval-plus-funded draw count', () => {
        const counted = countedRng(42);
        const retry = runEvalWithRetries({
            ...EVAL_OPTIONS,
            plan: lucidPro,
            rng: counted.rng,
            totals: new TradeTotals(),
        });
        const afterEval = counted.draws();
        expect(afterEval).toBe(22);

        runFundedHorizon({
            attempt: retry.attempt,
            commission: dollars(0),
            dayPolicy: DAY_POLICY,
            fundedHorizonDays: 60,
            minRetainedCushion: dollars(2000),
            payoutRequestSize: undefined,
            plan: lucidPro,
            rng: counted.rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: fraction(0.5),
        });
        expect(counted.draws()).toBe(118);
    });

    it('pins the account-timeline draw count', () => {
        const counted = countedRng(42);
        runAccountTimeline({
            dayBudget: 120,
            dayStop: { kind: DayStopRuleKind.None },
            maxEvalDays: 150,
            minRetainedCushion: 2000,
            plan: rapidEod,
            riskPerTrade: 400,
            rng: counted.rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            tradesPerDay: 2,
            winrate: 0.5,
        });
        expect(counted.draws()).toBe(261);
    });

    it('pins the ladder-score draw count', () => {
        const counted = countedRng(42);
        scoreLadder(
            [400, 600, 800, 200],
            {
                cushion: 2000,
                evalPrice: 157,
                maxDays: 60,
                plan: rapidEod,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                seedOffset: 0,
                sims: 500,
                stopRule: { kind: DayStopRuleKind.DayGreen },
                winrate: 0.5,
            },
            counted.rng,
        );
        expect(counted.draws()).toBe(2090);
    });
});
