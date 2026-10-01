/// <reference lib="webworker" />

import {
    dollars,
    DriftEdge,
    DriftEdgeFitError,
    findFirm,
    fraction,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { applyEnginePolicy } from '~/lib/prop-calculator/advisor';
import {
    fundedValueEstimate,
    type FundedValueEstimateResult,
    valueChain,
    type ValueChainResult,
} from '~/lib/prop-calculator/advisor/value';
import {
    attemptEconomicsOfRun,
    attemptsAffordable,
    BankrollLeverKind,
    type BankrollLeverOutputs,
    type BankrollLeverRow,
    bankrollLevers,
    type BankrollLeverVariant,
    batchLossClosedForm,
    cohortOutcome,
    empiricalPayingStatsOf,
    LOSS_RISK_DRAWS,
    noPayoutProbability,
    takeProfitCandidateInputs,
    takeProfitRows,
    type TakeProfitWhatIfRow,
} from '~/lib/prop-calculator/economics';
import { simulateBankrollTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import { type BankrollTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import {
    type BankrollLeverRowSummary,
    type BankrollPlanReference,
    type BankrollPlanVariantInputs,
    type BatchToolsRequest,
    type BatchToolsSummary,
    type FundedValueEstimateToolsRequest,
    type LeversToolsRequest,
    type NextRoundToolsRequest,
    parseToolsRequest,
    parseToolsResult,
    type ProjectionToolsRequest,
    type SameEvOutcome,
    type SameEvToolsRequest,
    type TakeProfitRowsToolsRequest,
    type TakeProfitRowSummary,
    ToolsRequestKind,
    ToolsResponseKind,
    type ToolsWorkerResult,
    type TwoStrategiesToolsRequest,
    type ValueChainToolsRequest,
} from './toolsWorkerMessages';

interface ResolvedVariant {
    readonly simInputs: SimInputs;
}

export function computeToolsResult(rawRequest: unknown): ToolsWorkerResult {
    const request = parseToolsRequest(rawRequest);
    switch (request.kind) {
        case ToolsRequestKind.Batch: {
            return finishBatch(request);
        }
        case ToolsRequestKind.FundedValueEstimate: {
            return finishFundedValueEstimate(request);
        }
        case ToolsRequestKind.Levers: {
            return finishLevers(request);
        }
        case ToolsRequestKind.NextRound: {
            return finishNextRound(request);
        }
        case ToolsRequestKind.Projection: {
            return finishProjection(request);
        }
        case ToolsRequestKind.SameEv: {
            return finishSameEv(request);
        }
        case ToolsRequestKind.TakeProfitRows: {
            return finishTakeProfitRows(request);
        }
        case ToolsRequestKind.TwoStrategies: {
            return finishTwoStrategies(request);
        }
        case ToolsRequestKind.ValueChain: {
            return finishValueChain(request);
        }
    }
}

function computeBatch(request: BatchToolsRequest): BatchToolsSummary | null {
    const resolved = resolveVariant(request.variant);
    if (resolved === null) return null;
    const { simInputs } = resolved;
    const out = simulate(simInputs);
    const outcome = cohortOutcome(
        out.netValues,
        request.attempts,
        LOSS_RISK_DRAWS,
        simInputs.seed,
    );
    const decomposition = attemptEconomicsOfRun(
        out,
        simInputs.fundedHorizonDays,
    );
    const fundedValueToAttemptCostRatio =
        decomposition.value?.fundedValueToAttemptCost.value?.ratio ?? null;
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        out.netValues,
        out.costPerAttempt,
    );
    const crossCheck = batchLossClosedForm({
        attemptCost: dollars(out.costPerAttempt),
        attempts: request.attempts,
        pAttemptPays,
        valuePerPayingAttempt,
    });
    return {
        crossCheckLossProbability: crossCheck.value,
        fundedValueToAttemptCostRatio,
        lossProbability: outcome.value?.lossProbability.value ?? null,
        lossProbabilityReason: outcome.reason,
        lossProbabilityStandardError:
            outcome.value?.lossProbability.standardError ?? null,
        meanNet: outcome.value?.meanNet ?? null,
    };
}

function computeFundedValueEstimate(
    request: FundedValueEstimateToolsRequest,
): FundedValueEstimateResult | null {
    const plan = resolvePlanReference(request.plan);
    return plan === null
        ? null
        : fundedValueEstimate(plan, request.spec, request.sampleSize);
}

function computeLevers(
    request: LeversToolsRequest,
): null | readonly BankrollLeverRowSummary[] {
    const resolved = resolveVariant(request.variant);
    if (resolved === null) return null;
    const { simInputs } = resolved;
    const baseOut = simulate(simInputs);
    const base = toLeverOutputs(baseOut);
    const variants: BankrollLeverVariant[] = [
        ...(request.risks ?? []).map((risk): BankrollLeverVariant => ({
            kind: BankrollLeverKind.Risk,
            outputs: toLeverOutputs(
                simulate({ ...simInputs, riskPerTrade: risk }),
            ),
            value: risk,
        })),
        ...(request.tradesPerDay ?? []).map(
            (tradesPerDay): BankrollLeverVariant => ({
                kind: BankrollLeverKind.TradesPerDay,
                outputs: toLeverOutputs(
                    simulate({ ...simInputs, tradesPerDay }),
                ),
                value: tradesPerDay,
            }),
        ),
        ...(request.requestSizes ?? []).map(
            (payoutRequestSize): BankrollLeverVariant => ({
                kind: BankrollLeverKind.RequestSize,
                outputs: toLeverOutputs(
                    simulate({ ...simInputs, payoutRequestSize }),
                ),
                value: payoutRequestSize,
            }),
        ),
    ];
    const rows = bankrollLevers(
        base,
        variants,
        dollars(request.bankroll),
        simInputs.seed,
    );
    return rows.map(toLeverRowSummary);
}

function computeProjection(
    variant: BankrollPlanVariantInputs,
    request: {
        bankroll: ProjectionToolsRequest['bankroll'];
        dayBudget: number;
    },
): BankrollTimelineResult | null {
    const resolved = resolveVariant(variant);
    if (resolved === null) return null;
    return simulateBankrollTimeline({
        ...resolved.simInputs,
        bankroll: request.bankroll,
        dayBudget: request.dayBudget,
    });
}

function computeSameEvOutcome(
    variant: BankrollPlanVariantInputs,
    bankroll: number,
    seed: number,
): null | SameEvOutcome {
    const resolved = resolveVariant(variant);
    if (resolved === null) return null;
    const out = simulate(resolved.simInputs);
    const attempts = attemptsAffordable(
        dollars(bankroll),
        dollars(out.costPerAttempt),
    );
    const noPayout =
        attempts.value === null
            ? null
            : (noPayoutProbability(
                  fraction(out.attemptPaysProbability),
                  attempts.value,
              ).value ?? null);
    const lossRisk =
        attempts.value === null
            ? null
            : (cohortOutcome(
                  out.netValues,
                  attempts.value,
                  LOSS_RISK_DRAWS,
                  seed,
              ).value?.lossProbability.value ?? null);
    return {
        evPerAttempt: out.expectedNetPerAttempt,
        evPerAttemptStandardError:
            out.estimates.expectedNetPerAttempt.standardError,
        lossRisk,
        noPayoutProbability: noPayout,
    };
}

function computeTakeProfitRows(
    request: TakeProfitRowsToolsRequest,
): null | readonly TakeProfitRowSummary[] {
    const resolved = resolveVariant(request.variant);
    if (resolved === null) return null;
    const { simInputs } = resolved;
    const edge = DriftEdge.fittedTo(simInputs.winrate, request.anchorRrRatio);
    const candidateInputs = takeProfitCandidateInputs(
        simInputs,
        edge,
        request.rrCandidates,
    );
    const outputs = candidateInputs.map((inputs) => simulate(inputs));
    return takeProfitRows(candidateInputs, outputs).map(toTakeProfitRowSummary);
}

function computeValueChain(
    request: ValueChainToolsRequest,
): null | ValueChainResult {
    const plan = resolvePlanReference(request.plan);
    return plan === null ? null : valueChain(plan, request.spec);
}

const PLAN_NOT_FOUND_REASON =
    'toolsWorker: no plan for the requested firm and serial';

function fail(runId: number, reason: string): ToolsWorkerResult {
    return { kind: ToolsResponseKind.Failed, reason, runId };
}

function finishBatch(request: BatchToolsRequest): ToolsWorkerResult {
    const result = computeBatch(request);
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.Batch,
        result,
        runId: request.runId,
    });
}

function finishFundedValueEstimate(
    request: FundedValueEstimateToolsRequest,
): ToolsWorkerResult {
    const result = computeFundedValueEstimate(request);
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.FundedValueEstimate,
        result,
        runId: request.runId,
    });
}

function finishLevers(request: LeversToolsRequest): ToolsWorkerResult {
    const rows = computeLevers(request);
    if (rows === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.Levers,
        rows,
        runId: request.runId,
    });
}

function finishNextRound(request: NextRoundToolsRequest): ToolsWorkerResult {
    const optionA = computeProjection(request.variant, {
        bankroll: request.optionA,
        dayBudget: request.dayBudget,
    });
    const optionB = computeProjection(request.variant, {
        bankroll: request.optionB,
        dayBudget: request.dayBudget,
    });
    if (optionA === null || optionB === null) {
        return fail(request.runId, PLAN_NOT_FOUND_REASON);
    }
    return parseToolsResult({
        kind: ToolsResponseKind.NextRound,
        optionA,
        optionB,
        runId: request.runId,
    });
}

function finishProjection(request: ProjectionToolsRequest): ToolsWorkerResult {
    const result = computeProjection(request.variant, request);
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.Projection,
        result,
        runId: request.runId,
    });
}

function finishSameEv(request: SameEvToolsRequest): ToolsWorkerResult {
    const [firstVariant, secondVariant] = request.variants;
    const first = computeSameEvOutcome(
        firstVariant,
        request.bankroll,
        firstVariant.base.seed,
    );
    const second = computeSameEvOutcome(
        secondVariant,
        request.bankroll,
        secondVariant.base.seed,
    );
    if (first === null || second === null) {
        return fail(request.runId, PLAN_NOT_FOUND_REASON);
    }
    return parseToolsResult({
        kind: ToolsResponseKind.SameEv,
        results: [first, second],
        runId: request.runId,
    });
}

function finishTakeProfitRows(
    request: TakeProfitRowsToolsRequest,
): ToolsWorkerResult {
    let rows: null | readonly TakeProfitRowSummary[];
    try {
        rows = computeTakeProfitRows(request);
    } catch (error) {
        if (error instanceof DriftEdgeFitError) {
            return fail(request.runId, error.message);
        }
        throw error;
    }
    if (rows === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.TakeProfitRows,
        rows,
        runId: request.runId,
    });
}

function finishTwoStrategies(
    request: TwoStrategiesToolsRequest,
): ToolsWorkerResult {
    const [firstVariant, secondVariant] = request.variants;
    const first = computeProjection(firstVariant, request);
    const second = computeProjection(secondVariant, request);
    if (first === null || second === null) {
        return fail(request.runId, PLAN_NOT_FOUND_REASON);
    }
    return parseToolsResult({
        kind: ToolsResponseKind.TwoStrategies,
        results: [first, second],
        runId: request.runId,
    });
}

function finishValueChain(request: ValueChainToolsRequest): ToolsWorkerResult {
    const result = computeValueChain(request);
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.ValueChain,
        result,
        runId: request.runId,
    });
}

function resolvePlanReference(reference: BankrollPlanReference): null | Plan {
    const firm = findFirm(reference.firmId);
    const rawPlan = firm?.findPlanBySerial(reference.planSerial) ?? null;
    return rawPlan === null ? null : withPlanOptIns(rawPlan, reference.optIns);
}

function resolveVariant(
    variant: BankrollPlanVariantInputs,
): null | ResolvedVariant {
    const plan = resolvePlanReference(variant.plan);
    if (plan === null) return null;
    const simInputs = applyEnginePolicy(plan, variant.policy, {
        ...variant.base,
        plan,
    });
    return { simInputs };
}

function toLeverOutputs(out: SimOutputs): BankrollLeverOutputs {
    return {
        attemptPaysProbability: {
            standardError: out.estimates.attemptPaysProbability.standardError,
            value: fraction(out.attemptPaysProbability),
        },
        costPerAttempt: dollars(out.costPerAttempt),
        expectedMonthlyNet: {
            standardError: out.estimates.expectedMonthlyNet.standardError,
            value: dollars(out.expectedMonthlyNet),
        },
        expectedNetPerAttempt: {
            standardError: out.estimates.expectedNetPerAttempt.standardError,
            value: dollars(out.expectedNetPerAttempt),
        },
        netValues: out.netValues,
        passProbability: {
            standardError: out.estimates.attemptPassProbability.standardError,
            value: fraction(out.attemptPassProbability),
        },
    };
}

function toLeverRowSummary(row: BankrollLeverRow): BankrollLeverRowSummary {
    return {
        deltaAttemptPaysProbability: row.deltaAttemptPaysProbability,
        deltaEvPerAttempt: row.deltaEvPerAttempt,
        deltaMonthlyNet: row.deltaMonthlyNet,
        deltaPassProbability: row.deltaPassProbability,
        evPerAttempt: row.evPerAttempt.value,
        kind: row.kind,
        label: row.label,
        lossRisk: row.lossRisk.value?.value ?? null,
        monthlyNet: row.monthlyNet.value,
        passProbability: row.passProbability.value,
        value: row.value,
    };
}

function toTakeProfitRowSummary(
    row: TakeProfitWhatIfRow,
): TakeProfitRowSummary {
    return {
        attemptPassProbability: row.out.attemptPassProbability,
        daysToPassP50: row.out.daysToPassP50,
        expectedMonthlyNet: row.out.expectedMonthlyNet,
        expectedNet: row.out.expectedNet,
        label: row.label,
        rrRatio: row.rrRatio,
        winrate: row.winrate,
    };
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
    self.addEventListener('message', (event: MessageEvent<unknown>) => {
        try {
            self.postMessage(computeToolsResult(event.data));
        } catch (error) {
            const runId =
                typeof event.data === 'object' &&
                event.data !== null &&
                'runId' in event.data &&
                typeof event.data.runId === 'number'
                    ? event.data.runId
                    : -1;
            self.postMessage(
                fail(
                    runId,
                    error instanceof Error ? error.message : String(error),
                ),
            );
        }
    });
}
