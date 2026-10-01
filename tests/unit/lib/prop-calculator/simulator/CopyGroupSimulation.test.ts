import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    flatDayPolicy,
    fraction,
    type FundedCycleSeed,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    PolicySizing,
    resolvePositionSizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    advanceFundedDay,
    type CopyGroupSimulationMember,
    CopyGroupSimulationRejectionKind,
    CopyGroupSimulationResultKind,
    type DayRunOptions,
    FundedDayOutcomeKind,
    type FundedDayStepOptions,
    type FundedSimStart,
    LossStreak,
    newPhaseStats,
    runDay,
    simulateCopyGroup,
    simulateFromState,
    stepFundedDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { dayRunOptionsFor } from '../dayRunOptions';
import {
    fundedResetToyPlan,
    payoutCapToyPlan,
    TOY_FUNDED_RESET_FEE,
} from './toyPlans';

function countedRng(seed: number): { draws: () => number; rng: Rng } {
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

function fixedTradeRng(value: number): (tradeIndex: number) => Rng {
    return () => () => value;
}

function fundedStartFor(plan: Plan): FundedSimStart {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return { phase: TradingPhase.Funded, seed: seedFor(plan), state };
}

function lossDayFor(plan: Plan): ReturnType<typeof advanceFundedDay> {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const totals = new TradeTotals();
    const stats = newPhaseStats(state.balance, totals, new LossStreak(totals));
    return advanceFundedDay({
        commission: dollars(0),
        dayPolicy: flatDayPolicy(
            150,
            1,
            { kind: DayStopRuleKind.None },
            PolicySizing.ContractCapped,
        ),
        discounts: undefined,
        equityCurve: null,
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        resetsUsed: 0,
        rng: () => 0.5,
        rrRatio: 1,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        tracker: newFundedCycleTracker(state),
        tradeRng: fixedTradeRng(0.9),
        winrate: fraction(0.5),
    });
}

function memberFor(
    id: string,
    plan: Plan,
    riskPerTrade: number,
): CopyGroupSimulationMember {
    return {
        dayPolicy: flatDayPolicy(
            riskPerTrade,
            1,
            { kind: DayStopRuleKind.None },
            PolicySizing.ContractCapped,
        ),
        id,
        minRetainedCushion: dollars(0),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rungSizing: RungSizing.CapToCushion,
        start: fundedStartFor(plan),
    };
}

function sameCushionMemberFor(
    id: string,
    plan: Plan,
    riskPerTrade: number,
): CopyGroupSimulationMember {
    return {
        ...memberFor(id, plan, riskPerTrade),
        minRetainedCushion: dollars(300),
    };
}

function seedFor(plan: Plan): FundedCycleSeed {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return {
        calendarDayGateProgress: 0,
        cumulativePayout: 0,
        cycleBestDayProfit: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: state.balance,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: 0,
    };
}

function simulatedOf(
    result: ReturnType<typeof simulateCopyGroup>,
): Extract<
    ReturnType<typeof simulateCopyGroup>,
    { kind: CopyGroupSimulationResultKind.Simulated }
> {
    if (result.kind !== CopyGroupSimulationResultKind.Simulated) {
        throw new Error('expected a simulated copy group result');
    }
    return result;
}

function widerDrawdownPlan(): Plan {
    return payoutCapToyPlan().withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(300),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
    });
}

describe('the per-trade outcome RNG seam (runDay, stepFundedDay)', () => {
    it('is byte-identical to the pinned draw pattern when tradeRng is absent', () => {
        const counted = countedRng(11);
        const plan = payoutCapToyPlan();
        const state = plan.initialState();
        const totals = new TradeTotals();
        const stats = newPhaseStats(
            state.startingBalance,
            totals,
            new LossStreak(totals),
        );
        runDay(
            dayRunOptionsFor(TradingPhase.Eval, {
                commission: dollars(0),
                dayPolicy: flatDayPolicy(
                    40,
                    3,
                    { kind: DayStopRuleKind.None },
                    PolicySizing.ContractCapped,
                ),
                plan,
                positionSizing: null,
                rng: counted.rng,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                winrate: fraction(0.5),
            } satisfies Omit<DayRunOptions, 'fundedCycle' | 'phase'>),
        );
        expect(counted.draws()).toBe(3);
    });

    it('draws trade k only from tradeRng(k), never the shared rng, and identically for two different plans', () => {
        const isWin = (plan: Plan, drawValue: number): boolean => {
            const state = plan.initialState();
            const totals = new TradeTotals();
            const stats = newPhaseStats(
                state.startingBalance,
                totals,
                new LossStreak(totals),
            );
            runDay(
                dayRunOptionsFor(TradingPhase.Eval, {
                    commission: dollars(0),
                    dayPolicy: flatDayPolicy(
                        40,
                        1,
                        { kind: DayStopRuleKind.None },
                        PolicySizing.ContractCapped,
                    ),
                    plan,
                    positionSizing: null,
                    rng: () => {
                        throw new Error(
                            'the shared rng must not be drawn for the trade outcome once tradeRng is supplied',
                        );
                    },
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state,
                    stats,
                    tradeRng: fixedTradeRng(drawValue),
                    winrate: fraction(0.5),
                } satisfies Omit<DayRunOptions, 'fundedCycle' | 'phase'>),
            );
            return state.balance > state.startingBalance;
        };

        const planA = payoutCapToyPlan();
        const planB = payoutCapToyPlan().withOverrides({
            accountSize: dollars(2000),
        });
        expect(isWin(planA, 0.1)).toBe(true);
        expect(isWin(planB, 0.1)).toBe(true);
        expect(isWin(planA, 0.9)).toBe(false);
        expect(isWin(planB, 0.9)).toBe(false);
    });

    it('gives each trade of a day its own tradeRng(k) draw, in trade order', () => {
        const plan = payoutCapToyPlan();
        const state = plan.initialState();
        const totals = new TradeTotals();
        const stats = newPhaseStats(
            state.startingBalance,
            totals,
            new LossStreak(totals),
        );
        const requested: number[] = [];
        runDay(
            dayRunOptionsFor(TradingPhase.Eval, {
                commission: dollars(0),
                dayPolicy: flatDayPolicy(
                    40,
                    3,
                    { kind: DayStopRuleKind.None },
                    PolicySizing.ContractCapped,
                ),
                plan,
                positionSizing: null,
                rng: () => {
                    throw new Error('the shared rng must not be drawn');
                },
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                tradeRng: (tradeIndex) => {
                    requested.push(tradeIndex);
                    return () => (tradeIndex === 1 ? 0.9 : 0.1);
                },
                winrate: fraction(0.5),
            } satisfies Omit<DayRunOptions, 'fundedCycle' | 'phase'>),
        );
        expect(requested).toStrictEqual([0, 1, 2]);
        expect(state.balance).toBe(state.startingBalance + 80 - 40 + 80);
    });

    it('draws every step of a path-walk trade from tradeRng(k) and never the shared rng', () => {
        const plan = findFirm(FirmId.Apex)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        });
        if (!plan) throw new Error('Apex Intraday 50K plan not found');
        const state = plan.initialState();
        const totals = new TradeTotals();
        const stats = newPhaseStats(
            state.startingBalance,
            totals,
            new LossStreak(totals),
        );
        const requested: number[] = [];
        runDay(
            dayRunOptionsFor(TradingPhase.Eval, {
                commission: dollars(0),
                dayPolicy: flatDayPolicy(
                    250,
                    2,
                    { kind: DayStopRuleKind.None },
                    PolicySizing.ContractCapped,
                ),
                intradayPathStepsPerR: 10,
                plan,
                positionSizing: null,
                rng: () => {
                    throw new Error('the shared rng must not be drawn');
                },
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                tradeRng: (tradeIndex) => {
                    requested.push(tradeIndex);
                    return mulberry32(100 + tradeIndex);
                },
                winrate: fraction(0.4),
            } satisfies Omit<DayRunOptions, 'fundedCycle' | 'phase'>),
        );
        expect(requested).toStrictEqual([0, 1]);
        expect(state.balance).not.toBe(state.startingBalance);
    });

    it('threads tradeRng through stepFundedDay the same way as runDay', () => {
        const plan = payoutCapToyPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const totals = new TradeTotals();
        const stats = newPhaseStats(state.balance, totals, new LossStreak(totals));
        const tracker = newFundedCycleTracker(state);
        stepFundedDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(
                40,
                1,
                { kind: DayStopRuleKind.None },
                PolicySizing.ContractCapped,
            ),
            plan,
            positionSizing: null,
            rng: () => {
                throw new Error('the shared rng must not be drawn');
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            tracker,
            tradeRng: fixedTradeRng(0),
            winrate: fraction(0.5),
        } satisfies FundedDayStepOptions);
        expect(state.balance).toBe(state.startingBalance + 80);
    });
});

describe('advanceFundedDay (the one funded day step shared by runFundedDays and the copy group)', () => {
    it('reports a bust with no payout when the plan has no funded reset', () => {
        const outcome = lossDayFor(payoutCapToyPlan());
        expect(outcome.kind).toBe(FundedDayOutcomeKind.Busted);
        if (outcome.kind !== FundedDayOutcomeKind.Busted) return;
        expect(outcome.payout).toBeNull();
        expect(outcome.closedForInactivity).toBe(false);
    });

    it('reports a reset with its fee and a fresh tracker when the plan allows a funded reset', () => {
        const outcome = lossDayFor(fundedResetToyPlan());
        expect(outcome.kind).toBe(FundedDayOutcomeKind.Reset);
        if (outcome.kind !== FundedDayOutcomeKind.Reset) return;
        expect(outcome.fee).toBe(TOY_FUNDED_RESET_FEE);
        expect(outcome.tracker.payoutsIssued).toBe(0);
    });
});

describe('simulateCopyGroup rejects a group it cannot simulate', () => {
    it('rejects a mixed-stage group without simulating anyone', () => {
        const plan = payoutCapToyPlan();
        const fundedMember = memberFor('funded-member', plan, 40);
        const evalMember: CopyGroupSimulationMember = {
            ...fundedMember,
            id: 'eval-member',
            start: { phase: TradingPhase.Eval, state: plan.initialState() },
        };
        const result = simulateCopyGroup({
            commission: dollars(0),
            fundedHorizonDays: 10,
            members: [fundedMember, evalMember],
            rrRatio: 2,
            seed: 1,
            trials: 5,
            winrate: fraction(0.5),
        });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MixedStage,
        );
    });

    it('rejects an all-eval group as not supported yet (Q37 default: funded only)', () => {
        const plan = payoutCapToyPlan();
        const evalMember: CopyGroupSimulationMember = {
            ...memberFor('eval-member', plan, 40),
            start: { phase: TradingPhase.Eval, state: plan.initialState() },
        };
        const result = simulateCopyGroup({
            commission: dollars(0),
            fundedHorizonDays: 10,
            members: [evalMember],
            rrRatio: 2,
            seed: 1,
            trials: 5,
            winrate: fraction(0.5),
        });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.EvalGroupsNotSupported,
        );
    });

    it('gives a typed per-member rejection, never a thrown error, for an already-busted member', () => {
        const plan = payoutCapToyPlan();
        const bustedState = plan.initialState();
        plan.beginFundedPhase(bustedState);
        bustedState.balance = 0;
        const member: CopyGroupSimulationMember = {
            ...memberFor('busted-member', plan, 40),
            start: {
                phase: TradingPhase.Funded,
                seed: seedFor(plan),
                state: bustedState,
            },
        };
        const result = simulateCopyGroup({
            commission: dollars(0),
            fundedHorizonDays: 10,
            members: [member],
            rrRatio: 2,
            seed: 1,
            trials: 5,
            winrate: fraction(0.5),
        });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MemberRefused,
        );
        if (result.rejection.kind !== CopyGroupSimulationRejectionKind.MemberRefused) {
            return;
        }
        expect(result.rejection.memberId).toBe('busted-member');
        expect(result.rejection.message).not.toMatch(/^refused:/);
    });
});

describe('simulateCopyGroup drives cross-plan members from one shared outcome stream', () => {
    it('busts two identical members on exactly the same day in every trial', () => {
        const plan = payoutCapToyPlan();
        const memberOne = memberFor('one', plan, 60);
        const memberTwo = memberFor('two', plan, 60);
        const result = simulateCopyGroup({
            commission: dollars(0),
            fundedHorizonDays: 40,
            members: [memberOne, memberTwo],
            rrRatio: 1,
            seed: 7,
            trials: 300,
            winrate: fraction(0.35),
        });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Simulated);
        if (result.kind !== CopyGroupSimulationResultKind.Simulated) return;
        expect(result.pAnyBust.value).toBeGreaterThan(0);
        expect(result.pAllBustSameDay.value).toBe(result.pAnyBust.value);
    });

    it('places each member at its own plan-derived risk while sharing win/loss outcomes', () => {
        const narrow = sameCushionMemberFor('narrow', payoutCapToyPlan(), 60);
        const wide = sameCushionMemberFor('wide', widerDrawdownPlan(), 60);
        const result = simulatedOf(
            simulateCopyGroup({
                commission: dollars(0),
                fundedHorizonDays: 30,
                members: [narrow, wide],
                rrRatio: 1,
                seed: 3,
                trials: 400,
                winrate: fraction(0.4),
            }),
        );
        const [narrowOutcome, wideOutcome] = result.memberOutcomes;
        expect(wideOutcome?.pBust.value).toBeGreaterThan(0);
        expect(wideOutcome?.pBust.value).toBeLessThan(
            narrowOutcome?.pBust.value ?? 0,
        );
        expect(result.pAnyBust.value).toBe(narrowOutcome?.pBust.value);
    });

    it('shares the idle draw of each day across members on different plans', () => {
        const narrow = sameCushionMemberFor('narrow', payoutCapToyPlan(), 60);
        const wide = sameCushionMemberFor('wide', widerDrawdownPlan(), 60);
        const result = simulatedOf(
            simulateCopyGroup({
                commission: dollars(0),
                fundedHorizonDays: 30,
                idleDayProbability: 0.5,
                members: [narrow, wide],
                rrRatio: 1,
                seed: 5,
                trials: 400,
                winrate: fraction(0.4),
            }),
        );
        const [narrowOutcome, wideOutcome] = result.memberOutcomes;
        expect(wideOutcome?.pBust.value).toBeGreaterThan(0);
        expect(wideOutcome?.pBust.value).toBeLessThan(
            narrowOutcome?.pBust.value ?? 0,
        );
        expect(result.pAnyBust.value).toBe(narrowOutcome?.pBust.value);
    });

    it('reports different bust days for members with different drawdowns, and counts days to the first bust', () => {
        const narrow = sameCushionMemberFor('narrow', payoutCapToyPlan(), 60);
        const wide = sameCushionMemberFor('wide', widerDrawdownPlan(), 60);
        const result = simulatedOf(
            simulateCopyGroup({
                commission: dollars(0),
                fundedHorizonDays: 30,
                members: [narrow, wide],
                rrRatio: 1,
                seed: 1,
                trials: 20,
                winrate: fraction(0),
            }),
        );
        expect(result.pAnyBust.value).toBe(1);
        expect(result.pAllBustSameDay.value).toBe(0);
        expect(result.expectedDaysToFirstBustGivenBust?.value).toBe(2);
    });

    it('has no days to first bust when no member ever busts', () => {
        const safeMember = memberFor('safe', payoutCapToyPlan(), 40);
        const result = simulatedOf(
            simulateCopyGroup({
                commission: dollars(0),
                fundedHorizonDays: 10,
                members: [safeMember],
                rrRatio: 1,
                seed: 1,
                trials: 20,
                winrate: fraction(1),
            }),
        );
        expect(result.pAnyBust.value).toBe(0);
        expect(result.expectedDaysToFirstBustGivenBust).toBeNull();
    });

    it('draws independent trials: the spread of pBust across seeds matches its reported standard error', () => {
        const member = memberFor('solo', payoutCapToyPlan(), 45);
        const seedRng = mulberry32(12_345);
        const values: number[] = [];
        let standardErrorSum = 0;
        const replicates = 60;
        for (let replicate = 0; replicate < replicates; replicate++) {
            const replicateSeed = Math.floor(seedRng() * 2_147_483_647);
            const result = simulatedOf(
                simulateCopyGroup({
                    commission: dollars(0),
                    fundedHorizonDays: 30,
                    members: [member],
                    rrRatio: 1,
                    seed: replicateSeed,
                    trials: 200,
                    winrate: fraction(0.5),
                }),
            );
            values.push(result.pAnyBust.value);
            standardErrorSum += result.pAnyBust.standardError;
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / replicates;
        const spread = Math.sqrt(
            values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
                (replicates - 1),
        );
        const ratio = spread / (standardErrorSum / replicates);
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.4);
    });

    it('matches simulateFromState within 3 combined SEs on bust probability and payout count for a group of one', () => {
        const plan = payoutCapToyPlan();
        const member = memberFor('solo', plan, 45);
        const trials = 6000;
        const groupResult = simulateCopyGroup({
            commission: dollars(0),
            fundedHorizonDays: 30,
            members: [member],
            rrRatio: 1,
            seed: 21,
            trials,
            winrate: fraction(0.5),
        });
        expect(groupResult.kind).toBe(CopyGroupSimulationResultKind.Simulated);
        if (groupResult.kind !== CopyGroupSimulationResultKind.Simulated) return;

        const start = member.start as FundedSimStart;
        const fromState = simulateFromState({
            fundedHorizonDays: 30,
            maxEvalDays: 1,
            minRetainedCushion: 0,
            plan,
            riskPerTrade: 45,
            rrRatio: 1,
            seed: 99,
            start,
            tradesPerDay: 1,
            trials,
            winrate: 0.5,
        });

        const [outcome] = groupResult.memberOutcomes;
        if (outcome === undefined) throw new Error('expected one member outcome');

        const bustCombinedSe = Math.hypot(
            outcome.pBust.standardError,
                fromState.estimates.fundedBustProbability.standardError,
        );
        expect(
            Math.abs(outcome.pBust.value - fromState.fundedBustProbability),
        ).toBeLessThanOrEqual(3 * bustCombinedSe);

        const payoutCombinedSe = Math.hypot(
            outcome.expectedPayoutCount.standardError,
            fromState.estimates.expectedPayoutCount.standardError,
        );
        expect(
            Math.abs(
                outcome.expectedPayoutCount.value -
                    fromState.expectedPayoutCount,
            ),
        ).toBeLessThanOrEqual(3 * payoutCombinedSe);

        const dollarsCombinedSe = Math.hypot(
            outcome.expectedRealizedPayout.standardError,
            fromState.estimates.expectedGrossPayout.standardError,
        );
        expect(outcome.expectedRealizedPayout.value).toBeGreaterThan(0);
        expect(
            Math.abs(
                outcome.expectedRealizedPayout.value -
                    fromState.expectedGrossPayout,
            ),
        ).toBeLessThanOrEqual(3 * dollarsCombinedSe);

        const creditCombinedSe = Math.hypot(
            outcome.expectedHorizonCredit.standardError,
            fromState.estimates.expectedHorizonCredit.standardError,
        );
        expect(outcome.expectedHorizonCredit.value).toBeGreaterThan(0);
        expect(
            Math.abs(
                outcome.expectedHorizonCredit.value -
                    fromState.expectedHorizonCredit,
            ),
        ).toBeLessThanOrEqual(3 * creditCombinedSe);
    });

    it('charges funded resets like simulateFromState and surfaces the fees per member and for the group', () => {
        const plan = fundedResetToyPlan();
        const member = memberFor('resetter', plan, 45);
        const trials = 6000;
        const groupResult = simulatedOf(
            simulateCopyGroup({
                commission: dollars(0),
                fundedHorizonDays: 30,
                members: [member],
                rrRatio: 1,
                seed: 31,
                trials,
                winrate: fraction(0.5),
            }),
        );
        const fromState = simulateFromState({
            fundedHorizonDays: 30,
            maxEvalDays: 1,
            minRetainedCushion: 0,
            plan,
            riskPerTrade: 45,
            rrRatio: 1,
            seed: 77,
            start: member.start,
            tradesPerDay: 1,
            trials,
            winrate: 0.5,
        });
        const [outcome] = groupResult.memberOutcomes;
        if (outcome === undefined) throw new Error('expected one member outcome');

        const expectedFees = fromState.expectedFundedResets * TOY_FUNDED_RESET_FEE;
        expect(outcome.expectedResetFees.value).toBeGreaterThan(0);
        expect(groupResult.expectedGroupResetFees.value).toBe(
            outcome.expectedResetFees.value,
        );
        expect(
            Math.abs(outcome.expectedResetFees.value - expectedFees),
        ).toBeLessThanOrEqual(3 * Math.SQRT2 * outcome.expectedResetFees.standardError);
        expect(
            Math.abs(
                outcome.pBust.value - fromState.fundedBustProbability,
            ),
        ).toBeLessThanOrEqual(
            3 *
                Math.hypot(
                    outcome.pBust.standardError,
                    fromState.estimates.fundedBustProbability.standardError,
                ),
        );
    });
});

describe('simulateCopyGroup refuses a member it cannot simulate honestly', () => {
    const baseInputs = {
        commission: dollars(0),
        fundedHorizonDays: 10,
        rrRatio: 2,
        seed: 1,
        trials: 5,
        winrate: fraction(0.5),
    };

    it('rejects duplicate member ids with a typed reason instead of merging their results', () => {
        const plan = payoutCapToyPlan();
        const result = simulateCopyGroup({
            ...baseInputs,
            members: [memberFor('a', plan, 40), memberFor('a', plan, 40)],
        });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.DuplicateMemberId,
        );
        if (
            result.rejection.kind !==
            CopyGroupSimulationRejectionKind.DuplicateMemberId
        ) {
            return;
        }
        expect(result.rejection.memberId).toBe('a');
    });

    it('rejects a whole-contract member whose risk is below one contract, since it would never trade', () => {
        const plan = payoutCapToyPlan();
        const member: CopyGroupSimulationMember = {
            ...memberFor('too-small', plan, 300),
            dayPolicy: flatDayPolicy(
                300,
                1,
                { kind: DayStopRuleKind.None },
                PolicySizing.WholeContracts,
            ),
            positionSizing: resolvePositionSizing(InstrumentSymbol.ES, 10),
        };
        const result = simulateCopyGroup({ ...baseInputs, members: [member] });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MemberRefused,
        );
        if (result.rejection.kind !== CopyGroupSimulationRejectionKind.MemberRefused) {
            return;
        }
        expect(result.rejection.memberId).toBe('too-small');
        expect(result.rejection.message).toMatch(/below one ES contract/);
        expect(result.rejection.message).not.toMatch(/^Invalid SimInputs/);
    });

    it('rejects a member whose declared policy sizing does not match the funded placement', () => {
        const plan = payoutCapToyPlan();
        const member: CopyGroupSimulationMember = {
            ...memberFor('mismatch', plan, 600),
            positionSizing: resolvePositionSizing(InstrumentSymbol.ES, 10),
        };
        const result = simulateCopyGroup({ ...baseInputs, members: [member] });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Rejected);
        if (result.kind !== CopyGroupSimulationResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSimulationRejectionKind.MemberRefused,
        );
        if (result.rejection.kind !== CopyGroupSimulationRejectionKind.MemberRefused) {
            return;
        }
        expect(result.rejection.message).toMatch(/wholeContracts/);
        expect(result.rejection.message).not.toMatch(/^Invalid SimInputs/);
    });

    it('simulates a whole-contract member whose risk covers at least one contract', () => {
        const plan = payoutCapToyPlan();
        const member: CopyGroupSimulationMember = {
            ...memberFor('sized', plan, 600),
            dayPolicy: flatDayPolicy(
                600,
                1,
                { kind: DayStopRuleKind.None },
                PolicySizing.WholeContracts,
            ),
            positionSizing: resolvePositionSizing(InstrumentSymbol.ES, 10),
        };
        const result = simulateCopyGroup({ ...baseInputs, members: [member] });
        expect(result.kind).toBe(CopyGroupSimulationResultKind.Simulated);
    });
});
