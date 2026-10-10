import { describeSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { formatCurrency } from '~/lib/format';
import {
    DEFAULT_RUNG_SIZING,
    dollars,
    type Dollars,
    findFirm,
    type FirmId,
    fraction,
    type Fraction0to1,
    type Plan,
    type PlanOptIns,
    resolvePositionSizing,
    TradingPhase,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    type DocumentedPolicySpec,
    toSimInputs,
    verifiedCumulativeTriggerOf,
} from '~/lib/prop-calculator/advisor';
import {
    type CopyGroupSimulationMember,
    type CopyGroupSimulationOutputs,
    type CopyGroupSimulationRejection,
    CopyGroupSimulationRejectionKind,
    CopyGroupSimulationResultKind,
    resolveDayPolicy,
    SIM_DEFAULTS,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    type SimStart,
    simulateCopyGroup,
} from '~/lib/prop-calculator/simulator';
import { stableJson } from '~/lib/stableJson';

export enum CopyGroupWorkerOutcomeKind {
    Failed = 'failed',
    Rejected = 'rejected',
    Simulated = 'simulated',
}

enum MemberBuildKind {
    Built = 'built',
    Refused = 'refused',
}

export interface CopyGroupWorkerMember {
    readonly firmId: FirmId;
    readonly id: string;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly spec: DocumentedPolicySpec;
    readonly start: SimStart;
}

export type CopyGroupWorkerOutcome =
    CopyGroupWorkerFailure | CopyGroupWorkerRejected | CopyGroupWorkerSimulated;

export interface CopyGroupWorkerRequest {
    readonly members: readonly CopyGroupWorkerMember[];
    readonly seed: number;
    readonly trials: number;
}

interface CopyGroupWorkerFailure {
    readonly kind: CopyGroupWorkerOutcomeKind.Failed;
    readonly reason: string;
}

interface CopyGroupWorkerRejected {
    readonly kind: CopyGroupWorkerOutcomeKind.Rejected;
    readonly rejection: CopyGroupSimulationRejection;
}

interface CopyGroupWorkerSimulated {
    readonly kind: CopyGroupWorkerOutcomeKind.Simulated;
    readonly result: CopyGroupSimulationOutputs;
}

interface MemberBuild {
    readonly inputs: SimInputs;
    readonly kind: MemberBuildKind.Built;
    readonly member: CopyGroupSimulationMember;
}

type MemberBuildResult =
    | MemberBuild
    | {
          readonly kind: MemberBuildKind.Refused;
          readonly rejection: CopyGroupSimulationRejection;
      };

interface SharedBasis {
    readonly commission: Dollars;
    readonly fundedHorizonDays: number;
    readonly intradayPathStepsPerR: number | undefined;
    readonly rrRatio: number;
    readonly winrate: Fraction0to1;
}

export const COPY_GROUP_TRIGGER_NOT_PRICED_TEXT =
    "This group simulation does not price the firm's confirmed cumulative payout trigger: every account keeps collecting payouts past it, so the payout figures are optimistic once the trigger would have sent an account live.";

const SHARED_BASIS_LABEL: Readonly<Record<keyof SharedBasis, string>> = {
    commission: 'commission per round trip',
    fundedHorizonDays: 'funded horizon',
    intradayPathStepsPerR: 'intraday path resolution',
    rrRatio: 'reward to risk ratio',
    winrate: 'win rate',
};

export function copyGroupRequestCacheKey(
    request: CopyGroupWorkerRequest,
): string {
    return stableJson(request);
}

export function copyGroupUnpricedTriggerNoteOf(
    request: CopyGroupWorkerRequest,
): null | string {
    const triggers = new Set<string>();
    for (const member of request.members) {
        const plan = findMemberPlan(member);
        if (plan === null) continue;
        const trigger = verifiedCumulativeTriggerOf(
            findFirm(member.firmId)?.accountPolicy,
            plan,
        );
        if (trigger === null) continue;
        triggers.add(
            `${formatCurrency(trigger.amount, 0)} (source: ${trigger.source.url}, fetched ${trigger.source.fetchedOn})`,
        );
    }
    return triggers.size === 0
        ? null
        : `${COPY_GROUP_TRIGGER_NOT_PRICED_TEXT} Confirmed trigger: ${triggers.values().toArray().join('; ')}.`;
}

export function simulateGroupOutcomeOf(
    request: CopyGroupWorkerRequest,
): CopyGroupWorkerOutcome {
    try {
        const builds: MemberBuild[] = [];
        for (const member of request.members) {
            const build = memberBuildOf(member);
            if (build.kind === MemberBuildKind.Refused) {
                return {
                    kind: CopyGroupWorkerOutcomeKind.Rejected,
                    rejection: build.rejection,
                };
            }
            builds.push(build);
        }
        const basis = sharedBasisOf(builds.map((build) => build.inputs));
        const result = simulateCopyGroup({
            commission: basis.commission,
            fundedHorizonDays: basis.fundedHorizonDays,
            intradayPathStepsPerR: basis.intradayPathStepsPerR,
            members: builds.map((build) => build.member),
            rrRatio: basis.rrRatio,
            seed: request.seed,
            trials: request.trials,
            winrate: basis.winrate,
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

function basisOf(inputs: SimInputs): SharedBasis {
    return {
        commission: dollars(
            inputs.commissionPerRoundTrip ??
                SIM_DEFAULTS.commissionPerRoundTrip,
        ),
        fundedHorizonDays: inputs.fundedHorizonDays,
        intradayPathStepsPerR: inputs.intradayPathStepsPerR,
        rrRatio: inputs.fundedRrRatio ?? inputs.rrRatio,
        winrate: fraction(inputs.winrate),
    };
}

function distinctDefined<Value>(values: readonly (undefined | Value)[]) {
    return [
        ...new Set(
            values.filter((value): value is Value => value !== undefined),
        ),
    ];
}

function findMemberPlan(member: CopyGroupWorkerMember): null | Plan {
    const resolved = findFirm(member.firmId)?.findPlanBySerial(
        member.planSerial,
    );
    return resolved === undefined || resolved === null
        ? null
        : withPlanOptIns(resolved, member.optIns);
}

function memberBuildOf(member: CopyGroupWorkerMember): MemberBuildResult {
    const plan = resolvedPlanOf(member);
    try {
        const inputs = toSimInputs(plan, member.spec);
        const dayPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
        const { payoutRequestPolicy, payoutRequestSize } = inputs;
        return {
            inputs,
            kind: MemberBuildKind.Built,
            member: {
                dayPolicy,
                discounts: inputs.discounts,
                id: member.id,
                minRetainedCushion: dollars(inputs.minRetainedCushion ?? 0),
                payoutRequestPolicy,
                payoutRequestSize:
                    payoutRequestSize === undefined
                        ? undefined
                        : dollars(payoutRequestSize),
                plan: inputs.plan,
                positionSizing: resolvePositionSizing(
                    inputs.instrument,
                    inputs.stopPoints,
                ),
                rungSizing: inputs.rungSizing ?? DEFAULT_RUNG_SIZING,
                start: member.start,
            },
        };
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith(SIM_INPUTS_REFUSAL_PREFIX)
        ) {
            return {
                kind: MemberBuildKind.Refused,
                rejection: {
                    kind: CopyGroupSimulationRejectionKind.MemberRefused,
                    memberId: member.id,
                    message: describeSimulationFailure(error),
                },
            };
        }
        throw error;
    }
}

function outputsOf(
    result: CopyGroupSimulationOutputs & {
        kind: CopyGroupSimulationResultKind.Simulated;
    },
): CopyGroupSimulationOutputs {
    const copy = { ...result };
    Reflect.deleteProperty(copy, 'kind');
    return copy;
}

function resolvedPlanOf(member: CopyGroupWorkerMember): Plan {
    const resolved = findMemberPlan(member);
    if (resolved === null) {
        throw new Error(
            `Plan "${member.planSerial}" not found for firm "${member.firmId}".`,
        );
    }
    return resolved;
}

function sharedBasisOf(inputs: readonly SimInputs[]): SharedBasis {
    const bases = inputs.map(basisOf);
    const [first] = bases;
    if (first === undefined) {
        throw new RangeError('a copy group needs at least one member');
    }
    for (const field of Object.keys(
        SHARED_BASIS_LABEL,
    ) as (keyof SharedBasis)[]) {
        const distinct = distinctDefined<unknown>(
            bases.map((basis) => basis[field]),
        );
        if (distinct.length > 1) {
            throw new Error(
                `Copy-group members must share one ${SHARED_BASIS_LABEL[field]} to trade one outcome stream, but they differ: ${distinct.map(String).join(', ')}.`,
            );
        }
    }
    return {
        ...first,
        intradayPathStepsPerR: distinctDefined(
            bases.map((basis) => basis.intradayPathStepsPerR),
        )[0],
    };
}
