/// <reference lib="webworker" />

import { toCouponDiscounts } from '~/app/(app)/prop-calculator/_components/couponDiscounts';
import { formatCurrency } from '~/lib/format';
import {
    CorrelationMode,
    dollars,
    DriftEdge,
    DriftEdgeFitError,
    findFirm,
    fraction,
    LifetimeCapScope,
    type Plan,
    type PortfolioSimInputs,
    type SimInputs,
    type SimOutputs,
    simulate,
    simulatePortfolio,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { applyEnginePolicy } from '~/lib/prop-calculator/advisor';
import {
    type CopySplitResult,
    runCopySplit,
} from '~/lib/prop-calculator/advisor/policy';
import {
    fundedValueEstimate,
    type FundedValueEstimateResult,
    valueChain,
    type ValueChainResult,
} from '~/lib/prop-calculator/advisor/value';
import {
    attemptEconomicsOfRun,
    bankrollCohortRisk,
    BankrollLeverKind,
    type BankrollLeverOutputs,
    type BankrollLeverRow,
    bankrollLevers,
    type BankrollLeverVariant,
    bankrollRisk,
    batchLossClosedForm,
    empiricalPayingStatsOf,
    LOSS_RISK_DRAWS,
    projectionMonthEnds,
    type Quantity,
    spendPayoutCurve,
    type SpendPayoutPoint,
    takeProfitCandidateInputs,
    takeProfitRows,
    type TakeProfitWhatIfRow,
    walkPassProbability,
} from '~/lib/prop-calculator/economics';
import { simulateBankrollTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import { type BankrollTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

import {
    type BankrollLeverRowSummary,
    type BankrollPlanReference,
    type BankrollPlanVariantInputs,
    type BatchToolsRequest,
    type BatchToolsSummary,
    type CopySplitToolsRequest,
    type FundedValueEstimateToolsRequest,
    type LabRunInputs,
    type LabScenarioInputs,
    type LabScenarioResult,
    type LabTheoreticalPass,
    type LabToolsRequest,
    type LeversToolsRequest,
    type NextRoundToolsRequest,
    parseToolsRequest,
    parseToolsResult,
    type ProjectionToolsRequest,
    runIdOf,
    type SameEvOutcome,
    type SameEvToolsRequest,
    type SpendPayoutCurveRow,
    type SpendPayoutCurveToolsRequest,
    type TakeProfitRowsToolsRequest,
    type TakeProfitRowSummary,
    ToolsRequestKind,
    ToolsResponseKind,
    type ToolsWorkerResult,
    type TwoStrategiesToolsRequest,
    type ValueChainToolsRequest,
} from './toolsWorkerMessages';

type PortfolioSimulator = typeof simulatePortfolio;

interface ResolvedVariant {
    readonly simInputs: SimInputs;
}

const LAB_TRIALS_COPY_AND_GROUPED = 400;
const LAB_TRIALS_INDEPENDENT = 250;
const MAX_REMEMBERED_LAB_BASELINES = 64;
const labBaselines = new Map<string, number>();

export function computeToolsResult(rawRequest: unknown): ToolsWorkerResult {
    const request = parseToolsRequest(rawRequest);
    switch (request.kind) {
        case ToolsRequestKind.Batch: {
            return finishBatch(request);
        }
        case ToolsRequestKind.CopySplit: {
            return finishCopySplit(request);
        }
        case ToolsRequestKind.FundedValueEstimate: {
            return finishFundedValueEstimate(request);
        }
        case ToolsRequestKind.Lab: {
            return finishLab(request);
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
        case ToolsRequestKind.SpendPayoutCurve: {
            return finishSpendPayoutCurve(request);
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

export function handleToolsMessage(data: unknown): ToolsWorkerResult {
    try {
        return computeToolsResult(data);
    } catch (error) {
        return fail(
            runIdOf(data) ?? -1,
            error instanceof Error ? error.message : String(error),
        );
    }
}

export function lifetimeCapPoolingGapNote(
    plan: Plan,
    accounts: number,
): null | string {
    const cap = plan.maxLifetimePayoutDollars;
    return cap === null ||
        accounts <= 1 ||
        plan.lifetimeConclusion.dollarCapScope !==
            LifetimeCapScope.PerUserAcrossVariant
        ? null
        : `${plan.label}'s ${formatCurrency(cap)} lifetime cap is per user; this projection pools it across your accounts, so combined payouts here never exceed ${formatCurrency(cap)}.`;
}

export function simulateLabScenario(
    run: LabRunInputs,
    plan: Plan,
    scenario: LabScenarioInputs,
    baselines: Map<string, number>,
    simulate: PortfolioSimulator = simulatePortfolio,
): LabScenarioResult {
    const hazard =
        run.liveTransferHazard !== undefined && run.liveTransferHazard > 0
            ? fraction(run.liveTransferHazard)
            : undefined;
    const portfolioInputs = labPortfolioInputs(run, plan, scenario);
    const baselineKey = JSON.stringify({
        run: { ...run, liveTransferHazard: undefined },
        scenario,
    });
    const result = simulate(
        hazard === undefined
            ? portfolioInputs
            : { ...portfolioInputs, liveTransferHazard: hazard },
    );
    if (hazard === undefined) {
        rememberLabBaseline(baselines, baselineKey, result.expectedMonthlyNet);
    }
    const noTransferMonthlyNet =
        hazard === undefined
            ? null
            : (baselines.get(baselineKey) ??
              rememberLabBaseline(
                  baselines,
                  baselineKey,
                  simulate(portfolioInputs).expectedMonthlyNet,
              ));
    return {
        ...result,
        ...labTheoreticalPass(plan, scenario),
        lifetimeCapPoolingGap: lifetimeCapPoolingGapNote(
            plan,
            scenario.accounts,
        ),
        noTransferMonthlyNet,
    };
}

function computeBatch(request: BatchToolsRequest): BatchToolsSummary | null {
    const resolved = resolveVariant(request.variant);
    if (resolved === null) return null;
    const { simInputs } = resolved;
    const out = simulate(simInputs);
    const outcome = bankrollCohortRisk(
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

function computeCopySplit(
    request: CopySplitToolsRequest,
): CopySplitResult | null {
    const plan = resolvePlanReference(request.variant.plan);
    return plan === null
        ? null
        : runCopySplit(
              { ...request.variant.base, plan },
              request.variant.policy,
              request.totalRisk,
              request.splits,
              request.objective,
              request.funded,
          );
}

function computeFundedValueEstimate(
    request: FundedValueEstimateToolsRequest,
): FundedValueEstimateResult | null {
    const plan = resolvePlanReference(request.plan);
    return plan === null
        ? null
        : fundedValueEstimate(plan, request.spec, request.sampleSize);
}

function computeLab(request: LabToolsRequest): LabScenarioResult | null {
    const plan = resolvePlanReference(request.run.plan);
    return plan === null
        ? null
        : simulateLabScenario(
              request.run,
              plan,
              request.scenario,
              labBaselines,
          );
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
    const risk = bankrollRisk(out, dollars(bankroll), seed);
    return {
        evPerAttempt: out.expectedNetPerAttempt,
        evPerAttemptStandardError:
            out.estimates.expectedNetPerAttempt.standardError,
        lossRisk: risk.lossProbability?.value ?? null,
        noPayoutProbability: risk.noPayoutProbability,
    };
}

function computeSpendPayoutCurve(
    request: SpendPayoutCurveToolsRequest,
): null | readonly SpendPayoutCurveRow[] {
    const resolved = resolveVariant(request.variant);
    if (resolved === null) return null;
    const { simInputs } = resolved;
    const out = simulate(simInputs);
    const budgets = request.budgets.map((budget) => dollars(budget));
    const points = spendPayoutCurve(
        out.netValues,
        out.netValues.map(() => out.costPerAttempt),
        dollars(out.costPerAttempt),
        budgets,
        simInputs.seed,
    );
    return points.map((point, index) =>
        toSpendPayoutCurveRow(budgets[index] ?? dollars(0), point),
    );
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

function finishCopySplit(request: CopySplitToolsRequest): ToolsWorkerResult {
    let result: CopySplitResult | null;
    try {
        result = computeCopySplit(request);
    } catch (error) {
        if (error instanceof RangeError) {
            return fail(request.runId, error.message);
        }
        throw error;
    }
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.CopySplit,
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

function finishLab(request: LabToolsRequest): ToolsWorkerResult {
    const result = computeLab(request);
    if (result === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.Lab,
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
        monthEnds: projectionMonthEnds(result),
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

function finishSpendPayoutCurve(
    request: SpendPayoutCurveToolsRequest,
): ToolsWorkerResult {
    const rows = computeSpendPayoutCurve(request);
    if (rows === null) return fail(request.runId, PLAN_NOT_FOUND_REASON);
    return parseToolsResult({
        kind: ToolsResponseKind.SpendPayoutCurve,
        rows,
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

function labPortfolioInputs(
    run: LabRunInputs,
    plan: Plan,
    scenario: LabScenarioInputs,
): PortfolioSimInputs {
    return {
        accounts: scenario.accounts,
        commissionPerRoundTrip: run.commissionPerRoundTrip,
        correlation: scenario.correlation,
        dayStop: scenario.dayStop,
        discounts: toCouponDiscounts({
            activationDiscountPercent: run.activationDiscountPercent,
            evalDiscountPercent: run.discountPercent,
            linkActivationDiscount: run.linkActivationDiscount,
            monthlySubscriptionDiscountPercent:
                run.monthlySubscriptionDiscountPercent,
            resetDiscountPercent: run.resetDiscountPercent,
        }),
        fundedHorizonDays: run.fundedHorizonDays,
        groups: scenario.groups,
        instrument: scenario.instrument ?? undefined,
        maxAttempts: 1,
        maxEvalDays: run.maxEvalDays,
        minRetainedCushion: run.minRetainedCushion,
        payoutRequestSize: run.payoutRequestSize,
        plan,
        riskPerTrade: scenario.riskPerTrade,
        rrRatio: scenario.rrRatio,
        rungSizing: run.rungSizing,
        seed: run.seed,
        stopPoints: scenario.stopPoints ?? undefined,
        tradesPerDay: scenario.tradesPerDay,
        trials:
            scenario.correlation === CorrelationMode.Independent
                ? LAB_TRIALS_INDEPENDENT
                : LAB_TRIALS_COPY_AND_GROUPED,
        winrate: scenario.winrate,
    };
}

function labTheoreticalPass(
    plan: Plan,
    scenario: LabScenarioInputs,
): LabTheoreticalPass {
    const pass = walkPassProbability({
        drawdown: dollars(plan.drawdown.amount),
        riskPerTrade: dollars(scenario.riskPerTrade),
        rrRatio: scenario.rrRatio,
        target: dollars(plan.profitTarget),
        winrate: fraction(scenario.winrate),
    });
    return pass.value === null
        ? { theoreticalPassProb: undefined, theoreticalPassReason: pass.reason }
        : { theoreticalPassProb: pass.value, theoreticalPassReason: undefined };
}

function rememberLabBaseline(
    baselines: Map<string, number>,
    key: string,
    monthlyNet: number,
): number {
    baselines.delete(key);
    baselines.set(key, monthlyNet);
    while (baselines.size > MAX_REMEMBERED_LAB_BASELINES) {
        const oldest = baselines.keys().next();
        if (oldest.done === true) break;
        baselines.delete(oldest.value);
    }
    return monthlyNet;
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
        deltaLossProbability: row.deltaLossProbability,
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

function toSpendPayoutCurveRow(
    budget: number,
    point: Quantity<SpendPayoutPoint>,
): SpendPayoutCurveRow {
    const figures = point.value;
    return {
        budget,
        figures:
            figures === null
                ? null
                : {
                      attempts: figures.attempts,
                      expectedNet: figures.expectedNet,
                      expectedPayouts: figures.expectedPayouts,
                      expectedSpend: figures.expectedSpend,
                      lossProbability: figures.lossProbability.value,
                      lossProbabilityStandardError:
                          figures.lossProbability.standardError,
                      netP10: figures.netP10,
                      netP90: figures.netP90,
                  },
        reason: point.reason,
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
        self.postMessage(handleToolsMessage(event.data));
    });
}
