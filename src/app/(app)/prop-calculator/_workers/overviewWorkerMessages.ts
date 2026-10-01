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
    TradingPhase,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    accountSnapshotInputSchema,
    AdviceSource,
    applicableTimelineGaps,
    buildEnginePolicy,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
    type DocumentedPolicyRun,
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    type DocumentedPolicyTimelineGap,
    documentedPolicyTimelineInputs,
    type EnginePolicy,
    enginePolicyKey,
    enginePolicySchema,
    type MeasuredRebuyLag,
    type NextPayoutProjection,
    PayoutSizeSweepResultKind,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    runEngineOptimum,
    runPayoutSizeSweep,
    SizingStage,
    StartBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    type EvalMilestone,
    type EvalMilestoneGap,
    evalStartAccount,
    firstPayoutEligibleAccount,
    freshFundedAccount,
    MilestoneKind,
    milestoneState,
    postFirstPayoutAccount,
    requestNowValue,
    requireValue,
    retireComparison,
    type RetireComparisonResult,
    startStateOf,
    valueAtState,
    ValueChainStepKind,
    type ValueResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
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

export enum OverviewRequestGroup {
    Accounts = 'accounts',
    Policy = 'policy',
    Projection = 'projection',
    Values = 'values',
}

export enum OverviewRequestKind {
    AccountFromState = 'account-from-state',
    DocumentedRun = 'documented-run',
    PayoutSizeOptimum = 'payout-size-optimum',
    PlanValues = 'plan-values',
    PortfolioProjection = 'portfolio-projection',
    RetireComparison = 'retire-comparison',
    ValueChain = 'value-chain',
}

export enum ValueChainStepOutcomeKind {
    Unavailable = 'unavailable',
    Value = 'value',
}

export interface AccountFromStateFigures {
    readonly milestone: AccountMilestoneFigures;
    readonly nextPayout: NextPayoutProjection | null;
    readonly stage: SizingStage.Eval | SizingStage.Funded;
    readonly startBasis: StartBasis.FromState;
    readonly trials: number;
    readonly valueNow: ValueResult;
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
    readonly fundedBustProbability: Estimate;
    readonly fundedHorizonDays: number;
    readonly fundedPayoutCountDistribution: readonly number[];
    readonly fundedSurvivalProbability: Estimate;
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number;
    readonly payoutsPerFundedAccount: UncertainValue;
    readonly trials: number;
}

export interface OverviewAccountPlanInput extends OverviewPlanInput {
    readonly account: AccountSnapshotInput;
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
    readonly account?: AccountSnapshotInput;
    readonly accounts?: number;
    readonly firmId: FirmId;
    readonly kind: OverviewRequestKind;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly spec: DocumentedPolicySpec;
}

export type OverviewResult =
    | {
          readonly figures: AccountFromStateFigures;
          readonly kind: OverviewRequestKind.AccountFromState;
      }
    | {
          readonly figures: DocumentedRunFigures;
          readonly kind: OverviewRequestKind.DocumentedRun;
      }
    | {
          readonly figures: PayoutSizeOptimumFigures;
          readonly kind: OverviewRequestKind.PayoutSizeOptimum;
      }
    | {
          readonly figures: PlanValuesFigures;
          readonly kind: OverviewRequestKind.PlanValues;
      }
    | {
          readonly figures: PortfolioProjectionFigures;
          readonly kind: OverviewRequestKind.PortfolioProjection;
      }
    | {
          readonly figures: RetireComparisonResult;
          readonly kind: OverviewRequestKind.RetireComparison;
      }
    | {
          readonly figures: ValueChainFigures;
          readonly kind: OverviewRequestKind.ValueChain;
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

export interface PlanValuesFigures {
    readonly freshFundedValue: ValueResult;
    readonly retryFee: number;
    readonly trials: number;
    readonly valueFreshEval: ValueResult;
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

export interface ValueChainFigures {
    readonly steps: readonly ValueChainStepFigures[];
    readonly trials: number;
}

export interface ValueChainStepFigures {
    readonly kind: ValueChainStepKind;
    readonly outcome: ValueChainStepOutcome;
}

interface AccountMilestoneFigures {
    readonly debited: null | number;
    readonly kind: MilestoneKind.Eval | MilestoneKind.Funded;
    readonly received: null | number;
    readonly unmetGates: readonly EvalMilestoneGap[];
    readonly value: ValueChainStepOutcome;
}

type ValueChainStepOutcome =
    | {
          readonly kind: ValueChainStepOutcomeKind.Unavailable;
          readonly reason: string;
      }
    | {
          readonly kind: ValueChainStepOutcomeKind.Value;
          readonly value: ValueResult;
      };

const OVERVIEW_FUNDED_HORIZON_DAYS = DEFAULT_FUNDED_HORIZON_DAYS;

const REQUEST_GROUP: Readonly<
    Record<OverviewRequestKind, OverviewRequestGroup>
> = {
    [OverviewRequestKind.AccountFromState]: OverviewRequestGroup.Accounts,
    [OverviewRequestKind.DocumentedRun]: OverviewRequestGroup.Policy,
    [OverviewRequestKind.PayoutSizeOptimum]: OverviewRequestGroup.Policy,
    [OverviewRequestKind.PlanValues]: OverviewRequestGroup.Values,
    [OverviewRequestKind.PortfolioProjection]: OverviewRequestGroup.Projection,
    [OverviewRequestKind.RetireComparison]: OverviewRequestGroup.Accounts,
    [OverviewRequestKind.ValueChain]: OverviewRequestGroup.Values,
};

const ACCOUNT_REQUEST_KINDS: ReadonlySet<OverviewRequestKind> = new Set(
    Object.values(OverviewRequestKind).filter(
        (kind) => REQUEST_GROUP[kind] === OverviewRequestGroup.Accounts,
    ),
);

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
        account: accountSnapshotInputSchema.optional(),
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
        if (isProjection !== (request.accounts !== undefined)) {
            context.addIssue({
                code: 'custom',
                message: isProjection
                    ? 'a portfolio projection needs the number of accounts it simulates'
                    : 'only a portfolio projection carries an account count',
                path: ['accounts'],
            });
        }
        const isAccountRequest = ACCOUNT_REQUEST_KINDS.has(request.kind);
        if (isAccountRequest === (request.account !== undefined)) return;
        context.addIssue({
            code: 'custom',
            message: isAccountRequest
                ? 'an account request needs the account state it starts from'
                : 'only an account request carries an account state',
            path: ['account'],
        });
    }) satisfies z.ZodType<OverviewRequest>;

export const overviewWorkerRequestSchema = z.strictObject({
    requests: z.array(overviewRequestSchema),
}) satisfies z.ZodType<OverviewWorkerRequest>;

export function overviewAccountRequestsFor(
    accounts: readonly OverviewAccountPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    return accountRequestsOf(
        OverviewRequestKind.AccountFromState,
        accounts,
        rulebook,
    );
}

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

export function overviewPlanOptInsOf(
    plan: Pick<Plan, 'takesFundedReset' | 'takesOneTimeEarlyWithdrawal'>,
): PlanOptIns {
    return {
        takesFundedReset: plan.takesFundedReset,
        takesOneTimeEarlyWithdrawal: plan.takesOneTimeEarlyWithdrawal,
    };
}

export function overviewPlanValueRequestsFor(
    plans: readonly OverviewPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    return planRequestsOf(OverviewRequestKind.PlanValues, plans, rulebook);
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

export function overviewRequestGroupOf(
    request: Pick<OverviewRequest, 'kind'>,
): OverviewRequestGroup {
    return REQUEST_GROUP[request.kind];
}

export function overviewRequestKey(request: OverviewRequest): string {
    const { spec } = request;
    return stableJson({
        account: request.account ?? null,
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

export function overviewRequestsByGroup(
    requests: readonly OverviewRequest[],
): Readonly<Record<OverviewRequestGroup, readonly OverviewRequest[]>> {
    return {
        [OverviewRequestGroup.Accounts]: requestsOfGroup(
            requests,
            OverviewRequestGroup.Accounts,
        ),
        [OverviewRequestGroup.Policy]: requestsOfGroup(
            requests,
            OverviewRequestGroup.Policy,
        ),
        [OverviewRequestGroup.Projection]: requestsOfGroup(
            requests,
            OverviewRequestGroup.Projection,
        ),
        [OverviewRequestGroup.Values]: requestsOfGroup(
            requests,
            OverviewRequestGroup.Values,
        ),
    };
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

export function overviewRequestsKey(
    requests: readonly OverviewRequest[],
): string {
    return requests.map((request) => overviewRequestKey(request)).join('\n');
}

export function overviewRetireRequestsFor(
    accounts: readonly OverviewAccountPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    return accountRequestsOf(
        OverviewRequestKind.RetireComparison,
        accounts,
        rulebook,
    );
}

export function overviewValueChainRequestsFor(
    plans: readonly OverviewPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    return planRequestsOf(OverviewRequestKind.ValueChain, plans, rulebook);
}

function accountFromStateResultOf(
    plan: Plan,
    request: OverviewRequest,
): OverviewResult {
    const account = fromStateAccountOf(plan, request);
    const { spec } = request;
    return {
        figures: {
            milestone: milestoneFiguresOf(account, spec),
            nextPayout:
                account.kind === TradingPhase.Funded
                    ? nextPayoutOf(account, spec)
                    : null,
            stage:
                account.kind === TradingPhase.Eval
                    ? SizingStage.Eval
                    : SizingStage.Funded,
            startBasis: StartBasis.FromState,
            trials: spec.run.trials,
            valueNow: requireValue(valueAtState(account, spec)),
        },
        kind: OverviewRequestKind.AccountFromState,
    };
}

function accountRequestsOf(
    kind:
        | OverviewRequestKind.AccountFromState
        | OverviewRequestKind.RetireComparison,
    accounts: readonly OverviewAccountPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    const requests = new Map<string, OverviewRequest>();
    for (const input of accounts) {
        if (input.account.stage === SizingStage.Live) continue;
        const plan = resolvedPlanOf(input);
        if (plan === null) continue;
        const request: OverviewRequest = {
            account: input.account,
            firmId: input.firmId,
            kind,
            optIns: input.optIns,
            planSerial: input.planSerial,
            spec: documentedSpecFor(plan, input, rulebook),
        };
        requests.set(overviewRequestKey(request), request);
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
            fundedBustProbability: estimates.fundedBustProbability,
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

function evalMilestoneValueOf(
    account: ReconstructedFundedOrEvalAccount,
    milestone: EvalMilestone,
    spec: DocumentedPolicySpec,
): ValueResult {
    const { state } = milestone;
    return requireValue(
        valueAtState(
            {
                ...account,
                cushion: state.balance - state.threshold,
                state,
            },
            spec,
        ),
    );
}

function fromStateAccountOf(
    plan: Plan,
    request: OverviewRequest,
): ReconstructedFundedOrEvalAccount {
    const { account: snapshot } = request;
    if (snapshot === undefined) {
        throw new Error(
            'overviewWorker: an account request has no account state',
        );
    }
    const account = AccountReconstruction.rebuild(snapshot, plan);
    if (account.kind === ReconstructedLiveKind.Live) {
        throw new Error(
            'overviewWorker: a live account has no from-state value model',
        );
    }
    return account;
}

function lazily<Built>(build: () => Built): () => Built {
    let built: undefined | { readonly value: Built };
    return () => {
        built ??= { value: build() };
        return built.value;
    };
}

function milestoneFiguresOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): AccountMilestoneFigures {
    const milestone = milestoneState(account, spec);
    switch (milestone.kind) {
        case MilestoneKind.Eval: {
            return {
                debited: null,
                kind: MilestoneKind.Eval,
                received: null,
                unmetGates: milestone.unmetGates,
                value: valueOutcomeOf(() =>
                    evalMilestoneValueOf(account, milestone, spec),
                ),
            };
        }
        case MilestoneKind.Funded: {
            return {
                debited: milestone.debited,
                kind: MilestoneKind.Funded,
                received: milestone.traderReceives,
                unmetGates: [],
                value: valueOutcomeOf(
                    () => requestNowValue(account, milestone, spec).requestNow,
                ),
            };
        }
        case MilestoneKind.Live:
        case ValueResultKind.NotModeled: {
            throw new Error(
                'overviewWorker: the account has no modeled next milestone',
            );
        }
    }
}

function nextPayoutOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): NextPayoutProjection {
    const start = startStateOf(account.plan, account);
    if (start.phase !== TradingPhase.Funded) {
        throw new Error(
            'overviewWorker: a next payout projection needs a funded account',
        );
    }
    const result = runEngineOptimum(account.plan, {
        base: toSimInputs(account.plan, spec),
        policy: spec.enginePolicy,
        source: AdviceSource.NextPayoutProjection,
        start,
    });
    if (result.source !== AdviceSource.NextPayoutProjection) {
        throw new Error(
            'overviewWorker: the engine runner returned another result for a next payout projection',
        );
    }
    return result.projection;
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

function planRequestsOf(
    kind: OverviewRequestKind.PlanValues | OverviewRequestKind.ValueChain,
    plans: readonly OverviewPlanInput[],
    rulebook: RulebookParameters,
): readonly OverviewRequest[] {
    const requests = new Map<string, OverviewRequest>();
    for (const input of plans) {
        const plan = resolvedPlanOf(input);
        if (plan === null) continue;
        const request: OverviewRequest = {
            firmId: input.firmId,
            kind,
            optIns: input.optIns,
            planSerial: input.planSerial,
            spec: documentedSpecFor(plan, input, rulebook),
        };
        requests.set(overviewRequestKey(request), request);
    }
    return requests.values().toArray();
}

function planValuesResultOf(
    plan: Plan,
    spec: DocumentedPolicySpec,
): OverviewResult {
    return {
        figures: {
            freshFundedValue: requireValue(
                valueAtState(freshFundedAccount(plan), spec),
            ),
            retryFee: plan.retryFee(),
            trials: spec.run.trials,
            valueFreshEval: requireValue(
                valueAtState(evalStartAccount(plan), spec),
            ),
        },
        kind: OverviewRequestKind.PlanValues,
    };
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
            timelineGaps: applicableTimelineGaps(spec),
            trials: inputs.trials,
        },
        kind: OverviewRequestKind.PortfolioProjection,
    };
}

function requestsOfGroup(
    requests: readonly OverviewRequest[],
    group: OverviewRequestGroup,
): readonly OverviewRequest[] {
    return requests.filter(
        (request) => overviewRequestGroupOf(request) === group,
    );
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
        case OverviewRequestKind.AccountFromState: {
            return accountFromStateResultOf(plan, request);
        }
        case OverviewRequestKind.DocumentedRun: {
            return documentedRunResultOf(plan, request.spec);
        }
        case OverviewRequestKind.PayoutSizeOptimum: {
            return payoutSizeOptimumResultOf(plan, request.spec);
        }
        case OverviewRequestKind.PlanValues: {
            return planValuesResultOf(plan, request.spec);
        }
        case OverviewRequestKind.PortfolioProjection: {
            return portfolioProjectionResultOf(plan, request);
        }
        case OverviewRequestKind.RetireComparison: {
            return retireComparisonResultOf(plan, request);
        }
        case OverviewRequestKind.ValueChain: {
            return valueChainResultOf(plan, request.spec);
        }
    }
}

function retireComparisonResultOf(
    plan: Plan,
    request: OverviewRequest,
): OverviewResult {
    const outcome = retireComparison(
        fromStateAccountOf(plan, request),
        request.spec,
        { isCapacityBound: false, replacementPlan: plan },
    );
    if ('kind' in outcome) {
        throw new Error(
            'overviewWorker: the account has no modeled retire comparison',
        );
    }
    return { figures: outcome, kind: OverviewRequestKind.RetireComparison };
}

function valueChainResultOf(
    plan: Plan,
    spec: DocumentedPolicySpec,
): OverviewResult {
    const freshFunded = freshFundedAccount(plan);
    const eligible = lazily(() =>
        firstPayoutEligibleAccount(plan, freshFunded, spec),
    );
    const steps: readonly (readonly [
        ValueChainStepKind,
        () => ReconstructedFundedOrEvalAccount,
    ])[] = [
        [ValueChainStepKind.EvalStart, () => evalStartAccount(plan)],
        [ValueChainStepKind.FreshFunded, () => freshFunded],
        [ValueChainStepKind.FirstPayoutEligible, eligible],
        [
            ValueChainStepKind.PostFirstPayout,
            () => postFirstPayoutAccount(eligible(), spec),
        ],
    ];
    return {
        figures: {
            steps: steps.map(([kind, accountOf]) =>
                valueChainStepOf(kind, accountOf, spec),
            ),
            trials: spec.run.trials,
        },
        kind: OverviewRequestKind.ValueChain,
    };
}

function valueChainStepOf(
    kind: ValueChainStepKind,
    accountOf: () => ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ValueChainStepFigures {
    return {
        kind,
        outcome: valueOutcomeOf(() =>
            requireValue(valueAtState(accountOf(), spec)),
        ),
    };
}

function valueOutcomeOf(valueOf: () => ValueResult): ValueChainStepOutcome {
    try {
        return {
            kind: ValueChainStepOutcomeKind.Value,
            value: valueOf(),
        };
    } catch (error) {
        return {
            kind: ValueChainStepOutcomeKind.Unavailable,
            reason: describeSimulationFailure(error),
        };
    }
}
