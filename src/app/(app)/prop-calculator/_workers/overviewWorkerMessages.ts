import { z } from 'zod';

import { describeSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { planOptInsSchema } from '~/lib/prop-accounts/core';
import {
    CENTS_PER_DOLLAR,
    effectivePayoutRequest,
    findFirm,
    FirmId,
    type Plan,
    type PlanOptIns,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
    DOCUMENTED_POLICY_TIMELINE_GAPS,
    type DocumentedPolicyRun,
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    DocumentedPolicyTimelineGap,
    documentedPolicyTimelineInputs,
    type EnginePolicy,
    enginePolicyKey,
    enginePolicySchema,
    type MeasuredRebuyLag,
    PayoutSizeSweepResultKind,
    type RulebookParameters,
    runPayoutSizeSweep,
    StartBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    DEFAULT_DAY_BUDGET,
    type PortfolioTimelineInputs,
    type PortfolioTimelineResult,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import {
    type SimInputs,
    simInputsSizingIssue,
    simulate,
} from '~/lib/prop-calculator/simulator';
import {
    type Estimate,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';
import { stableJson } from '~/lib/stableJson';

export enum OverviewOutcomeKind {
    Failed = 'failed',
    Succeeded = 'succeeded',
}

export enum OverviewRequestKind {
    DocumentedRun = 'documented-run',
    PayoutSizeOptimum = 'payout-size-optimum',
    PortfolioProjection = 'portfolio-projection',
}

export interface DocumentedRunFigures {
    readonly anyPayoutGivenFundedProbability: UncertainValue;
    readonly attemptPassProbability: Estimate;
    readonly costPerAttempt: Estimate;
    readonly costPerFundedAccount: number;
    readonly expectedMonthlyNet: Estimate;
    readonly expectedMonthlyRealizedNet: Estimate;
    readonly expectedNetPerAttempt: Estimate;
    readonly expectedPayoutPerFundedAccount: UncertainValue;
    readonly fundedHorizonDays: number;
    readonly fundedPayoutCountDistribution: readonly number[];
    readonly fundedSurvivalProbability: Estimate;
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number;
    readonly payoutsPerFundedAccount: UncertainValue;
    readonly trials: number;
}

export type OverviewOutcome =
    | {
          readonly key: string;
          readonly kind: OverviewOutcomeKind.Failed;
          readonly reason: string;
      }
    | {
          readonly key: string;
          readonly kind: OverviewOutcomeKind.Succeeded;
          readonly result: OverviewResult;
      };

export interface OverviewPlanInput {
    readonly firmId: FirmId;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

export interface OverviewPlanKeyInput {
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

export interface OverviewProjectionPlanInput extends OverviewPlanInput {
    readonly accounts: number;
}

export interface OverviewRequest {
    readonly accounts?: number;
    readonly firmId: FirmId;
    readonly kind: OverviewRequestKind;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly spec: DocumentedPolicySpec;
}

export type OverviewResult =
    | {
          readonly figures: DocumentedRunFigures;
          readonly kind: OverviewRequestKind.DocumentedRun;
      }
    | {
          readonly figures: PayoutSizeOptimumFigures;
          readonly kind: OverviewRequestKind.PayoutSizeOptimum;
      }
    | {
          readonly figures: PortfolioProjectionFigures;
          readonly kind: OverviewRequestKind.PortfolioProjection;
      };

export interface OverviewWorkerRequest {
    readonly requests: readonly OverviewRequest[];
}

export interface OverviewWorkerResult {
    readonly outcomes: readonly OverviewOutcome[];
}

export interface PayoutSizeOptimumFigures {
    readonly creditSensitive: boolean;
    readonly evaluatedSizes: number;
    readonly expectedMonthlyNet: Estimate;
    readonly expectedMonthlyRealizedNet: Estimate;
    readonly fundedBustProbability: Estimate;
    readonly requestSize: number;
}

export interface PortfolioProjectionFigures {
    readonly accountsRequested: number;
    readonly accountsSimulated: number;
    readonly dayBudget: number;
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number;
    readonly timeline: PortfolioTimelineResult;
    readonly timelineGaps: readonly DocumentedPolicyTimelineGap[];
    readonly trials: number;
}

const OVERVIEW_FUNDED_HORIZON_DAYS = DEFAULT_FUNDED_HORIZON_DAYS;

const FUNDED_RR_TOLERANCE = 1e-9;

const DOCUMENTED_ENGINE_KINDS: readonly OverviewRequestKind[] = [
    OverviewRequestKind.DocumentedRun,
    OverviewRequestKind.PayoutSizeOptimum,
];

const OVERVIEW_RUN: DocumentedPolicyRun = {
    maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
    seed: 42,
    trials: 2000,
};

const OVERVIEW_PROJECTION_RUN: DocumentedPolicyRun = {
    maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
    seed: 42,
    trials: 500,
};

export const overviewRequestSchema = z
    .strictObject({
        accounts: z.number().int().positive().optional(),
        firmId: z.enum(FirmId),
        kind: z.enum(OverviewRequestKind),
        optIns: planOptInsSchema,
        planSerial: z.string().min(1),
        spec: documentedPolicySpecSchema.refine(
            (spec) => spec.start === undefined,
            {
                message:
                    'the overview runs a fresh start; a from-state start is not supported here',
                path: ['start'],
            },
        ),
    })
    .superRefine((request, context) => {
        const isProjection =
            request.kind === OverviewRequestKind.PortfolioProjection;
        if (isProjection === (request.accounts !== undefined)) return;
        context.addIssue({
            code: 'custom',
            message: isProjection
                ? 'a portfolio projection needs the number of accounts it simulates'
                : 'only a portfolio projection carries an account count',
            path: ['accounts'],
        });
    }) satisfies z.ZodType<OverviewRequest>;

export const overviewWorkerRequestSchema = z.strictObject({
    requests: z.array(overviewRequestSchema),
}) satisfies z.ZodType<OverviewWorkerRequest>;

export function overviewOutcomeOf(request: OverviewRequest): OverviewOutcome {
    const key = overviewRequestKey(request);
    try {
        const plan = planOf(request);
        return {
            key,
            kind: OverviewOutcomeKind.Succeeded,
            result: resultOf(plan, request),
        };
    } catch (error) {
        return {
            key,
            kind: OverviewOutcomeKind.Failed,
            reason: describeSimulationFailure(error),
        };
    }
}

export function overviewPlanKey(plan: OverviewPlanKeyInput): string {
    return stableJson({
        firmId: plan.firmId,
        optIns: plan.optIns,
        planSerial: plan.planSerial,
    });
}

export function overviewProjectionRequestsFor(
    plans: readonly OverviewProjectionPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    const requests = new Map<string, OverviewRequest>();
    for (const input of plans) {
        if (input.accounts < 1) continue;
        const plan = resolvedPlanOf(input);
        if (plan === null) continue;
        const request: OverviewRequest = {
            accounts: input.accounts,
            firmId: input.firmId,
            kind: OverviewRequestKind.PortfolioProjection,
            optIns: input.optIns,
            planSerial: input.planSerial,
            spec: documentedSpecFor(
                plan,
                input,
                rulebook,
                OVERVIEW_PROJECTION_RUN,
            ),
        };
        requests.set(overviewRequestKey(request), request);
    }
    return requests.values().toArray();
}

export function overviewRequestKey(request: OverviewRequest): string {
    const { spec } = request;
    return stableJson({
        accounts: request.accounts ?? null,
        firmId: request.firmId,
        kind: request.kind,
        optIns: request.optIns,
        planSerial: request.planSerial,
        policy: enginePolicyKey(spec.enginePolicy),
        rulebook: spec.rulebook,
        run: spec.run,
        start: spec.start ?? null,
    });
}

export function overviewRequestsFor(
    plans: readonly OverviewPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    const requests = new Map<string, OverviewRequest>();
    for (const input of plans) {
        const plan = resolvedPlanOf(input);
        if (plan === null) continue;
        const spec = documentedSpecFor(plan, input, rulebook);
        for (const kind of DOCUMENTED_ENGINE_KINDS) {
            const request: OverviewRequest = {
                firmId: input.firmId,
                kind,
                optIns: input.optIns,
                planSerial: input.planSerial,
                spec,
            };
            requests.set(overviewRequestKey(request), request);
        }
    }
    return requests.values().toArray();
}

function documentedRunResultOf(
    plan: Plan,
    spec: DocumentedPolicySpec,
): OverviewResult {
    const inputs = toSimInputs(plan, spec);
    const out = simulate(inputs);
    const { estimates } = out;
    return {
        figures: {
            anyPayoutGivenFundedProbability:
                estimates.anyPayoutGivenFundedProbability,
            attemptPassProbability: estimates.attemptPassProbability,
            costPerAttempt: estimates.costPerAttempt,
            costPerFundedAccount: out.costPerFundedAccount,
            expectedMonthlyNet: estimates.expectedMonthlyNet,
            expectedMonthlyRealizedNet: estimates.expectedMonthlyRealizedNet,
            expectedNetPerAttempt: estimates.expectedNetPerAttempt,
            expectedPayoutPerFundedAccount:
                estimates.expectedPayoutPerFundedAccount,
            fundedHorizonDays: inputs.fundedHorizonDays,
            fundedPayoutCountDistribution: out.fundedPayoutCountDistribution,
            fundedSurvivalProbability: estimates.fundedSurvivalProbability,
            minRetainedCushion: requiredInput(inputs, 'minRetainedCushion'),
            payoutRequestSize: requiredInput(inputs, 'payoutRequestSize'),
            payoutsPerFundedAccount: estimates.payoutsPerFundedAccount,
            trials: inputs.trials,
        },
        kind: OverviewRequestKind.DocumentedRun,
    };
}

function documentedSpecFor(
    plan: Plan,
    input: OverviewPlanInput,
    rulebook: RulebookParameters,
    run: DocumentedPolicyRun = OVERVIEW_RUN,
): DocumentedPolicySpec {
    const { policy: built } = buildEnginePolicy({
        accountPolicy: findFirm(input.firmId)?.accountPolicy,
        fundedHorizonDays: OVERVIEW_FUNDED_HORIZON_DAYS,
        measuredRebuyLag: input.measuredRebuyLag,
        plan,
        positionSizing: null,
        rulebook,
    });
    const enginePolicy: EnginePolicy = enginePolicySchema.parse({
        ...built,
        payoutRequestOverride: effectivePayoutRequest(
            plan,
            rulebook.payout.requestCents / CENTS_PER_DOLLAR,
        ),
    });
    return {
        enginePolicy,
        planSerial: input.planSerial,
        rulebook,
        run,
    };
}

function payoutSizeOptimumResultOf(
    plan: Plan,
    spec: DocumentedPolicySpec,
): OverviewResult {
    const sweep = runPayoutSizeSweep(plan, {
        source: AdviceSource.PayoutSizeSweep,
        spec,
    });
    if (sweep.kind === PayoutSizeSweepResultKind.NoOptimum) {
        throw new Error(sweep.issue);
    }
    const { optimum } = sweep;
    const { winner } = optimum;
    if (winner.kind !== StartBasis.Fresh) {
        throw new Error(
            'overviewWorker: the payout-size sweep returned a from-state row for a fresh-start request',
        );
    }
    return {
        figures: {
            creditSensitive: optimum.creditSensitive,
            evaluatedSizes: optimum.rows.length,
            expectedMonthlyNet: winner.out.estimates.expectedMonthlyNet,
            expectedMonthlyRealizedNet:
                winner.out.estimates.expectedMonthlyRealizedNet,
            fundedBustProbability: winner.out.estimates.fundedBustProbability,
            requestSize: winner.requestSize,
        },
        kind: OverviewRequestKind.PayoutSizeOptimum,
    };
}

function planOf(request: OverviewRequest): Plan {
    const plan = resolvedPlanOf(request);
    if (plan === null) {
        throw new Error(
            `overviewWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
        );
    }
    return plan;
}

function portfolioProjectionResultOf(
    plan: Plan,
    request: OverviewRequest,
): OverviewResult {
    const { accounts, spec } = request;
    if (accounts === undefined) {
        throw new Error(
            'overviewWorker: a portfolio projection request has no account count',
        );
    }
    const inputs = documentedPolicyTimelineInputs(plan, spec, accounts);
    const issue = simInputsSizingIssue({
        instrument: inputs.instrument,
        riskPerTrade: inputs.riskPerTrade,
        stopPoints: inputs.stopPoints,
    });
    if (issue !== null) throw new Error(issue);
    const timeline = simulatePortfolioTimeline(inputs);
    return {
        figures: {
            accountsRequested: accounts,
            accountsSimulated: timeline.accountsSimulated,
            dayBudget: inputs.dayBudget ?? DEFAULT_DAY_BUDGET,
            minRetainedCushion: requiredTimelineInput(
                inputs,
                'minRetainedCushion',
            ),
            payoutRequestSize: requiredTimelineInput(
                inputs,
                'payoutRequestSize',
            ),
            timeline,
            timelineGaps: timelineGapsOf(spec),
            trials: inputs.trials,
        },
        kind: OverviewRequestKind.PortfolioProjection,
    };
}

function requiredInput(
    inputs: SimInputs,
    field: 'minRetainedCushion' | 'payoutRequestSize',
): number {
    const value = inputs[field];
    if (value === undefined) {
        throw new Error(`overviewWorker: toSimInputs left ${field} unset`);
    }
    return value;
}

function requiredTimelineInput(
    inputs: PortfolioTimelineInputs,
    field: 'minRetainedCushion' | 'payoutRequestSize',
): number {
    const value = inputs[field];
    if (value === undefined) {
        throw new Error(
            `overviewWorker: documentedPolicyTimelineInputs left ${field} unset`,
        );
    }
    return value;
}

function resolvedPlanOf(input: OverviewPlanKeyInput): null | Plan {
    const plan = findFirm(input.firmId)?.findPlanBySerial(input.planSerial);
    return plan === null || plan === undefined
        ? null
        : withPlanOptIns(plan, input.optIns);
}

function resultOf(plan: Plan, request: OverviewRequest): OverviewResult {
    switch (request.kind) {
        case OverviewRequestKind.DocumentedRun: {
            return documentedRunResultOf(plan, request.spec);
        }
        case OverviewRequestKind.PayoutSizeOptimum: {
            return payoutSizeOptimumResultOf(plan, request.spec);
        }
        case OverviewRequestKind.PortfolioProjection: {
            return portfolioProjectionResultOf(plan, request);
        }
    }
}

function timelineGapsOf(
    spec: DocumentedPolicySpec,
): readonly DocumentedPolicyTimelineGap[] {
    const { enginePolicy, rulebook } = spec;
    const { funded, strategy } = rulebook;
    return DOCUMENTED_POLICY_TIMELINE_GAPS.filter((gap) => {
        switch (gap) {
            case DocumentedPolicyTimelineGap.FundedRrDiffersFromStrategyRr: {
                return (
                    Math.abs(
                        funded.takeProfitCents / funded.riskCents -
                            strategy.rr,
                    ) > FUNDED_RR_TOLERANCE
                );
            }
            case DocumentedPolicyTimelineGap.IntradayPathStepsPerR: {
                return enginePolicy.intradayPathStepsPerR !== undefined;
            }
            case DocumentedPolicyTimelineGap.RebuyLagDays: {
                return enginePolicy.rebuyLagDays > 0;
            }
        }
    });
}
