import { formatConjunctionList, formatCurrency } from '~/lib/format';
import {
    firmMinimumNotice,
    fundedRetainedCushionResolution,
} from '~/lib/prop-calculator/advisor';
import { RetainedCushionBasis } from '~/lib/prop-calculator/advisor/PayoutRequestDecision';
import {
    documentedFundedRisk,
    documentedFundedTakeProfit,
    documentedFundedTrades,
    type DocumentedPolicySpec,
    RebuyLagBasis,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import {
    CENTS_PER_DOLLAR,
    type FundedCycleTracker,
    minimumPayoutRequest,
    newFundedCycleTracker,
    newFundedCycleTrackerAfterReset,
    ONE_CENT,
    PayoutDayGateBasis,
    PayoutEvaluationKind,
    type PayoutGate,
    type Plan,
    requiredDayGateDays,
    sessionDaysForCalendarDays,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import {
    accountAfterClosedSession,
    documentedPayoutEvaluation,
    documentedRetainedCushion,
    type FundedMilestone,
    MilestoneKind,
    milestoneState,
} from './MilestoneState';
import { valueAtState } from './ValueAtState';
import {
    type ValueNotModeledResult,
    type ValueOutcome,
    type ValueResult,
    ValueResultKind,
    withCashAdded,
} from './ValueEstimate';

const MAX_ELIGIBILITY_PROFIT_MULTIPLE = 2;

const MAX_ELIGIBILITY_SESSIONS = 100;

const ELIGIBILITY_SESSION_SLACK = 2;

const ONE_DOLLAR = 1;

const PERCENT_DIGITS = 2;

const RETAINED_CUSHION_BASIS_TEXT: Readonly<
    Record<RetainedCushionBasis, string>
> = {
    [RetainedCushionBasis.HardRule2Default]: "Hard Rule 2's minimum",
    [RetainedCushionBasis.LiveOneDrawdown]: 'one live drawdown',
    [RetainedCushionBasis.PersonalOverride]: 'your retained cushion entry',
    [RetainedCushionBasis.RulebookSize]: "the rulebook's retained cushion size",
};

export enum ValueChainStepKind {
    EvalStart = 'eval-start',
    FirstPayoutEligible = 'first-payout-eligible',
    FreshFunded = 'fresh-funded',
    PostFirstPayout = 'post-first-payout',
}

export const VALUE_CHAIN_STEP_ORDER: readonly ValueChainStepKind[] = [
    ValueChainStepKind.EvalStart,
    ValueChainStepKind.FreshFunded,
    ValueChainStepKind.FirstPayoutEligible,
    ValueChainStepKind.PostFirstPayout,
];

enum EligibilityShortfall {
    HardBreach = 'hard-breach',
    RetainedCushion = 'retained-cushion',
}

export interface FirstPayoutEligibleBuild {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly dayGateSessions: number;
    readonly fewestSessions: number;
    readonly sessions: number;
    readonly totalProfit: number;
}

export interface RequestNowValue {
    readonly continuation: ValueResult;
    readonly requestNow: ValueResult;
    readonly traderReceives: number;
}

export interface ValueChainResult {
    readonly accountValue: null | ValueOutcome;
    readonly failedSteps: readonly ValueChainStepFailure[];
    readonly steps: readonly ValueChainStep[];
}

export interface ValueChainStep {
    readonly assumptions: readonly string[];
    readonly kind: ValueChainStepKind;
    readonly value: ValueResult;
}

export interface ValueChainStepFailure {
    readonly kind: ValueChainStepKind;
    readonly reason: string;
}

interface ChainStepBuilt {
    readonly assumptions: readonly string[];
    readonly value: ValueResult;
}

type PayoutBlocker = EligibilityShortfall | PayoutGate;

class ChainStepFailure {
    constructor(readonly reason: string) {}
}

export function evalStartAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

export function firstPayoutEligibleAccount(
    plan: Plan,
    freshFunded: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ReconstructedFundedOrEvalAccount {
    return firstPayoutEligibleBuild(plan, freshFunded, spec).account;
}

export function firstPayoutEligibleAssumptions(
    build: FirstPayoutEligibleBuild,
    spec: DocumentedPolicySpec,
): readonly string[] {
    const { account, sessions, totalProfit } = build;
    const milestone = fundedMilestoneOf(account, spec);
    return [
        `${sessions} equal winning ${sessions === 1 ? 'session' : 'sessions'}: ${sessionReasonOf(build)}`,
        `Total profit ${formatCurrency(totalProfit, 2)}, ${formatCurrency(totalProfit / sessions, 2)} per session: the smallest total the search found that passes every payout gate and keeps the retained cushion after the request`,
        'One closed trade per session, each closed through the same day close as a simulated session; this is a stylised state, not a path at your rulebook sizing',
        sizingComparisonOf(build, spec),
        `For the documented request the engine settles ${formatCurrency(milestone.debited, 2)} from the account and you receive ${formatCurrency(milestone.traderReceives, 2)}`,
        ...valueBasisAssumptions(account.plan, spec),
    ];
}

export function firstPayoutEligibleBuild(
    plan: Plan,
    freshFunded: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): FirstPayoutEligibleBuild {
    const { dayGateSessions, sessions: fewestSessions } =
        fewestSessionsForPayoutGates(plan);
    const mostSessions = Math.min(
        fewestSessions + ELIGIBILITY_SESSION_SLACK,
        MAX_ELIGIBILITY_SESSIONS,
    );
    const ceiling = plan.accountSize * MAX_ELIGIBILITY_PROFIT_MULTIPLE;
    for (
        let sessions = fewestSessions;
        sessions <= mostSessions;
        sessions += 1
    ) {
        const accountFor = (profit: number) =>
            accountAfterEqualDays(freshFunded, sessions, profit);
        const built = (profit: number): FirstPayoutEligibleBuild => ({
            account: accountFor(profit),
            dayGateSessions,
            fewestSessions,
            sessions,
            totalProfit: profit,
        });
        const isEligible = (profit: number) =>
            payoutBlockerOf(accountFor(profit), spec) === null;
        let low = Math.max(
            plan.minPayoutProfit,
            sessions * (plan.minQualifyingDayProfit ?? 0),
        );
        if (isEligible(low)) return built(low);
        let high = Math.max(low * 2, ONE_DOLLAR);
        while (!isEligible(high) && high < ceiling) {
            low = high;
            high = Math.min(high * 2, ceiling);
        }
        if (!isEligible(high)) continue;
        while (high - low > ONE_CENT) {
            const middle = (low + high) / 2;
            if (isEligible(middle)) high = middle;
            else low = middle;
        }
        return built(high);
    }
    throw new Error(
        `value/ValueChain: no first-payout-eligible account of ${plan.accountSize} dollars passes the payout gates after the documented request (${payoutBlockerOf(accountAfterEqualDays(freshFunded, fewestSessions, ceiling), spec) ?? 'unknown'}), even at ${fewestSessions} equal winning sessions totalling ${ceiling} dollars`,
    );
}

export function freshFundedAccount(
    plan: Plan,
): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

export function fundedTrackerAfterMilestonePayout(
    account: ReconstructedFundedOrEvalAccount,
    milestone: FundedMilestone,
): FundedCycleTracker {
    const priorTracker = account.fundedTracker;
    if (priorTracker === null) {
        throw new Error(
            'value/ValueChain: a funded account needs its funded cycle tracker',
        );
    }
    const consistency = account.plan.fundedConsistencyRule(
        priorTracker.payoutsIssued,
    );
    const tracker =
        priorTracker.fundedResetsUsed === 0
            ? newFundedCycleTracker(milestone.state)
            : newFundedCycleTrackerAfterReset(
                  milestone.state,
                  priorTracker.fundedResetsUsed,
              );
    tracker.payoutsIssued = priorTracker.payoutsIssued + 1;
    tracker.cumulativePayout =
        priorTracker.cumulativePayout + milestone.traderReceives;
    tracker.cycleBestDayProfit = consistency?.isPerpetual()
        ? priorTracker.cycleBestDayProfit
        : 0;
    return tracker;
}

export function postFirstPayoutAccount(
    firstPayoutEligible: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ReconstructedFundedOrEvalAccount {
    const milestone = milestoneState(firstPayoutEligible, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error(
            'postFirstPayoutAccount: expected a funded milestone at the first-payout-eligible state',
        );
    }
    return {
        ...firstPayoutEligible,
        fundedTracker: fundedTrackerAfterMilestonePayout(
            firstPayoutEligible,
            milestone,
        ),
        state: milestone.state,
    };
}

export function requestNowValue(
    account: ReconstructedFundedOrEvalAccount,
    milestone: FundedMilestone,
    spec: DocumentedPolicySpec,
): RequestNowValue {
    const continuation = requireValue(
        valueAtState(
            {
                ...account,
                cushion: milestone.state.balance - milestone.state.threshold,
                fundedTracker: fundedTrackerAfterMilestonePayout(
                    account,
                    milestone,
                ),
                state: milestone.state,
            },
            spec,
        ),
    );
    return {
        continuation,
        requestNow: withCashAdded(continuation, milestone.traderReceives),
        traderReceives: milestone.traderReceives,
    };
}

export function requireValue<
    TModeled extends {
        readonly kind: Exclude<ValueResultKind, ValueResultKind.NotModeled>;
    },
>(outcome: TModeled | ValueNotModeledResult): TModeled {
    if (outcome.kind === ValueResultKind.NotModeled) {
        throw new Error(
            'value/ValueChain: expected a modeled outcome for an eval or funded account, got not-modeled',
        );
    }
    return outcome;
}

export function valueChain(
    plan: Plan,
    spec: DocumentedPolicySpec,
    account?: ReconstructedAccount,
): ValueChainResult {
    const failedSteps: ValueChainStepFailure[] = [];
    const steps: ValueChainStep[] = [];
    const record = (
        kind: ValueChainStepKind,
        outcome: ChainStepBuilt | ChainStepFailure,
    ): void => {
        if (outcome instanceof ChainStepFailure) {
            failedSteps.push({ kind, reason: outcome.reason });
        } else {
            steps.push({
                assumptions: outcome.assumptions,
                kind,
                value: outcome.value,
            });
        }
    };
    const valueOnly = (
        accountOf: () => ReconstructedFundedOrEvalAccount,
    ): ChainStepBuilt | ChainStepFailure =>
        guarded(() => ({
            assumptions: valueBasisAssumptions(plan, spec),
            value: requireValue(valueAtState(accountOf(), spec)),
        }));
    const freshFunded = freshFundedAccount(plan);
    record(
        ValueChainStepKind.EvalStart,
        valueOnly(() => evalStartAccount(plan)),
    );
    record(
        ValueChainStepKind.FreshFunded,
        valueOnly(() => freshFunded),
    );
    const eligibleBuild = guarded(() =>
        firstPayoutEligibleBuild(plan, freshFunded, spec),
    );
    record(
        ValueChainStepKind.FirstPayoutEligible,
        eligibleBuild instanceof ChainStepFailure
            ? eligibleBuild
            : guarded(() => ({
                  assumptions: firstPayoutEligibleAssumptions(
                      eligibleBuild,
                      spec,
                  ),
                  value: requireValue(
                      valueAtState(eligibleBuild.account, spec),
                  ),
              })),
    );
    record(
        ValueChainStepKind.PostFirstPayout,
        eligibleBuild instanceof ChainStepFailure
            ? new ChainStepFailure(
                  `the first-payout-eligible step failed (${eligibleBuild.reason}), so there is no account to take the first payout from`,
              )
            : guarded(() => ({
                  assumptions: [
                      postFirstPayoutAssumption(eligibleBuild.account, spec),
                      ...valueBasisAssumptions(plan, spec),
                  ],
                  value: requireValue(
                      valueAtState(
                          postFirstPayoutAccount(eligibleBuild.account, spec),
                          spec,
                      ),
                  ),
              })),
    );
    return {
        accountValue:
            account === undefined ? null : valueAtState(account, spec),
        failedSteps,
        steps,
    };
}

function accountAfterEqualDays(
    freshFunded: ReconstructedFundedOrEvalAccount,
    sessions: number,
    profit: number,
): ReconstructedFundedOrEvalAccount {
    const dailyProfit = profit / sessions;
    let account = freshFunded;
    for (let session = 0; session < sessions; session += 1) {
        account = accountAfterClosedSession(account, dailyProfit);
    }
    return account;
}

function fewestSessionsForPayoutGates(plan: Plan): {
    readonly dayGateSessions: number;
    readonly sessions: number;
} {
    const requiredDays = requiredDayGateDays(plan, { payoutsIssued: 0 });
    let sessions: number;
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            sessions = sessionDaysForCalendarDays(requiredDays) + 1;
            break;
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            sessions = requiredDays;
            break;
        }
    }
    sessions = Math.max(sessions, 1);
    const dayGateSessions = sessions;
    const consistency = plan.fundedConsistencyRule(0);
    while (
        consistency?.isViolated(ONE_DOLLAR, sessions * ONE_DOLLAR) === true &&
        sessions < MAX_ELIGIBILITY_SESSIONS
    ) {
        sessions += 1;
    }
    return { dayGateSessions, sessions };
}

function fundedMilestoneOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): FundedMilestone {
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error(
            'value/ValueChain: expected a funded milestone for a funded account',
        );
    }
    return milestone;
}

function guarded<T>(compute: () => T): ChainStepFailure | T {
    try {
        return compute();
    } catch (error) {
        return new ChainStepFailure(
            error instanceof Error ? error.message : String(error),
        );
    }
}

function payoutBlockerOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): null | PayoutBlocker {
    const evaluation = documentedPayoutEvaluation(account, spec);
    switch (evaluation.kind) {
        case PayoutEvaluationKind.Blocked: {
            return evaluation.gate;
        }
        case PayoutEvaluationKind.Eligible: {
            if (evaluation.causesHardBreach) {
                return EligibilityShortfall.HardBreach;
            }
            return retainedCushionShortfallOf(account, spec) > 0
                ? EligibilityShortfall.RetainedCushion
                : null;
        }
    }
}

function payoutRequestAssumption(
    plan: Plan,
    spec: DocumentedPolicySpec,
): string {
    const { enginePolicy, rulebook } = spec;
    const documentedPlan = resolveDocumentedPlan(plan, enginePolicy);
    const rulebookRequest = rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const requested = enginePolicy.payoutRequestOverride ?? rulebookRequest;
    const source =
        requested === rulebookRequest
            ? "the rulebook's payout size"
            : 'your payout request entry';
    const request = resolveDocumentedPayoutRequestSize(
        documentedPlan,
        enginePolicy,
        rulebook.payout,
    );
    const notice = firmMinimumNotice(
        requested,
        minimumPayoutRequest(documentedPlan),
    );
    const raised =
        notice === null
            ? ''
            : `, raised from ${formatCurrency(requested, 2)} to the firm minimum`;
    return `Documented request ${formatCurrency(request, 2)} from ${source}${raised}`;
}

function postFirstPayoutAssumption(
    firstPayoutEligible: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): string {
    const milestone = fundedMilestoneOf(firstPayoutEligible, spec);
    return `Assumes the first payout taken from the first-payout-eligible state: ${formatCurrency(milestone.debited, 2)} leaves the account and you receive ${formatCurrency(milestone.traderReceives, 2)}, balance after ${formatCurrency(milestone.state.balance, 2)}`;
}

function retainedCushionAssumption(
    plan: Plan,
    spec: DocumentedPolicySpec,
): string {
    const { enginePolicy, rulebook } = spec;
    const requested = resolveDocumentedRetainedCushion(
        enginePolicy,
        rulebook.payout,
    );
    const rulebookCushion =
        rulebook.payout.retainedCushionCents / CENTS_PER_DOLLAR;
    const basis =
        requested === rulebookCushion
            ? fundedRetainedCushionResolution(rulebook).basis
            : RetainedCushionBasis.PersonalOverride;
    const cushion = documentedRetainedCushion(
        resolveDocumentedPlan(plan, enginePolicy),
        spec,
    );
    const floorNote =
        cushion > requested
            ? `, raised to the plan's own floor from ${formatCurrency(requested, 2)}`
            : '';
    return `Retained cushion ${formatCurrency(cushion, 2)} kept after each payout, from ${RETAINED_CUSHION_BASIS_TEXT[basis]}${floorNote}`;
}

function retainedCushionShortfallOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): number {
    const milestone = fundedMilestoneOf(account, spec);
    const required = Math.max(
        documentedRetainedCushion(
            resolveDocumentedPlan(account.plan, spec.enginePolicy),
            spec,
        ),
        ONE_CENT,
    );
    return required - (milestone.state.balance - milestone.state.threshold);
}

function sessionReasonOf(build: FirstPayoutEligibleBuild): string {
    const reasons = [
        `the plan's payout day gate needs ${build.dayGateSessions} ${build.dayGateSessions === 1 ? 'session' : 'sessions'}`,
    ];
    if (build.fewestSessions > build.dayGateSessions) {
        reasons.push(
            `the funded consistency rule needs at least ${build.fewestSessions} sessions so no day is above its best-day share`,
        );
    }
    if (build.sessions > build.fewestSessions) {
        reasons.push(
            `${build.sessions - build.fewestSessions} more ${build.sessions - build.fewestSessions === 1 ? 'session was' : 'sessions were'} needed because fewer could not pass every payout gate within ${MAX_ELIGIBILITY_PROFIT_MULTIPLE}x the account size in profit`,
        );
    }
    return formatConjunctionList(reasons);
}

function sizingComparisonOf(
    build: FirstPayoutEligibleBuild,
    spec: DocumentedPolicySpec,
): string {
    const { enginePolicy, rulebook } = spec;
    const tradesPerDay = documentedFundedTrades(rulebook, enginePolicy);
    const takeProfitCents = Math.round(
        documentedFundedTakeProfit(rulebook, enginePolicy) * CENTS_PER_DOLLAR,
    );
    const sessionCents = Math.round(
        (build.totalProfit / build.sessions) * CENTS_PER_DOLLAR,
    );
    const totalCents = Math.round(build.totalProfit * CENTS_PER_DOLLAR);
    const winsPerSession = Math.ceil(sessionCents / takeProfitCents);
    const tradingDays = Math.ceil(
        Math.ceil(totalCents / takeProfitCents) / tradesPerDay,
    );
    return `At your funded sizing each session's ${formatCurrency(sessionCents / CENTS_PER_DOLLAR, 2)} would need ${winsPerSession} take-profit ${winsPerSession === 1 ? 'win' : 'wins'} of ${formatCurrency(takeProfitCents / CENTS_PER_DOLLAR, 2)}, ${winsPerSession > tradesPerDay ? 'above' : 'within'} your cap of ${tradesPerDay} trades per day, and the whole profit needs at least ${tradingDays} trading ${tradingDays === 1 ? 'day' : 'days'} at that cap`;
}

function valueBasisAssumptions(
    plan: Plan,
    spec: DocumentedPolicySpec,
): readonly string[] {
    const { enginePolicy, rulebook, run } = spec;
    const { strategy } = rulebook;
    const risk = documentedFundedRisk(rulebook, enginePolicy);
    const takeProfit = documentedFundedTakeProfit(rulebook, enginePolicy);
    const rebuyLag =
        enginePolicy.rebuyLagBasis === RebuyLagBasis.Measured
            ? `measured at ${enginePolicy.rebuyLagDays} days`
            : 'assumed zero days';
    return [
        `Expected cash from each state over ${enginePolicy.fundedHorizonDays} funded days, ${run.trials} trials with seed ${run.seed}, shown with its standard error; the eval stage is capped at ${run.maxEvalDays} days`,
        `Strategy from your rulebook: win rate ${Number((strategy.winrate * 100).toFixed(PERCENT_DIGITS))}%, R:R ${strategy.rr}, funded risk ${formatCurrency(risk, 2)} and take-profit ${formatCurrency(takeProfit, 2)} per trade, at most ${documentedFundedTrades(rulebook, enginePolicy)} trades per day`,
        payoutRequestAssumption(plan, spec),
        retainedCushionAssumption(plan, spec),
        `Rebuy lag between accounts ${rebuyLag}`,
    ];
}
