import type { CalculatorState } from '~/app/(app)/prop-calculator/_components/types';

import {
    buildSimInputs,
    type SimInputsSource,
} from '~/app/(app)/prop-calculator/_components/calculatorSimInputs';
import { riskTableObjective } from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import {
    clampFundedSweepTrials,
    type FundedSweepBaseInputs,
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
    MAX_FUNDED_SWEEP_TRIALS,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import {
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    findFirm,
    fraction,
    points,
    resolvePositionSizing,
    serializePlanId,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    buildEnginePolicy,
    type EnginePolicy,
    enginePolicySchema,
    type RulebookParameters,
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import { type Plan } from '~/lib/prop-calculator/core';
import {
    buildFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    FundedCandidateBuildKind,
    fundedPlacementNotes,
    fundedRowCells,
    fundedRowStandardErrors,
    FundedSortKey,
    fundedSortOfObjective,
    type FundedSweepRow,
    sortFundedResults,
} from '~/lib/prop-calculator/optimize';
import {
    liveTransferContinuationNotes,
    liveTransferDisclosureLines,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator/simulator';
import { dayPolicySchema } from '~/lib/schemas/url';

export const PERCENT_CANDIDATES_NEED_STOP_NOTE =
    'percent-of-cushion candidates are left out: pick an instrument and a stop to place them in whole contracts';

export enum FundedPolicyBasis {
    CalculatorOverride = 'calculator-override',
    RulebookDefault = 'rulebook-default',
}

export type FundedOptimizerCalculatorInputs = Pick<
    CalculatorState,
    'liveTransferHazard'
> &
    SimInputsSource;

export interface FundedOptimizerPolicyBasis {
    readonly cushion: FundedPolicyBasis;
    readonly payoutRequest: FundedPolicyBasis;
}

export interface FundedOptimizerRanking {
    readonly heading: string;
    readonly sort: FundedSortKey;
}

export interface FundedOptimizerRow {
    readonly cells: readonly string[];
    readonly standardErrors: readonly (null | string)[];
}

export function fundedOptimizerLiveTransferLines(
    plan: Plan,
    hazard: number,
    rows: readonly FundedSweepRow[],
): readonly string[] {
    const [first] = rows;
    if (first === undefined || hazard <= 0) return [];
    const continuation = first.out.liveTransferContinuation;
    return liveTransferDisclosureLines({
        continuation,
        hazard,
        notes: liveTransferContinuationNotes(plan, continuation),
        sentLiveShare: null,
    });
}

export function fundedOptimizerPolicyBasis(
    inputs: FundedOptimizerCalculatorInputs,
): FundedOptimizerPolicyBasis {
    return {
        cushion:
            inputs.retainedCushion === null
                ? FundedPolicyBasis.RulebookDefault
                : FundedPolicyBasis.CalculatorOverride,
        payoutRequest:
            inputs.payoutRequestSize === null
                ? FundedPolicyBasis.RulebookDefault
                : FundedPolicyBasis.CalculatorOverride,
    };
}

export function fundedOptimizerRanking(
    requested: SizingObjective,
): FundedOptimizerRanking {
    const { effective } = riskTableObjective(
        requested,
        RankingSurface.FundedRiskSweep,
    );
    return {
        heading: `Funded optimizer, ranked by ${SIZING_OBJECTIVE_LABEL[effective]}`,
        sort: fundedSortOf(effective),
    };
}

export function fundedOptimizerRequest(
    inputs: FundedOptimizerCalculatorInputs,
    rulebook: RulebookParameters,
): FundedSweepRequest {
    const { evalDayPolicy, plan, ...simBase } = buildSimInputs(inputs);
    const { policy: builtPolicy } = buildEnginePolicy({
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: inputs.fundedHorizonDays,
        measuredRebuyLag: null,
        plan,
        positionSizing:
            inputs.instrument === null || inputs.stopPoints === null
                ? null
                : {
                      instrument: inputs.instrument,
                      stopPoints: points(inputs.stopPoints),
                  },
        rulebook,
    });
    const effectivePayoutRequestSize =
        inputs.payoutRequestSize ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const policy: EnginePolicy = enginePolicySchema.parse({
        ...builtPolicy,
        payoutRequestOverride: effectivePayoutRequestSize,
        retainedCushionRequest:
            inputs.retainedCushion ?? builtPolicy.retainedCushionRequest,
    });
    const base: FundedSweepBaseInputs = {
        ...simBase,
        liveTransferHazard:
            inputs.liveTransferHazard > 0
                ? fraction(inputs.liveTransferHazard)
                : undefined,
        payoutRequestSize: effectivePayoutRequestSize,
        trials: clampFundedSweepTrials(inputs.trials),
    };
    return {
        base,
        evalLadder:
            evalDayPolicy === undefined
                ? null
                : dayPolicySchema.parse(evalDayPolicy),
        firmId: plan.id.firm,
        optIns: {
            takesFundedReset: inputs.takesFundedReset,
            takesOneTimeEarlyWithdrawal: inputs.takesOneTimeEarlyWithdrawal,
        },
        planSerial: serializePlanId(plan.id),
        policy,
    };
}

export function fundedOptimizerRows(
    results: readonly FundedSweepRow[],
    sort: FundedSortKey,
    trials: number,
): FundedOptimizerRow[] {
    return sortFundedResults(results, sort).map((row) => ({
        cells: fundedRowCells(row.candidate.label, row.out, trials),
        standardErrors: fundedRowStandardErrors(row.out, trials),
    }));
}

export function fundedOptimizerSweep(
    plan: Plan,
    request: FundedSweepRequest,
    onProgress?: (progress: FundedSweepProgress) => void,
): FundedSweepResult {
    const resolvedPlan = withPlanOptIns(plan, request.optIns);
    const positionSizing = resolvePositionSizing(
        request.base.instrument,
        request.base.stopPoints,
    );
    const build = buildFundedCandidates({
        flat: DEFAULT_FUNDED_FLAT_CANDIDATES,
        fundedLadder: null,
        percent: undefined,
        plan: resolvedPlan,
        positionSizing,
        stopRule: request.base.dayStop ?? { kind: DayStopRuleKind.None },
    });
    if (build.kind === FundedCandidateBuildKind.Refused) {
        return {
            kind: FundedCandidateBuildKind.Refused,
            refusal: build.refusal,
        };
    }
    const base = fundedSweepSimInputs(plan, request);
    const total = build.candidates.length;
    const rows: FundedSweepRow[] = [];
    for (const candidate of build.candidates) {
        rows.push({
            candidate,
            out: simulate({ ...base, ...candidate.overrides }),
        });
        onProgress?.({ completed: rows.length, total });
    }
    const notes =
        positionSizing === null
            ? [PERCENT_CANDIDATES_NEED_STOP_NOTE]
            : fundedPlacementNotes(build, positionSizing, resolvedPlan);
    return { kind: FundedCandidateBuildKind.Built, notes, rows };
}

export function fundedOptimizerTrialsNote(requested: number): null | string {
    return requested > MAX_FUNDED_SWEEP_TRIALS
        ? `trials reduced from ${requested.toLocaleString('en-US')} to ${MAX_FUNDED_SWEEP_TRIALS.toLocaleString('en-US')}: the sweep runs at most ${MAX_FUNDED_SWEEP_TRIALS.toLocaleString('en-US')} trials per policy, so its standard errors are those of ${MAX_FUNDED_SWEEP_TRIALS.toLocaleString('en-US')} trials`
        : null;
}

export function fundedSweepPlan(request: FundedSweepRequest): null | Plan {
    return (
        findFirm(request.firmId)?.findPlanBySerial(request.planSerial) ?? null
    );
}

export function fundedSweepSimInputs(
    plan: Plan,
    request: FundedSweepRequest,
): SimInputs {
    const resolvedPlan = withPlanOptIns(plan, request.optIns);
    return applyEnginePolicy(resolvedPlan, request.policy, {
        ...request.base,
        evalDayPolicy:
            request.evalLadder === null
                ? undefined
                : dayPolicySchema.parse(request.evalLadder),
        plan: resolvedPlan,
    });
}

function fundedSortOf(objective: SizingObjective): FundedSortKey {
    switch (objective) {
        case SizingObjective.CycleCash:
        case SizingObjective.MonthlyNet: {
            return fundedSortOfObjective(objective);
        }
        case SizingObjective.RuinFirst: {
            return FundedSortKey.Monthly;
        }
    }
}
