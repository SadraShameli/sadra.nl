import type { CalculatorState } from '~/app/(app)/prop-calculator/_components/types';

import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import {
    CENTS_PER_DOLLAR,
    DayStopRuleKind,
    findFirm,
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
} from '~/lib/prop-calculator/advisor';
import { type Plan } from '~/lib/prop-calculator/core';
import {
    buildFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    FundedCandidateBuildKind,
    fundedPlacementNotes,
    fundedRowCells,
    type FundedSortKey,
    type FundedSweepRow,
    sortFundedResults,
} from '~/lib/prop-calculator/optimize';
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';

import {
    clampFundedSweepTrials,
    type FundedSweepBaseInputs,
    type FundedSweepRequest,
    type FundedSweepResult,
} from '../../_workers/fundedSweepWorkerMessages';
import { riskPercentToDollars } from '../riskConversion';

export const PERCENT_CANDIDATES_NEED_STOP_NOTE =
    'percent-of-cushion candidates are left out: pick an instrument and a stop to place them in whole contracts';

export enum FundedPolicyBasis {
    CalculatorOverride = 'calculator-override',
    RulebookDefault = 'rulebook-default',
}

export type FundedOptimizerCalculatorInputs = Pick<
    CalculatorState,
    | 'commissionPerRoundTrip'
    | 'copyAccounts'
    | 'dayStop'
    | 'fundedHorizonDays'
    | 'idleDayProbability'
    | 'instrument'
    | 'maxAttempts'
    | 'maxEvalDays'
    | 'payoutRequestSize'
    | 'plan'
    | 'retainedCushion'
    | 'riskDollars'
    | 'riskPercent'
    | 'rrRatio'
    | 'seed'
    | 'sizingMode'
    | 'stopPoints'
    | 'takesFundedReset'
    | 'takesOneTimeEarlyWithdrawal'
    | 'tradesPerDay'
    | 'trials'
    | 'winrate'
>;

export interface FundedOptimizerPolicyBasis {
    readonly cushion: FundedPolicyBasis;
    readonly payoutRequest: FundedPolicyBasis;
}

export interface FundedOptimizerRow {
    readonly cells: readonly string[];
    readonly monthlyNetStandardError: null | number;
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

export function fundedOptimizerRequest(
    inputs: FundedOptimizerCalculatorInputs,
    rulebook: RulebookParameters,
): FundedSweepRequest {
    const plan = withPlanOptIns(inputs.plan, {
        takesFundedReset: inputs.takesFundedReset,
        takesOneTimeEarlyWithdrawal: inputs.takesOneTimeEarlyWithdrawal,
    });
    const { policy: builtPolicy } = buildEnginePolicy({
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
    const riskPerTrade =
        inputs.sizingMode === SizingMode.Dollar
            ? inputs.riskDollars
            : riskPercentToDollars(inputs.riskPercent, plan.accountSize);
    const base: FundedSweepBaseInputs = {
        commissionPerRoundTrip: inputs.commissionPerRoundTrip,
        copyAccounts: inputs.copyAccounts,
        dayStop: inputs.dayStop,
        fundedHorizonDays: inputs.fundedHorizonDays,
        idleDayProbability: inputs.idleDayProbability,
        instrument: inputs.instrument ?? undefined,
        maxAttempts: inputs.maxAttempts,
        maxEvalDays: inputs.maxEvalDays,
        payoutRequestSize: effectivePayoutRequestSize,
        riskPerTrade,
        rrRatio: inputs.rrRatio,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints ?? undefined,
        tradesPerDay: inputs.tradesPerDay,
        trials: clampFundedSweepTrials(inputs.trials),
        winrate: inputs.winrate,
    };
    return {
        base,
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
        monthlyNetStandardError:
            row.out.estimates.expectedMonthlyNet.standardError,
    }));
}

export function fundedOptimizerSweep(
    plan: Plan,
    request: FundedSweepRequest,
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
        return { kind: FundedCandidateBuildKind.Refused, refusal: build.refusal };
    }
    const base: SimInputs = applyEnginePolicy(resolvedPlan, request.policy, {
        ...request.base,
        plan: resolvedPlan,
    });
    const rows: FundedSweepRow[] = build.candidates.map((candidate) => ({
        candidate,
        out: simulate({ ...base, ...candidate.overrides }),
    }));
    const notes =
        positionSizing === null
            ? [PERCENT_CANDIDATES_NEED_STOP_NOTE]
            : fundedPlacementNotes(build, positionSizing, resolvedPlan);
    return { kind: FundedCandidateBuildKind.Built, notes, rows };
}

export function fundedSweepPlan(request: FundedSweepRequest): null | Plan {
    return findFirm(request.firmId)?.findPlanBySerial(request.planSerial) ?? null;
}
