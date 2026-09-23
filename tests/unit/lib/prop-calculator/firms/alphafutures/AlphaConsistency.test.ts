import { describe, expect, it } from 'vitest';

import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    ConsistencyRule,
    ConsistencyScope,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    newFundedCycleTracker,
    type Plan,
    RungSizing,
    tryFundedPayout,
} from '~/lib/prop-calculator';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { type Rng } from '~/lib/prop-calculator/rng';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

const firm = new AlphaFutures();

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

const QUALIFIED_40_VARIANTS = [
    AlphaFuturesVariant.Zero,
    AlphaFuturesVariant.Standard,
];

function secondRequest(
    plan: Plan,
    options: { cycleBestDayProfit: number; cycleProfit: number },
) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.threshold = state.startingBalance;
    state.thresholdLocked = true;
    state.balance = state.startingBalance + 6000;
    state.qualifyingDays = 10;
    const tracker = newFundedCycleTracker(state);
    tracker.payoutsIssued = 1;
    tracker.qualifyingDaysAtLastPayout = 5;
    tracker.lastPayoutBalance = state.balance - options.cycleProfit;
    tracker.cycleBestDayProfit = options.cycleBestDayProfit;
    return tryFundedPayout({
        maxPayouts: Infinity,
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
        tracker,
    });
}

describe('N-43: Alpha Qualified 40% consistency fails at exactly 40% ("cannot be greater than or equal to 40%", article 9492048)', () => {
    it.each(QUALIFIED_40_VARIANTS)(
        '%s refuses a request when the best day is exactly 800 dollars of a 2,000 dollar cycle',
        (variant) => {
            expect(
                secondRequest(alphaPlan(variant), {
                    cycleBestDayProfit: 800,
                    cycleProfit: 2000,
                }),
            ).toBeNull();
        },
    );

    it.each(QUALIFIED_40_VARIANTS)(
        '%s pays when the best day is 799.99 dollars, just under 40% of a 2,000 dollar cycle',
        (variant) => {
            expect(
                secondRequest(alphaPlan(variant), {
                    cycleBestDayProfit: 799.99,
                    cycleProfit: 2000,
                }),
            ).not.toBeNull();
        },
    );

    it('keeps the Standard 50% Evaluation rule exclusive: a $1,500 best day on a $3,000 target passes', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Standard);
        const state = plan.initialState();
        state.balance = state.startingBalance + 3000;
        state.bestDayProfit = 1500;
        state.tradingDays = 2;
        expect(plan.isPassed(state)).toBe(true);
    });

    it('keeps the Advanced 40% Evaluation rule exclusive: a $1,600 best day on a $4,000 target passes', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Advanced);
        const state = plan.initialState();
        state.balance = state.startingBalance + 4000;
        state.bestDayProfit = 1600;
        state.tradingDays = 3;
        expect(plan.isPassed(state)).toBe(true);
    });
});

describe('N-45: an Alpha Qualified request after a net-losing or flat cycle fails the 40% rule', () => {
    it.each(
        QUALIFIED_40_VARIANTS.flatMap((variant) => [
            { cycleProfit: -1000, variant },
            { cycleProfit: 0, variant },
        ]),
    )(
        '$variant refuses a request after a cycle netting $cycleProfit while the account holds 6,000 dollars of profit',
        ({ cycleProfit, variant }) => {
            expect(
                secondRequest(alphaPlan(variant), {
                    cycleBestDayProfit: 600,
                    cycleProfit,
                }),
            ).toBeNull();
        },
    );

    it('Advanced Qualified has no consistency rule and still pays after a net-losing cycle', () => {
        expect(
            secondRequest(alphaPlan(AlphaFuturesVariant.Advanced), {
                cycleBestDayProfit: 600,
                cycleProfit: -1000,
            })?.debited,
        ).toBe(3000);
    });
});

describe('N-45 through the simulator: an Alpha Standard trial pays no request after a net-losing cycle', () => {
    const winDraw = 0.1;
    const lossDraw = 0.9;
    const W = winDraw;
    const L = lossDraw;
    const evalDays = [W, W, W];
    const firstCycle = [W, W, W, W, W];
    const winThenFourLosses = [W, L, L, L, L];
    const netLosingCycle = [
        ...winThenFourLosses,
        ...winThenFourLosses,
        ...winThenFourLosses,
        ...winThenFourLosses,
        W,
    ];
    const fundedDays = firstCycle.length + netLosingCycle.length;

    function scriptedRng(draws: readonly number[]): Rng {
        let index = 0;
        return () => {
            const draw = draws[index];
            index += 1;
            return draw ?? lossDraw;
        };
    }

    function runTrial(plan: Plan) {
        const policy = flatDayPolicy(400, 1, {
            kind: DayStopRuleKind.None,
        });
        return simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
            fundedHorizonDays: fundedDays,
            maxAttempts: 1,
            maxEvalDays: 30,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng([...evalDays, ...firstCycle, ...netLosingCycle]),
            rrRatio: 3,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });
    }

    const standard = alphaPlan(AlphaFuturesVariant.Standard);

    it('control: the old exclusive, loss-exempt 40% rule pays a second $600 request after the cycle nets -$400', () => {
        const control = standard.withOverrides({
            fundedConsistency: {
                kind: 'set',
                rule: new ConsistencyRule(
                    ConsistencyScope.Funded,
                    fraction(0.4),
                ),
            },
        });
        const trial = runTrial(control);
        expect(trial.daysToPass).toBe(evalDays.length);
        expect(trial.payoutCount).toBe(2);
        expect(trial.grossPayout).toBeCloseTo(0.7 * 3000 + 0.7 * 600, 6);
    });

    it('Alpha Standard pays only the first $3,000 request', () => {
        const trial = runTrial(standard);
        expect(trial.daysToPass).toBe(evalDays.length);
        expect(trial.payoutCount).toBe(1);
        expect(trial.grossPayout).toBeCloseTo(0.7 * 3000, 6);
    });
});

describe('no other firm changes consistency behavior', () => {
    const otherPlans = ALL_FIRMS.filter(
        (other) => other.id !== FirmId.AlphaFutures,
    ).flatMap((other) => other.plans);
    const rules = otherPlans.flatMap((plan) =>
        [
            plan.evalConsistencyRule(),
            ...[0, 1, 2, 3, 4, 5].map((index) =>
                plan.fundedConsistencyRule(index),
            ),
        ]
            .filter((rule) => rule !== null)
            .map((rule) => ({ label: plan.label, rule })),
    );

    it('finds consistency rules to check', () => {
        expect(rules.length).toBeGreaterThan(10);
    });

    it.each(rules)(
        '$label passes a best day at exactly its share and on non-positive profit',
        ({ rule }) => {
            expect(rule.isViolated(rule.maxBestDayShare * 1000, 1000)).toBe(
                false,
            );
            expect(rule.isViolated(rule.maxBestDayShare * 1000 + 1, 1000)).toBe(
                true,
            );
            expect(rule.isViolated(500, -250)).toBe(false);
            expect(rule.isViolated(0, 0)).toBe(false);
        },
    );
});

describe('N-34 notes: Alpha typed coupon codes and the unmodeled Qualified Reset', () => {
    const notes = firm.notes;

    it('names both typed codes, TRADINGVIEW and the site-wide APP50, and keeps list prices as the fee basis', () => {
        const couponNote = notes.find((note) => note.includes('APP50'));
        expect(couponNote).toBeDefined();
        expect(couponNote).toContain('TRADINGVIEW');
        expect(couponNote).toContain('typed');
        expect(couponNote).toContain('list price');
    });

    it('states the Qualified Reset prices, limits and window and that it is not modeled', () => {
        const resetNote = notes.find((note) =>
            note.includes('Qualified Account Reset'),
        );
        expect(resetNote).toBeDefined();
        for (const fact of [
            '$499',
            '$599',
            '2 times',
            'never reached a payout request',
            '7 days',
            'not modeled',
        ]) {
            expect(resetNote).toContain(fact);
        }
    });

    it('documents the inclusive 40% boundary and the net-losing cycle rule', () => {
        const consistencyNote = notes.find((note) =>
            note.includes('greater than or equal to 40%'),
        );
        expect(consistencyNote).toBeDefined();
        expect(consistencyNote).toContain('ConsistencyBoundary.Inclusive');
        expect(consistencyNote).toContain(
            'ConsistencyNonPositiveProfit.Violates',
        );
    });

    it('discloses that the funded dynamic program does not yet honour the net-losing cycle rule after the first request', () => {
        const dpNote = notes.find((note) =>
            note.includes('funded dynamic program'),
        );
        expect(dpNote).toBeDefined();
        for (const fact of [
            'payout floor',
            'second request',
            'net-losing cycle rule',
            'overstate',
            'Zero and Standard',
            'simulated trials',
        ]) {
            expect(dpNote).toContain(fact);
        }
    });

    it('uses no em dashes', () => {
        const emDash = String.fromCodePoint(0x20_14);
        expect(notes.some((note) => note.includes(emDash))).toBe(false);
    });
});
