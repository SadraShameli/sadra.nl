import { beforeAll, describe, expect, it } from 'vitest';

import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    newFundedCycleTracker,
    type Plan,
    PolicySizing,
    RungSizing,
    simulate,
} from '~/lib/prop-calculator';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

import { memoise } from '../../../../memoise';
import { scriptedRng } from '../../scriptedRng';
import {
    alphaFirm,
    alphaPlan,
    alphaToy,
    qualifiedAlphaRule,
    withRule,
} from './alphaConsistencyFixtures';

const firm = alphaFirm;

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
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
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

    function runTrial(plan: Plan) {
        const policy = flatDayPolicy(
            400,
            1,
            {
                kind: DayStopRuleKind.None,
            },
            PolicySizing.ContractCapped,
        );
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
            rng: scriptedRng(
                [...evalDays, ...firstCycle, ...netLosingCycle],
                lossDraw,
            ),
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

function simulateFlatToy(rule: ConsistencyRule, cap: null | number) {
    return simulate({
        fundedHorizonDays: 400,
        maxEvalDays: 1,
        plan: alphaToy(rule).withMaxLifetimePayouts(cap),
        riskPerTrade: 25,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: 1000,
        winrate: 0.5,
    });
}

describe('N-45 aggregate explanation: under a lifetime payout cap the loss-exempt rule spends a scarce payout slot on a small request after a losing day', () => {
    const qualifiedRule = qualifiedAlphaRule();
    const lossExemptRule = withRule(qualifiedRule, {
        nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
    });
    const W = 0.1;
    const L = 0.9;
    const policy = flatDayPolicy(
        25,
        1,
        { kind: DayStopRuleKind.None },
        PolicySizing.ContractCapped,
    );

    const flatToyRuns = memoise(() => ({
        cappedLossExempt: simulateFlatToy(lossExemptRule, 3),
        cappedStrict: simulateFlatToy(qualifiedRule, 3),
        uncappedLossExempt: simulateFlatToy(lossExemptRule, null),
        uncappedStrict: simulateFlatToy(qualifiedRule, null),
    }));

    beforeAll(() => {
        flatToyRuns();
    });

    function runToy(plan: Plan) {
        return simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
            fundedHorizonDays: 7,
            maxAttempts: 1,
            maxEvalDays: 1,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng([W, W, W, L, W, W, W], L),
            rrRatio: 4,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });
    }

    it('with 2 lifetime payouts the loss-exempt rule pays 150 then 25 after the day-4 loss and concludes, while the strict rule waits and pays 150 then 212.5', () => {
        const lossExempt = runToy(
            alphaToy(lossExemptRule).withMaxLifetimePayouts(2),
        );
        const strict = runToy(
            alphaToy(qualifiedRule).withMaxLifetimePayouts(2),
        );

        expect(lossExempt.payoutCount).toBe(2);
        expect(lossExempt.grossPayout).toBe(175);
        expect(lossExempt.daysElapsed).toBe(4);
        expect(strict.payoutCount).toBe(2);
        expect(strict.grossPayout).toBe(362.5);
        expect(strict.daysElapsed).toBe(7);
    });

    it("control: without the cap the small request costs no slot, so the loss-exempt rule pays 375 and beats the strict rule's 362.5", () => {
        const lossExempt = runToy(
            alphaToy(lossExemptRule).withMaxLifetimePayouts(null),
        );
        const strict = runToy(
            alphaToy(qualifiedRule).withMaxLifetimePayouts(null),
        );

        expect(lossExempt.payoutCount).toBe(3);
        expect(lossExempt.grossPayout).toBe(375);
        expect(strict.grossPayout).toBe(362.5);
    });

    it('aggregate under flat sizing: with the cap both rules take the same number of payouts and the strict rule takes larger ones, and removing the cap widens the gap, so the cap is not its cause (PT-T1c: 1,000 trials a run instead of 20,000; the capped gap is $95 to $101 and the uncapped gap $2,900 to $3,190 from 1,500 to 20,000 trials, against the bounds of 50 and the capped gap)', () => {
        const {
            cappedLossExempt,
            cappedStrict,
            uncappedLossExempt,
            uncappedStrict,
        } = flatToyRuns();
        const cappedGap =
            cappedStrict.expectedGrossPayout -
            cappedLossExempt.expectedGrossPayout;
        const uncappedGap =
            uncappedStrict.expectedGrossPayout -
            uncappedLossExempt.expectedGrossPayout;

        expect(
            Math.abs(
                cappedStrict.expectedPayoutCount -
                    cappedLossExempt.expectedPayoutCount,
            ),
        ).toBeLessThan(0.1);
        expect(cappedGap).toBeGreaterThan(50);
        expect(uncappedGap).toBeGreaterThan(cappedGap);
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
        '$label follows its declared boundary at exactly its share and passes on non-positive profit',
        ({ rule }) => {
            expect(rule.isViolated(rule.maxBestDayShare * 1000, 1000)).toBe(
                rule.boundary === ConsistencyBoundary.Inclusive,
            );
            expect(rule.isViolated(rule.maxBestDayShare * 1000 + 1, 1000)).toBe(
                true,
            );
            expect(rule.isViolated(500, -250)).toBe(false);
            expect(rule.isViolated(0, 0)).toBe(false);
        },
    );
});

describe('N-34 notes: Alpha typed coupon codes and the opt-in Qualified Reset', () => {
    const notes = firm.notes;

    it('names both typed codes, TRADINGVIEW and the site-wide APP50, and keeps list prices as the fee basis', () => {
        const couponNote = notes.find((note) => note.includes('APP50'));
        expect(couponNote).toBeDefined();
        expect(couponNote).toContain('TRADINGVIEW');
        expect(couponNote).toContain('Typed');
        expect(couponNote).toContain('list price');
    });

    it('states the Qualified Reset prices, limits and window and how the opt-in models it', () => {
        const resetNote = notes.find((note) =>
            note.includes('Qualified Account Reset'),
        );
        expect(resetNote).toBeDefined();
        for (const fact of [
            '$499',
            '$599',
            '2 times',
            'never reached payout request',
            '7 days',
            'opt-in',
            'off by default',
            'same day',
            'inactivity closure',
            'cost per funded account',
        ]) {
            expect(resetNote).toContain(fact);
        }
        expect(resetNote).toContain(
            "The optimal-risk dynamic program optimize dp values the Qualified Reset exactly: a breach before the first payout is worth the next reset layer's start value less the discounted reset fee, and an inactivity closure is never reset. Its day policy picks the layer from the resets already used, so the empirical run takes the same decisions the DP valued.",
        );
        expect(resetNote).not.toContain('not modeled yet');
        expect(resetNote).not.toContain('does not model');
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

    it('no longer claims the funded dynamic program measures cycles from the payout floor (N-45 DP half, covered by R1-7)', () => {
        expect(notes.some((note) => note.includes('Known limitation'))).toBe(
            false,
        );
        const dpNote = notes.find((note) =>
            note.includes('funded dynamic program'),
        );
        expect(dpNote).toBeDefined();
        for (const fact of [
            'balance at the last request',
            'net-losing cycle rule',
            'second request',
            'bucketed',
            'approximate',
            'Zero and Standard',
            'simulated trials',
        ]) {
            expect(dpNote).toContain(fact);
        }
        expect(dpNote).not.toContain('payout floor');
    });

    it('uses no em dashes', () => {
        const emDash = String.fromCodePoint(0x20_14);
        expect(notes.some((note) => note.includes(emDash))).toBe(false);
    });
});
