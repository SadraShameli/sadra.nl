import { describe, expect, it } from 'vitest';

import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    flatDayPolicy,
    fraction,
    newFundedCycleTracker,
    type Plan,
    RungSizing,
    simulate,
    tryFundedPayout,
} from '~/lib/prop-calculator';
import {
    computeFundedStateValue,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

import { scriptedRng } from '../../scriptedRng';

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

interface DpRun {
    dp: number;
    fundedBustProbability: number;
    payoutCount: number;
    simulated: number;
}

const dpRuns = new Map<ConsistencyRule, DpRun>();

function alphaToy(rule: ConsistencyRule): Plan {
    return alphaPlan(AlphaFuturesVariant.Standard).withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 3,
        minDaysAfterPassForPayout: 0,
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        payoutTiersFromPayout: undefined,
    });
}

function averageRequest(run: DpRun): number {
    return run.simulated / run.payoutCount;
}

function dpAndSimulate(rule: ConsistencyRule): DpRun {
    const cached = dpRuns.get(rule);
    if (cached) return cached;
    const plan = alphaToy(rule);
    const result = computeFundedStateValue({
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.25,
        cycleBestDayBucketCount: 25,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    });
    const simInputs = {
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 400,
        maxEvalDays: 1,
        riskPerTrade: 100,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: 20_000,
        winrate: 0.5,
    };
    const out = simulate({ ...simInputs, plan });
    expect(result.unconvergedLevelCount).toBe(0);
    expect(result.bustTerminalValue).toBe(0);
    const run = {
        dp: result.initialValue,
        fundedBustProbability: out.fundedBustProbability,
        payoutCount: out.expectedPayoutCount,
        simulated: out.expectedGrossPayout,
    };
    dpRuns.set(rule, run);
    return run;
}

function qualifiedAlphaRule(): ConsistencyRule {
    const rule = alphaPlan(AlphaFuturesVariant.Standard).fundedConsistencyRule(
        1,
    );
    if (rule === null) {
        throw new Error('Alpha Standard has no Qualified consistency rule');
    }
    return rule;
}

function simulateFlatToy(rule: ConsistencyRule, cap: null | number) {
    return simulate({
        fundedHorizonDays: 400,
        maxEvalDays: 1,
        plan: alphaToy(rule).withMaxLifetimePayouts(cap),
        riskPerTrade: 25,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: 20_000,
        winrate: 0.5,
    });
}

function withRule(
    rule: ConsistencyRule,
    changes: {
        boundary?: ConsistencyBoundary;
        nonPositiveProfit?: ConsistencyNonPositiveProfit;
    },
): ConsistencyRule {
    return new ConsistencyRule(
        ConsistencyScope.Funded,
        rule.maxBestDayShare,
        rule.basis,
        rule.violationEffect,
        changes.boundary ?? rule.boundary,
        changes.nonPositiveProfit ?? rule.nonPositiveProfit,
    );
}

describe('N-45 in the funded dynamic program: the net-losing cycle rule holds from the second request on', () => {
    const qualifiedRule = qualifiedAlphaRule();
    const lossExemptRule = withRule(qualifiedRule, {
        nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
    });

    it('uses the real Alpha Qualified rule: inclusive and failing on a net-losing cycle', () => {
        expect(qualifiedRule.boundary).toBe(ConsistencyBoundary.Inclusive);
        expect(qualifiedRule.nonPositiveProfit).toBe(
            ConsistencyNonPositiveProfit.Violates,
        );
        expect(isFundedDpEligible(alphaToy(qualifiedRule))).toBe(true);
    });

    it('separates the Alpha rule from a loss-exempt rule after the first request, in the same direction as simulated trials of its own policy', () => {
        const alpha = dpAndSimulate(qualifiedRule);
        const lossExempt = dpAndSimulate(lossExemptRule);
        expect(alpha.simulated - lossExempt.simulated).toBeGreaterThan(50);
        expect(alpha.dp - lossExempt.dp).toBeGreaterThan(50);
        for (const run of [alpha, lossExempt]) {
            expect(Math.abs(run.dp - run.simulated)).toBeLessThan(
                0.2 * run.simulated,
            );
        }
    }, 240_000);
});

describe('N-45 aggregate explanation: under a lifetime payout cap the loss-exempt rule spends a scarce payout slot on a small request after a losing day', () => {
    const qualifiedRule = qualifiedAlphaRule();
    const lossExemptRule = withRule(qualifiedRule, {
        nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
    });
    const W = 0.1;
    const L = 0.9;
    const policy = flatDayPolicy(25, 1, { kind: DayStopRuleKind.None });

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

    it('aggregate: under their DP policies both rules bust about equally and stay well under the 3-payout cap, and the strict rule wins on larger requests', () => {
        const strict = dpAndSimulate(qualifiedRule);
        const lossExempt = dpAndSimulate(lossExemptRule);

        expect(strict.payoutCount).toBeLessThan(2);
        expect(lossExempt.payoutCount).toBeLessThan(2);
        expect(
            Math.abs(
                strict.fundedBustProbability - lossExempt.fundedBustProbability,
            ),
        ).toBeLessThan(0.03);
        expect(averageRequest(strict)).toBeGreaterThan(
            1.15 * averageRequest(lossExempt),
        );
    }, 480_000);

    it('aggregate under flat sizing: with the cap both rules take the same number of payouts and the strict rule takes larger ones, and removing the cap widens the gap, so the cap is not its cause', () => {
        const cappedStrict = simulateFlatToy(qualifiedRule, 3);
        const cappedLossExempt = simulateFlatToy(lossExemptRule, 3);
        const cappedGap =
            cappedStrict.expectedGrossPayout -
            cappedLossExempt.expectedGrossPayout;
        const uncappedGap =
            simulateFlatToy(qualifiedRule, null).expectedGrossPayout -
            simulateFlatToy(lossExemptRule, null).expectedGrossPayout;

        expect(
            Math.abs(
                cappedStrict.expectedPayoutCount -
                    cappedLossExempt.expectedPayoutCount,
            ),
        ).toBeLessThan(0.1);
        expect(cappedGap).toBeGreaterThan(50);
        expect(uncappedGap).toBeGreaterThan(cappedGap);
    }, 120_000);
});

interface FundedCycleProbe {
    balance: number;
    cycleBestDayProfit: number;
    lastPayoutBalance: number;
}

describe('N-45 at single funded DP states: a negative-edge policy trades only while the Alpha rule blocks the day-close payout', () => {
    const qualifiedRule = qualifiedAlphaRule();

    function toyPlan(rule: ConsistencyRule): Plan {
        return alphaToy(rule).withMaxLifetimePayouts(2);
    }

    const solvedPolicies = new Map<
        ConsistencyRule,
        (cycle: FundedCycleProbe) => number
    >();

    function firstTradeRiskAfterOneRequest(
        rule: ConsistencyRule,
    ): (cycle: FundedCycleProbe) => number {
        const solved = solvedPolicies.get(rule);
        if (solved) return solved;
        const plan = toyPlan(rule);
        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: 25,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            plan,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: 0.3,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        const riskAt = ({
            balance,
            cycleBestDayProfit,
            lastPayoutBalance,
        }: FundedCycleProbe): number => {
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            state.threshold = 1000;
            state.thresholdLocked = true;
            state.balance = balance;
            state.qualifyingDays = 20;
            return (
                result.dayPolicy.computeRisk?.(state, 0, {
                    cycleBestDayProfit,
                    dayGateProgress: 10,
                    lastPayoutBalance,
                    payoutsIssued: 1,
                }) ?? NaN
            );
        };
        solvedPolicies.set(rule, riskAt);
        return riskAt;
    }

    const lossExemptRule = withRule(qualifiedRule, {
        nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
    });
    const exclusiveRule = withRule(qualifiedRule, {
        boundary: ConsistencyBoundary.Exclusive,
    });

    it.each([
        { balance: 1300, cycleProfit: -100, lastPayoutBalance: 1400 },
        { balance: 1300, cycleProfit: 0, lastPayoutBalance: 1300 },
    ])(
        'after a cycle netting $cycleProfit the Alpha rule blocks the payout, so the DP trades, while a loss-exempt rule takes the payout without trading',
        ({ balance, lastPayoutBalance }) => {
            const cycle = { balance, cycleBestDayProfit: 0, lastPayoutBalance };
            expect(
                firstTradeRiskAfterOneRequest(qualifiedRule)(cycle),
            ).toBeGreaterThan(0);
            expect(firstTradeRiskAfterOneRequest(lossExemptRule)(cycle)).toBe(
                0,
            );
        },
        120_000,
    );

    it('scores the inclusive 40% on the real cycle profit: a $100 best day on a $250 cycle blocks the payout, a $75 best day pays it', () => {
        const alpha = firstTradeRiskAfterOneRequest(qualifiedRule);
        expect(
            alpha({
                balance: 1400,
                cycleBestDayProfit: 100,
                lastPayoutBalance: 1150,
            }),
        ).toBeGreaterThan(0);
        expect(
            alpha({
                balance: 1400,
                cycleBestDayProfit: 75,
                lastPayoutBalance: 1150,
            }),
        ).toBe(0);
    }, 120_000);

    it('control: an exclusive 40% boundary pays the same $100 best day on a $250 cycle', () => {
        expect(
            firstTradeRiskAfterOneRequest(exclusiveRule)({
                balance: 1400,
                cycleBestDayProfit: 100,
                lastPayoutBalance: 1150,
            }),
        ).toBe(0);
    }, 120_000);
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

describe('N-34 notes: Alpha typed coupon codes and the opt-in Qualified Reset', () => {
    const notes = firm.notes;

    it('names both typed codes, TRADINGVIEW and the site-wide APP50, and keeps list prices as the fee basis', () => {
        const couponNote = notes.find((note) => note.includes('APP50'));
        expect(couponNote).toBeDefined();
        expect(couponNote).toContain('TRADINGVIEW');
        expect(couponNote).toContain('typed');
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
            'optimize dp',
            'does not model',
        ]) {
            expect(resetNote).toContain(fact);
        }
        expect(resetNote).not.toContain('not modeled yet');
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
