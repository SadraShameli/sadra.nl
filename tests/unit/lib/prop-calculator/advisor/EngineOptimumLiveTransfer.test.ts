import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    EngineOptimumRowKind,
    type EngineOptimumRunnerResult,
    type EnginePolicy,
    fundedCycleSeedFromTracker,
    FundedFromStateOptimumResultKind,
    FundedSweepOptimumResultKind,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import {
    DayStopRuleKind,
    FirmId,
    fraction,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type FundedSimStart,
    LiveTransferContinuationKind,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';

const HAZARD = 0.3;

function baseSimInputs(hazard: number | undefined): Omit<SimInputs, 'plan'> {
    return {
        fundedHorizonDays: 60,
        liveTransferHazard: hazard === undefined ? undefined : fraction(hazard),
        maxEvalDays: 40,
        payoutRequestSize: 2500,
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 40,
        winrate: 0.55,
    };
}

function freshSweepOf(hazard: number | undefined) {
    const plan = rapidEodPlan();
    const result = runEngineOptimum(plan, {
        base: baseSimInputs(hazard),
        candidates: {
            flat: [150, 250],
            fundedLadder: null,
            positionSizing: null,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        },
        policy: policyOf(plan),
        source: AdviceSource.FundedSweepFresh,
    });
    if (result.source !== AdviceSource.FundedSweepFresh) {
        throw new Error('expected a fresh funded sweep result');
    }
    return result;
}

function fromStateSweepOf(
    hazard: number | undefined,
): Extract<
    EngineOptimumRunnerResult,
    { source: AdviceSource.FundedSweepFromState }
> {
    const plan = rapidEodPlan();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = state.startingBalance + 800;
    const start: FundedSimStart = {
        phase: TradingPhase.Funded,
        seed: fundedCycleSeedFromTracker(
            plan,
            state,
            newFundedCycleTracker(state),
        ),
        state,
    };
    const result = runEngineOptimum(plan, {
        base: baseSimInputs(hazard),
        candidates: {
            flat: [150, 250],
            fundedLadder: null,
            positionSizing: null,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        },
        policy: policyOf(plan),
        source: AdviceSource.FundedSweepFromState,
        start,
    });
    if (result.source !== AdviceSource.FundedSweepFromState) {
        throw new Error('expected a from-state funded sweep result');
    }
    return result;
}

function policyOf(plan: Plan): EnginePolicy {
    return buildEnginePolicy({
        fundedHorizonDays: 60,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    }).policy;
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('the engine optimum carries the live-transfer assumption it priced (PT-73f step 6)', () => {
    describe('the fresh funded sweep', () => {
        it('names the hazard, the continuation and the share the winning row sent live', () => {
            const result = freshSweepOf(HAZARD);
            if (result.sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const winner = result.sweep.optimum.rows[0];
            if (winner?.kind !== EngineOptimumRowKind.Placed) {
                throw new Error('expected a placed winner');
            }

            expect(result.liveTransfer).toStrictEqual({
                bias: 'neutral',
                continuation: LiveTransferContinuationKind.NotModeled,
                hazard: HAZARD,
                kind: AssumptionKind.LiveTransferHazard,
                notes: [],
                sentLiveShare: winner.out.liveTransferProbability,
            });
            expect(winner.out.liveTransferProbability).toBeGreaterThan(0);
        });

        it('says nothing and stays unchanged when no hazard was priced', () => {
            const none = freshSweepOf(undefined);

            expect('liveTransfer' in none).toBe(false);
        });
    });

    describe('the funded from-state sweep', () => {
        it('names the hazard, the continuation and the share the winning row sent live', () => {
            const result = fromStateSweepOf(HAZARD);
            if (
                result.sweep.kind !== FundedFromStateOptimumResultKind.Optimum
            ) {
                throw new Error('expected an optimum');
            }
            const winner = result.sweep.optimum.rows[0];
            if (winner?.kind !== EngineOptimumRowKind.Placed) {
                throw new Error('expected a placed winner');
            }

            expect(result.sweep.optimum.liveTransfer).toStrictEqual({
                bias: 'neutral',
                continuation: LiveTransferContinuationKind.NotModeled,
                hazard: HAZARD,
                kind: AssumptionKind.LiveTransferHazard,
                notes: [],
                sentLiveShare: winner.out.liveTransferProbability,
            });
            expect(winner.out.liveTransferProbability).toBeGreaterThan(0);
        });

        it('says nothing and stays unchanged when no hazard was priced', () => {
            const none = fromStateSweepOf(undefined);
            if (none.sweep.kind !== FundedFromStateOptimumResultKind.Optimum) {
                throw new Error('expected an optimum');
            }

            expect('liveTransfer' in none.sweep.optimum).toBe(false);
        });
    });
});
