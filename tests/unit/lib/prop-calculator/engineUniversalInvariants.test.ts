import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    fraction,
    type Plan,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);
const TRIALS = 150;
const MONTE_CARLO_TOLERANCE = 3 / Math.sqrt(TRIALS);

function baseInputs(plan: Plan, overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        commissionPerRoundTrip: 4,
        dayStop: { kind: DayStopRuleKind.DayGreen },
        fundedHorizonDays: 60,
        maxEvalDays: 60,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: TRIALS,
        winrate: 0.4,
        ...overrides,
    };
}

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

describe.each(ALL_PLANS)(
    '$label: a Terminate daily loss limit never passes more often than its Lockout twin',
    (plan) => {
        const evalLimit = plan.dailyLossLimitFor(TradingPhase.Eval);
        if (evalLimit.kind === DailyLossLimitKind.None) {
            it('has no eval daily loss limit, so there is no twin comparison to run', () => {
                expect(evalLimit.kind).toBe(DailyLossLimitKind.None);
            });
            return;
        }

        it('Terminate.passProbability <= Lockout.passProbability within Monte Carlo tolerance', () => {
            const lockoutTwin = plan.withOverrides({
                evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
            });
            const terminateTwin = plan.withOverrides({
                evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
            });
            const lockoutOut = simulate(baseInputs(lockoutTwin));
            const terminateOut = simulate(baseInputs(terminateTwin));
            expect(terminateOut.passProbability).toBeLessThanOrEqual(
                lockoutOut.passProbability + MONTE_CARLO_TOLERANCE,
            );
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: every non-zero fee component moves costPerFundedAccount',
    (plan) => {
        const base = simulate(baseInputs(plan));
        if (base.passProbability <= 0) {
            it('never passes at these trading parameters, so cost-per-funded-account is Infinity for every candidate and there is nothing to compare', () => {
                expect(base.passProbability).toBe(0);
                expect(base.costPerFundedAccount).toBe(Infinity);
            });
            return;
        }

        it('raising activation strictly increases costPerFundedAccount and costPerDrawdownDollar', () => {
            const twin = plan.withOverrides({
                fees: {
                    ...plan.fees,
                    activation: dollars(plan.fees.activation + 500),
                },
            });
            const out = simulate(baseInputs(twin));
            expect(out.costPerFundedAccount).toBeGreaterThan(
                base.costPerFundedAccount,
            );
            expect(out.costPerDrawdownDollar).toBeGreaterThan(
                base.costPerDrawdownDollar,
            );
        });

        it('raising oneTimeEval strictly increases costPerFundedAccount and costPerDrawdownDollar', () => {
            const twin = plan.withOverrides({
                fees: {
                    ...plan.fees,
                    oneTimeEval: dollars(plan.fees.oneTimeEval + 500),
                },
            });
            const out = simulate(baseInputs(twin));
            expect(out.costPerFundedAccount).toBeGreaterThan(
                base.costPerFundedAccount,
            );
            expect(out.costPerDrawdownDollar).toBeGreaterThan(
                base.costPerDrawdownDollar,
            );
        });

        it('raising monthlySubscription strictly increases costPerFundedAccount and costPerDrawdownDollar', () => {
            const twin = plan.withOverrides({
                fees: {
                    ...plan.fees,
                    monthlySubscription: dollars(
                        plan.fees.monthlySubscription + 500,
                    ),
                },
            });
            const out = simulate(baseInputs(twin));
            expect(out.costPerFundedAccount).toBeGreaterThan(
                base.costPerFundedAccount,
            );
            expect(out.costPerDrawdownDollar).toBeGreaterThan(
                base.costPerDrawdownDollar,
            );
        });

        const hasAnyFee =
            plan.fees.activation > 0 ||
            plan.fees.oneTimeEval > 0 ||
            plan.fees.monthlySubscription > 0;
        if (hasAnyFee) {
            it('reports costPerFundedAccount and costPerDrawdownDollar strictly greater than zero', () => {
                expect(base.costPerFundedAccount).toBeGreaterThan(0);
                expect(base.costPerDrawdownDollar).toBeGreaterThan(0);
            });
        }
    },
);

describe.each(ALL_PLANS)(
    '$label: fees are causally inert to trading outcomes',
    (plan) => {
        it('overriding the entire fee schedule leaves every trading-outcome field byte-identical', () => {
            const base = simulate(baseInputs(plan));
            const twin = plan.withOverrides({
                fees: {
                    activation: dollars(plan.fees.activation + 999),
                    monthlySubscription: dollars(
                        plan.fees.monthlySubscription + 999,
                    ),
                    oneTimeEval: dollars(plan.fees.oneTimeEval + 999),
                    reset: dollars(plan.fees.reset + 999),
                },
            });
            const out = simulate(baseInputs(twin));
            expect(out.passProbability).toBe(base.passProbability);
            expect(out.bustProbability).toBe(base.bustProbability);
            expect(out.timeoutProbability).toBe(base.timeoutProbability);
            expect(out.fundedBustProbability).toBe(base.fundedBustProbability);
            expect(out.finalBalances).toStrictEqual(base.finalBalances);
            expect(out.daysToPassValues).toStrictEqual(base.daysToPassValues);
            expect(out.expectedGrossPayout).toBe(base.expectedGrossPayout);
            expect(out.maxDrawdownP50).toBe(base.maxDrawdownP50);
            expect(out.maxDrawdownP95).toBe(base.maxDrawdownP95);
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: idleDayProbability is never a no-op, regardless of whether a closure rule exists',
    (plan) => {
        for (const phase of [TradingPhase.Eval, TradingPhase.Funded]) {
            it(`phase=${phase}: idleDayProbability 1 forces an idle day; idleDayProbability 0 never does`, () => {
                const idleState = plan.initialState();
                if (phase === TradingPhase.Funded) {
                    plan.beginFundedPhase(idleState);
                }
                const idleResult = runDay({
                    commission: dollars(0),
                    dayPolicy: {
                        ladder: [2000, 2000, 2000, 2000],
                        maxLossesPerDay: null,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                    idleDayProbability: 1,
                    phase,
                    plan,
                    positionSizing: null,
                    rng: () => 0,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state: idleState,
                    stats: freshStats(idleState.startingBalance),
                    winrate: fraction(0.4),
                });
                expect(idleResult.traded).toBe(false);
                expect(idleState.consecutiveIdleDays).toBe(1);

                const tradedState = plan.initialState();
                if (phase === TradingPhase.Funded) {
                    plan.beginFundedPhase(tradedState);
                }
                const tradedResult = runDay({
                    commission: dollars(0),
                    dayPolicy: {
                        ladder: [1],
                        maxLossesPerDay: null,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                    idleDayProbability: 0,
                    phase,
                    plan,
                    positionSizing: null,
                    rng: () => 0,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state: tradedState,
                    stats: freshStats(tradedState.startingBalance),
                    winrate: fraction(0.4),
                });
                expect(tradedResult.traded).toBe(true);
            });
        }
    },
);

describe.each(ALL_PLANS)(
    '$label: inactivity closure fires if and only if the plan declares the ' +
        'rule for that phase (driven per-phase via runDay directly, not ' +
        'simulate(), because an all-idle run can never trade its way past ' +
        'eval to reach a funded-only rule -- idleDayProbability:1 from day ' +
        'one means the eval profit target is never hit, so simulate() ' +
        'would time out during eval before a funded-only rule ever gets ' +
        'a chance to fire)',
    (plan) => {
        const idleDayPolicy: DayPolicy = {
            ladder: [2000, 2000, 2000, 2000],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        };

        for (const phase of [TradingPhase.Eval, TradingPhase.Funded]) {
            const limit = plan.maxConsecutiveIdleDaysFor(phase);

            if (limit === null) {
                it(`phase=${phase}: has no inactivity rule, so it is never closed no matter how many idle days accumulate`, () => {
                    const state = plan.initialState();
                    if (phase === TradingPhase.Funded) {
                        plan.beginFundedPhase(state);
                    }
                    const stats = freshStats(state.startingBalance);
                    for (let day = 0; day < 30; day++) {
                        const result = runDay({
                            commission: dollars(0),
                            dayPolicy: idleDayPolicy,
                            idleDayProbability: 1,
                            phase,
                            plan,
                            positionSizing: null,
                            rng: () => 0,
                            rrRatio: 2,
                            rungSizing: RungSizing.CapToCushion,
                            state,
                            stats,
                            winrate: fraction(0.4),
                        });
                        expect(result.closedForInactivity).toBe(false);
                    }
                });
            } else {
                it(`phase=${phase}: declares a ${limit}-day inactivity rule, so it closes on exactly the ${limit}th consecutive idle day`, () => {
                    const state = plan.initialState();
                    if (phase === TradingPhase.Funded) {
                        plan.beginFundedPhase(state);
                    }
                    const stats = freshStats(state.startingBalance);
                    let lastResult: ReturnType<typeof runDay> | undefined;
                    for (let day = 1; day <= limit; day++) {
                        lastResult = runDay({
                            commission: dollars(0),
                            dayPolicy: idleDayPolicy,
                            idleDayProbability: 1,
                            phase,
                            plan,
                            positionSizing: null,
                            rng: () => 0,
                            rrRatio: 2,
                            rungSizing: RungSizing.CapToCushion,
                            state,
                            stats,
                            winrate: fraction(0.4),
                        });
                        if (day < limit) {
                            expect(lastResult.busted).toBe(false);
                        }
                    }
                    expect(lastResult?.busted).toBe(true);
                    expect(lastResult?.closedForInactivity).toBe(true);
                });
            }
        }
    },
);

const CAPPED_PLANS = ALL_PLANS.filter(
    (plan) => plan.maxEvalTradingDays !== null,
);

describe('registry sanity: at least one plan declares maxEvalTradingDays', () => {
    it('the capped-plan subset is non-empty', () => {
        expect(CAPPED_PLANS.length).toBeGreaterThan(0);
    });
});

describe.each(CAPPED_PLANS)(
    '$label: an eval day cap makes excess requested days inert',
    (plan) => {
        it('a far-above-cap maxEvalDays produces byte-identical output to the cap itself, and no pass exceeds it', () => {
            const capped = simulate(
                baseInputs(plan, { maxEvalDays: plan.evalDayCap(100_000) }),
            );
            const overshot = simulate(
                baseInputs(plan, { maxEvalDays: 100_000 }),
            );
            expect(overshot).toStrictEqual(capped);
            for (const days of overshot.daysToPassValues) {
                expect(days).toBeLessThanOrEqual(plan.evalDayCap(100_000));
            }
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: seed determinism and seed sensitivity',
    (plan) => {
        it('identical seeds give deeply equal output; a different seed differs in at least one field', () => {
            const first = simulate(baseInputs(plan));
            const same = simulate(baseInputs(plan));
            expect(same).toStrictEqual(first);

            const different = simulate(baseInputs(plan, { seed: 1337 }));
            expect(different).not.toStrictEqual(first);
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: an evalDayPolicy ladder wins totally over riskPerTrade/tradesPerDay, never partially',
    (plan) => {
        it(
            'varying riskPerTrade/tradesPerDay leaves output byte-identical once ' +
                'evalDayPolicy is set, PROVIDED fundedRiskPerTrade/fundedTradesPerDay ' +
                'are pinned separately -- both scalars are also the funded-phase ' +
                'fallback default (day.ts:37,52), so leaving them unpinned would ' +
                'let a real funded-side effect masquerade as an eval-side leak. ' +
                'expectancyR is excluded from the byte-identical comparison and ' +
                'checked separately below: engine.ts:181 computes it as ' +
                'expectancyDollars / riskPerTrade unconditionally, phase- and ' +
                'day-policy-agnostic, so it is a genuine, documented consumer of ' +
                'the raw riskPerTrade scalar even once a ladder governs actual ' +
                'position sizing -- this is not a leak',
            () => {
                const ladder: DayPolicy = {
                    ladder: [200, 300, 400, 100],
                    maxLossesPerDay: null,
                    stopRule: { kind: DayStopRuleKind.DayGreen },
                };
                const first = simulate(
                    baseInputs(plan, {
                        evalDayPolicy: ladder,
                        fundedRiskPerTrade: 250,
                        fundedTradesPerDay: 4,
                        riskPerTrade: 250,
                        tradesPerDay: 4,
                    }),
                );
                const withDifferentScalars = simulate(
                    baseInputs(plan, {
                        evalDayPolicy: ladder,
                        fundedRiskPerTrade: 250,
                        fundedTradesPerDay: 4,
                        riskPerTrade: 999,
                        tradesPerDay: 1,
                    }),
                );

                const { expectancyR: firstExpectancyR, ...firstRest } = first;
                const { expectancyR: differentExpectancyR, ...differentRest } =
                    withDifferentScalars;
                expect(differentRest).toStrictEqual(firstRest);
                expect(differentExpectancyR).toBeCloseTo(
                    (firstExpectancyR * 250) / 999,
                    6,
                );
            },
        );
    },
);
