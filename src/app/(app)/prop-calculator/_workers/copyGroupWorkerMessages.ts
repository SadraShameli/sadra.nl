import { describeSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import {
    type AccountState,
    type CouponDiscounts,
    type DayStopRule,
    type Dollars,
    findFirm,
    flatDayPolicy,
    type Fraction0to1,
    type FundedCycleSeed,
    type InstrumentSymbol,
    type PayoutRequestPolicy,
    type PlanId,
    PolicySizing,
    resolvePositionSizing,
    type RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type CopyGroupSimulationMember,
    type CopyGroupSimulationOutputs,
    type CopyGroupSimulationRejection,
    CopyGroupSimulationResultKind,
    type FundedSimStart,
    simulateCopyGroup,
} from '~/lib/prop-calculator/simulator';
import { stableJson } from '~/lib/stableJson';

export enum CopyGroupWorkerOutcomeKind {
    Failed = 'failed',
    Rejected = 'rejected',
    Simulated = 'simulated',
}

export interface CopyGroupWorkerFailure {
    readonly kind: CopyGroupWorkerOutcomeKind.Failed;
    readonly reason: string;
}

export interface CopyGroupWorkerMember {
    readonly discounts?: CouponDiscounts;
    readonly id: string;
    readonly minRetainedCushion: Dollars;
    readonly payoutRequestPolicy?: PayoutRequestPolicy;
    readonly payoutRequestSize: Dollars | undefined;
    readonly planId: PlanId;
    readonly riskPerTrade: Dollars;
    readonly rungSizing: RungSizing;
    readonly seed: FundedCycleSeed;
    readonly state: AccountState;
    readonly stopRule: DayStopRule;
    readonly tradesPerDay: number;
}

export type CopyGroupWorkerOutcome =
    | CopyGroupWorkerFailure
    | CopyGroupWorkerRejected
    | CopyGroupWorkerSimulated;

export interface CopyGroupWorkerPositionSizing {
    readonly instrument: InstrumentSymbol;
    readonly stopPoints: number;
}

export interface CopyGroupWorkerRejected {
    readonly kind: CopyGroupWorkerOutcomeKind.Rejected;
    readonly rejection: CopyGroupSimulationRejection;
}

export interface CopyGroupWorkerRequest {
    readonly commission: Dollars;
    readonly fundedHorizonDays: number;
    readonly idleDayProbability?: number;
    readonly intradayPathStepsPerR?: number;
    readonly members: readonly CopyGroupWorkerMember[];
    readonly positionSizing: CopyGroupWorkerPositionSizing | null;
    readonly rrRatio: number;
    readonly seed: number;
    readonly trials: number;
    readonly winrate: Fraction0to1;
}

export interface CopyGroupWorkerSimulated {
    readonly kind: CopyGroupWorkerOutcomeKind.Simulated;
    readonly result: CopyGroupSimulationOutputs;
}

export function copyGroupRequestCacheKey(
    request: CopyGroupWorkerRequest,
): string {
    return stableJson(request);
}

export function simulateGroupOutcomeOf(
    request: CopyGroupWorkerRequest,
): CopyGroupWorkerOutcome {
    try {
        const positionSizing = positionSizingOf(request.positionSizing);
        const members = request.members.map((member) =>
            copyGroupSimulationMemberOf(member, positionSizing),
        );
        const result = simulateCopyGroup({
            commission: request.commission,
            fundedHorizonDays: request.fundedHorizonDays,
            idleDayProbability: request.idleDayProbability,
            intradayPathStepsPerR: request.intradayPathStepsPerR,
            members,
            rrRatio: request.rrRatio,
            seed: request.seed,
            trials: request.trials,
            winrate: request.winrate,
        });
        return result.kind === CopyGroupSimulationResultKind.Rejected
            ? {
                  kind: CopyGroupWorkerOutcomeKind.Rejected,
                  rejection: result.rejection,
              }
            : {
                  kind: CopyGroupWorkerOutcomeKind.Simulated,
                  result: outputsOf(result),
              };
    } catch (error) {
        return {
            kind: CopyGroupWorkerOutcomeKind.Failed,
            reason: describeSimulationFailure(error),
        };
    }
}

function copyGroupSimulationMemberOf(
    member: CopyGroupWorkerMember,
    positionSizing: ReturnType<typeof resolvePositionSizing>,
): CopyGroupSimulationMember {
    const plan = findFirm(member.planId.firm)?.findPlan(member.planId);
    if (!plan) {
        throw new Error(`Plan not found for firm "${member.planId.firm}".`);
    }
    const start: FundedSimStart = {
        phase: TradingPhase.Funded,
        seed: member.seed,
        state: member.state,
    };
    return {
        dayPolicy: flatDayPolicy(
            member.riskPerTrade,
            member.tradesPerDay,
            member.stopRule,
            PolicySizing.WholeContracts,
        ),
        discounts: member.discounts,
        id: member.id,
        minRetainedCushion: member.minRetainedCushion,
        payoutRequestPolicy: member.payoutRequestPolicy,
        payoutRequestSize: member.payoutRequestSize,
        plan,
        positionSizing,
        rungSizing: member.rungSizing,
        start,
    };
}

function outputsOf(
    result: CopyGroupSimulationOutputs & { kind: CopyGroupSimulationResultKind.Simulated },
): CopyGroupSimulationOutputs {
    const copy = { ...result };
    Reflect.deleteProperty(copy, 'kind');
    return copy;
}

function positionSizingOf(
    requested: CopyGroupWorkerPositionSizing | null,
): ReturnType<typeof resolvePositionSizing> {
    if (requested === null) return null;
    const positionSizing = resolvePositionSizing(
        requested.instrument,
        requested.stopPoints,
    );
    if (positionSizing === null) {
        throw new Error(
            `stopPoints must be a positive number, received ${requested.stopPoints}.`,
        );
    }
    return positionSizing;
}
