import { type AccountState } from '~/lib/prop-calculator/core/AccountState';
import {
    type DayPolicy,
    type RungSizing,
} from '~/lib/prop-calculator/core/DayPolicy';
import { type CouponDiscounts } from '~/lib/prop-calculator/core/FeeSchedule';
import {
    type FundedCycleTracker,
    type FundedPayoutResult,
    restoreFundedCycleTracker,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import {
    type Dollars,
    type Fraction0to1,
} from '~/lib/prop-calculator/core/lib/units';
import { type PayoutRequestPolicy } from '~/lib/prop-calculator/core/PayoutRequestPolicy';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { type PositionSizingConfig } from '~/lib/prop-calculator/core/PositionSizing';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { deriveSubSeed, mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    binomialStandardError,
    type Estimate,
    meanStandardError,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import {
    assertDeclaredSizingMatchesPhase,
    SIM_INPUTS_REFUSAL_PREFIX,
    simInputsSizingIssue,
} from './dayPolicyValidation';
import { advanceFundedDay, FundedDayOutcomeKind } from './fundedPhase';
import {
    LossStreak,
    newPhaseStats,
    type PhaseStats,
    TradeTotals,
} from './PhaseStats';
import { simStartIssue } from './simStartValidation';
import { type FundedSimStart, type SimStart } from './types';
import { assertPositiveSafeInteger } from './validation';

export enum CopyGroupSimulationRejectionKind {
    DuplicateMemberId = 'duplicate-member-id',
    EvalGroupsNotSupported = 'eval-groups-not-supported',
    MemberRefused = 'member-refused',
    MixedStage = 'mixed-stage',
}

export enum CopyGroupSimulationResultKind {
    Rejected = 'rejected',
    Simulated = 'simulated',
}

export interface CopyGroupSimulationInputs {
    readonly commission: Dollars;
    readonly fundedHorizonDays: number;
    readonly idleDayProbability?: number;
    readonly intradayPathStepsPerR?: number;
    readonly members: readonly CopyGroupSimulationMember[];
    readonly rrRatio: number;
    readonly seed: number;
    readonly trials: number;
    readonly winrate: Fraction0to1;
}

export interface CopyGroupSimulationMember {
    readonly dayPolicy: DayPolicy;
    readonly discounts?: CouponDiscounts;
    readonly id: string;
    readonly minRetainedCushion: Dollars;
    readonly payoutRequestPolicy?: PayoutRequestPolicy;
    readonly payoutRequestSize: Dollars | undefined;
    readonly plan: Plan;
    readonly positionSizing: null | PositionSizingConfig;
    readonly rungSizing: RungSizing;
    readonly start: SimStart;
}

export interface CopyGroupSimulationMemberOutput {
    readonly expectedHorizonCredit: Estimate;
    readonly expectedPayoutCount: Estimate;
    readonly expectedRealizedPayout: Estimate;
    readonly expectedResetFees: Estimate;
    readonly memberId: string;
    readonly pBust: Estimate;
}

export interface CopyGroupSimulationOutputs {
    readonly expectedDaysToFirstBustGivenBust: null | UncertainValue;
    readonly expectedGroupHorizonCredit: Estimate;
    readonly expectedGroupResetFees: Estimate;
    readonly expectedRealizedGroupPayout: Estimate;
    readonly memberIds: readonly string[];
    readonly memberOutcomes: readonly CopyGroupSimulationMemberOutput[];
    readonly pAllBustSameDay: Estimate;
    readonly pAnyBust: Estimate;
    readonly trials: number;
}

export type CopyGroupSimulationRejection =
    | {
          readonly kind: CopyGroupSimulationRejectionKind.DuplicateMemberId;
          readonly memberId: string;
          readonly message: string;
      }
    | {
          readonly kind: CopyGroupSimulationRejectionKind.EvalGroupsNotSupported;
          readonly message: string;
      }
    | {
          readonly kind: CopyGroupSimulationRejectionKind.MemberRefused;
          readonly memberId: string;
          readonly message: string;
      }
    | {
          readonly kind: CopyGroupSimulationRejectionKind.MixedStage;
          readonly message: string;
          readonly stages: readonly TradingPhase[];
      };

export type CopyGroupSimulationResult =
    | (CopyGroupSimulationOutputs & {
          readonly kind: CopyGroupSimulationResultKind.Simulated;
      })
    | {
          readonly kind: CopyGroupSimulationResultKind.Rejected;
          readonly rejection: CopyGroupSimulationRejection;
      };

interface FundedMember extends CopyGroupSimulationMember {
    readonly start: FundedSimStart;
}

interface MemberMoments {
    readonly horizonCredit: Moments;
    readonly payoutCount: Moments;
    readonly realizedPayout: Moments;
    readonly resetFees: Moments;
}

interface MemberRuntime {
    daysToBust: null | number;
    done: boolean;
    fundedResetsUsed: number;
    horizonCredit: number;
    readonly member: FundedMember;
    realizedPayout: number;
    resetFeesPaid: number;
    readonly state: AccountState;
    readonly stats: PhaseStats;
    tracker: FundedCycleTracker;
}

interface Moments {
    count: number;
    squaredSum: number;
    sum: number;
}

const SEED_SPACE = 4_294_967_296;

const TRADE_SEED_STRIDE = 0x9e_37_79_b1;

export function simulateCopyGroup(
    inputs: CopyGroupSimulationInputs,
): CopyGroupSimulationResult {
    const { members, seed, trials } = inputs;
    if (members.length === 0) {
        throw new RangeError('simulateCopyGroup needs at least one member');
    }
    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(inputs.fundedHorizonDays, 'fundedHorizonDays');

    const stages = [...new Set(members.map((member) => member.start.phase))];
    if (stages.length > 1) {
        return rejected({
            kind: CopyGroupSimulationRejectionKind.MixedStage,
            message:
                'Every member of a simulated copy group must be in one stage before it can be simulated; group simulation needs one stage.',
            stages,
        });
    }
    const [stage] = stages;
    if (stage !== TradingPhase.Funded) {
        return rejected({
            kind: CopyGroupSimulationRejectionKind.EvalGroupsNotSupported,
            message:
                'Copy-group simulation covers funded-stage groups only; eval-stage copy groups are not modeled yet.',
        });
    }

    const duplicateId = firstDuplicateId(members);
    if (duplicateId !== null) {
        return rejected({
            kind: CopyGroupSimulationRejectionKind.DuplicateMemberId,
            memberId: duplicateId,
            message: `Copy-group member ids must be unique; "${duplicateId}" appears more than once.`,
        });
    }

    const fundedMembers = fundedMembersOf(members);
    for (const member of fundedMembers) {
        const issue =
            simStartIssue(member.plan, member.start, 0) ??
            memberSizingIssue(member);
        if (issue !== null) {
            return rejected({
                kind: CopyGroupSimulationRejectionKind.MemberRefused,
                memberId: member.id,
                message: stripRefusalPrefix(issue),
            });
        }
    }

    const memberMoments = fundedMembers.map((): MemberMoments => ({
        horizonCredit: newMoments(),
        payoutCount: newMoments(),
        realizedPayout: newMoments(),
        resetFees: newMoments(),
    }));
    const memberBustCounts = fundedMembers.map(() => 0);
    const groupHorizonCreditMoments = newMoments();
    const groupRealizedPayoutMoments = newMoments();
    const groupResetFeeMoments = newMoments();
    const daysToFirstBustMoments = newMoments();
    let anyBustCount = 0;
    let allBustSameDayCount = 0;

    for (let trial = 0; trial < trials; trial++) {
        const runtimes = fundedMembers.map((member) =>
            initMemberRuntime(member),
        );
        runGroupTrialDays(
            runtimes,
            inputs,
            mulberry32(deriveSubSeed(seed, trial, 0)),
        );

        let groupRealizedPayout = 0;
        let groupHorizonCredit = 0;
        let groupResetFees = 0;
        for (const [index, runtime] of runtimes.entries()) {
            if (!runtime.done) {
                runtime.horizonCredit = runtime.tracker.closeoutCredit({
                    minRetainedCushion: runtime.member.minRetainedCushion,
                    payoutRequestSize: runtime.member.payoutRequestSize,
                    plan: runtime.member.plan,
                    state: runtime.state,
                });
            }
            const moments = memberMoments[index];
            if (moments === undefined) {
                throw new RangeError(
                    `simulateCopyGroup has no moments for member ${index}`,
                );
            }
            record(moments.realizedPayout, runtime.realizedPayout);
            record(moments.horizonCredit, runtime.horizonCredit);
            record(moments.payoutCount, runtime.tracker.payoutsIssued);
            record(moments.resetFees, runtime.resetFeesPaid);
            groupRealizedPayout += runtime.realizedPayout;
            groupHorizonCredit += runtime.horizonCredit;
            groupResetFees += runtime.resetFeesPaid;
            if (runtime.daysToBust !== null) {
                memberBustCounts[index] = (memberBustCounts[index] ?? 0) + 1;
            }
        }
        record(groupRealizedPayoutMoments, groupRealizedPayout);
        record(groupHorizonCreditMoments, groupHorizonCredit);
        record(groupResetFeeMoments, groupResetFees);

        const bustDays = runtimes.flatMap((runtime) =>
            runtime.daysToBust === null ? [] : [runtime.daysToBust],
        );
        if (bustDays.length === 0) continue;

        anyBustCount += 1;
        record(daysToFirstBustMoments, Math.min(...bustDays));
        if (
            bustDays.length === runtimes.length &&
            new Set(bustDays).size === 1
        ) {
            allBustSameDayCount += 1;
        }
    }

    return {
        expectedDaysToFirstBustGivenBust:
            daysToFirstBustMoments.count === 0
                ? null
                : estimateOf(daysToFirstBustMoments),
        expectedGroupHorizonCredit: estimateOf(groupHorizonCreditMoments),
        expectedGroupResetFees: estimateOf(groupResetFeeMoments),
        expectedRealizedGroupPayout: estimateOf(groupRealizedPayoutMoments),
        kind: CopyGroupSimulationResultKind.Simulated,
        memberIds: fundedMembers.map((member) => member.id),
        memberOutcomes: fundedMembers.map((member, index) => {
            const moments = memberMoments[index];
            if (moments === undefined) {
                throw new RangeError(
                    `simulateCopyGroup has no moments for member ${member.id}`,
                );
            }
            return {
                expectedHorizonCredit: estimateOf(moments.horizonCredit),
                expectedPayoutCount: estimateOf(moments.payoutCount),
                expectedRealizedPayout: estimateOf(moments.realizedPayout),
                expectedResetFees: estimateOf(moments.resetFees),
                memberId: member.id,
                pBust: proportionEstimate(memberBustCounts[index] ?? 0, trials),
            };
        }),
        pAllBustSameDay: proportionEstimate(allBustSameDayCount, trials),
        pAnyBust: proportionEstimate(anyBustCount, trials),
        trials,
    };
}

function addPayout(
    runtime: MemberRuntime,
    payout: FundedPayoutResult | null,
): void {
    if (payout !== null) runtime.realizedPayout += payout.traderReceives;
}

function estimateOf(moments: Moments): Estimate {
    const value = moments.count === 0 ? 0 : moments.sum / moments.count;
    return {
        standardError: meanStandardError(
            moments.sum,
            moments.squaredSum,
            moments.count,
        ),
        value,
    };
}

function firstDuplicateId(
    members: readonly CopyGroupSimulationMember[],
): null | string {
    const seen = new Set<string>();
    for (const member of members) {
        if (seen.has(member.id)) return member.id;
        seen.add(member.id);
    }
    return null;
}

function fundedMembersOf(
    members: readonly CopyGroupSimulationMember[],
): FundedMember[] {
    return members.flatMap((member) =>
        member.start.phase === TradingPhase.Funded
            ? [
                  {
                      ...member,
                      minRetainedCushion: member.plan.resolveRetainedCushion(
                          member.minRetainedCushion,
                      ),
                      start: member.start,
                  },
              ]
            : [],
    );
}

function initMemberRuntime(member: FundedMember): MemberRuntime {
    const { start } = member;
    const state = { ...start.state };
    const totals = new TradeTotals();
    return {
        daysToBust: null,
        done: false,
        fundedResetsUsed: start.seed.fundedResetsUsed,
        horizonCredit: 0,
        member,
        realizedPayout: 0,
        resetFeesPaid: 0,
        state,
        stats: newPhaseStats(state.balance, totals, new LossStreak(totals)),
        tracker: restoreFundedCycleTracker(state, start.seed),
    };
}

function memberSizingIssue(member: FundedMember): null | string {
    const { dayPolicy, positionSizing } = member;
    if (positionSizing === null) return null;
    const sizingInputs = {
        instrument: positionSizing.instrument.symbol,
        stopPoints: positionSizing.stopPoints,
    };
    try {
        assertDeclaredSizingMatchesPhase(
            sizingInputs,
            dayPolicy,
            TradingPhase.Funded,
        );
    } catch (error) {
        if (error instanceof Error) return error.message;
        throw error;
    }
    return dayPolicy.computeRisk === undefined
        ? simInputsSizingIssue({
              ...sizingInputs,
              riskPerTrade: dayPolicy.ladder[0] ?? 0,
          })
        : null;
}

function newMoments(): Moments {
    return { count: 0, squaredSum: 0, sum: 0 };
}

function proportionEstimate(successes: number, trials: number): Estimate {
    const value = trials === 0 ? 0 : successes / trials;
    return { standardError: binomialStandardError(value, trials), value };
}

function record(moments: Moments, value: number): void {
    moments.count += 1;
    moments.sum += value;
    moments.squaredSum += value * value;
}

function rejected(
    rejection: CopyGroupSimulationRejection,
): CopyGroupSimulationResult {
    return { kind: CopyGroupSimulationResultKind.Rejected, rejection };
}

function runGroupTrialDays(
    runtimes: readonly MemberRuntime[],
    inputs: CopyGroupSimulationInputs,
    trialRng: Rng,
): void {
    for (let day = 0; day < inputs.fundedHorizonDays; day++) {
        if (runtimes.every((runtime) => runtime.done)) return;
        const daySeed = wholeSeedOf(trialRng());
        const idleDraw = mulberry32(daySeed)();
        const idleRng: Rng = () => idleDraw;
        const tradeRng = (tradeIndex: number): Rng =>
            mulberry32(tradeSeedOf(daySeed, tradeIndex));

        for (const runtime of runtimes) {
            if (runtime.done) continue;
            stepMemberDay(runtime, day, inputs, idleRng, tradeRng);
        }
    }
}

function stepMemberDay(
    runtime: MemberRuntime,
    day: number,
    inputs: CopyGroupSimulationInputs,
    idleRng: Rng,
    tradeRng: (tradeIndex: number) => Rng,
): void {
    const { member } = runtime;
    const outcome = advanceFundedDay({
        commission: inputs.commission,
        dayPolicy: member.dayPolicy,
        discounts: member.discounts,
        equityCurve: null,
        idleDayProbability: inputs.idleDayProbability,
        intradayPathStepsPerR: inputs.intradayPathStepsPerR,
        minRetainedCushion: member.minRetainedCushion,
        payoutRequestPolicy: member.payoutRequestPolicy,
        payoutRequestSize: member.payoutRequestSize,
        plan: member.plan,
        positionSizing: member.positionSizing,
        resetsUsed: runtime.fundedResetsUsed,
        rng: idleRng,
        rrRatio: inputs.rrRatio,
        rungSizing: member.rungSizing,
        state: runtime.state,
        stats: runtime.stats,
        tracker: runtime.tracker,
        tradeRng,
        winrate: inputs.winrate,
    });

    switch (outcome.kind) {
        case FundedDayOutcomeKind.Busted: {
            addPayout(runtime, outcome.payout);
            runtime.daysToBust = day + 1;
            runtime.done = true;
            return;
        }
        case FundedDayOutcomeKind.Concluded: {
            addPayout(runtime, outcome.payout);
            runtime.done = true;
            return;
        }
        case FundedDayOutcomeKind.Continued: {
            addPayout(runtime, outcome.payout);
            return;
        }
        case FundedDayOutcomeKind.Reset: {
            runtime.resetFeesPaid += outcome.fee;
            runtime.fundedResetsUsed += 1;
            runtime.tracker = outcome.tracker;
            return;
        }
    }
}

function stripRefusalPrefix(message: string): string {
    return message.startsWith(SIM_INPUTS_REFUSAL_PREFIX)
        ? message.slice(SIM_INPUTS_REFUSAL_PREFIX.length)
        : message;
}

function tradeSeedOf(daySeed: number, tradeIndex: number): number {
    const stride = Math.imul(tradeIndex + 1, TRADE_SEED_STRIDE);
    return wholeSeedOf(mulberry32(daySeed + stride)());
}

function wholeSeedOf(draw: number): number {
    return Math.floor(draw * SEED_SPACE);
}
