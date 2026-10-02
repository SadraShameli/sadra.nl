import { formatGateCurrency } from '~/lib/format';
import {
    type Dollars,
    dollars,
    DrawdownKind,
    findFirm,
    minimumPayoutRequest,
    PayoutGate,
    type Plan,
    tightestVerifiedCumulativeTrigger,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    accountSnapshotInputSchema,
    AdviceSource,
    assertPlausibleSnapshot,
    type BlockedPayoutReadiness,
    DashboardBalanceConvention,
    type DocumentedPolicySpec,
    type EligiblePayoutReadiness,
    type FirmMinimumAboveRequestNotice,
    firmMinimumNotice,
    fundedCycleSeedFromTracker,
    fundedLiveTriggerFieldsOf,
    ImplausibleSnapshotError,
    LIVE_TRIGGER_NOT_CHECKED,
    liveTriggerCountText,
    LiveTriggerCoverage,
    liveTriggerLimitsFor,
    type NextPayoutProjection,
    type PayoutBlockReason,
    PayoutBlockReasonKind,
    payoutPath,
    type PayoutPathStep,
    PayoutPathStepUnit,
    payoutReadiness,
    PayoutReadinessKind,
    type PayoutWait,
    PayoutWaitBasis,
    type ReconstructedFundedOrEvalAccount,
    type RetainedCushionBasis,
    retainedCushionForStage,
    type RulebookParameters,
    ruleCappedWithdrawable,
    runNextPayoutProjection,
    SizingStage,
    type SnapshotPlausibilityIssue,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    payoutStakeComparison,
    type PayoutStakeComparisonOutcome,
} from '~/lib/prop-calculator/advisor/value';

export const PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT =
    "Live triggers are not checked here: this planner does not know how many payouts your accounts at the firm have been paid, so a payout that moves an account live is not flagged. Compare the firm's live-transition rule with your own payout history before you request.";

const TERMINAL_GATES: ReadonlySet<PayoutGate> = new Set([
    PayoutGate.AccountConcluded,
    PayoutGate.LadderExhausted,
    PayoutGate.LifetimeDollarCapReached,
]);

export enum PayoutPlannerResultKind {
    Blocked = 'blocked',
    Implausible = 'implausible',
    Ready = 'ready',
}

export interface PayoutPlannerAccountInput {
    readonly asOf: string;
    readonly balance: Dollars;
    readonly floorAtLastPayout: Dollars | null;
    readonly lastPayoutOn: null | string;
    readonly payoutsTaken: number;
    readonly peak: Dollars | null;
    readonly plan: Plan;
    readonly qualifyingDaysSinceLastPayout: number;
    readonly requestSize: Dollars;
    readonly rulebook: RulebookParameters;
}

export interface PayoutPlannerBlockedResult {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly blockingGateText: string;
    readonly firmMinimumNotice: FirmMinimumAboveRequestNotice | null;
    readonly kind: PayoutPlannerResultKind.Blocked;
    readonly liveTriggerNote: null | string;
    readonly path: readonly PayoutPathStep[];
    readonly readiness: BlockedPayoutReadiness;
    readonly simStayCeiling: null | SimStayCeiling;
    readonly waitText: string;
}

export interface PayoutPlannerFundedAccount {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly retainedCushion: PayoutPlannerRetainedCushion;
}

export interface PayoutPlannerImplausibleResult {
    readonly issues: readonly SnapshotPlausibilityIssue[];
    readonly kind: PayoutPlannerResultKind.Implausible;
}

export interface PayoutPlannerOutlook {
    readonly projection: NextPayoutProjection;
    readonly stakeComparison: null | PayoutStakeComparisonOutcome;
}

export interface PayoutPlannerOutlookRequest {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly isEligible: boolean;
    readonly spec: DocumentedPolicySpec;
}

export interface PayoutPlannerReadyResult {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly firmMinimumNotice: FirmMinimumAboveRequestNotice | null;
    readonly kind: PayoutPlannerResultKind.Ready;
    readonly liveTriggerNote: null | string;
    readonly netAfterSplit: Dollars;
    readonly path: readonly PayoutPathStep[];
    readonly readiness: EligiblePayoutReadiness;
    readonly retainedCushion: PayoutPlannerRetainedCushion;
    readonly ruleCappedWithdrawable: Dollars;
    readonly simStayCeiling: null | SimStayCeiling;
}

export type PayoutPlannerResult =
    | PayoutPlannerBlockedResult
    | PayoutPlannerImplausibleResult
    | PayoutPlannerReadyResult;

export interface PayoutPlannerRetainedCushion {
    readonly amount: Dollars;
    readonly basis: RetainedCushionBasis;
}

export interface SimStayCeiling {
    readonly cumulativePayoutLimit: Dollars;
    readonly fetchedOn: string;
    readonly sourceUrl: string;
}

export function payoutBlockReasonText(reason: PayoutBlockReason): string {
    switch (reason.kind) {
        case PayoutBlockReasonKind.Gate: {
            return payoutGateText(reason.gate);
        }
        case PayoutBlockReasonKind.PayoutPending: {
            return 'a payout request is already pending';
        }
        case PayoutBlockReasonKind.WouldTriggerLive: {
            return `this payout would trigger a live-account transition (${liveTriggerCountText(reason.trigger)})`;
        }
    }
}

export function payoutFirmMinimumMessage(
    notice: FirmMinimumAboveRequestNotice,
): string {
    return `firm minimum ${money(notice.minimumRequestAmount)} is above your ${money(notice.requestedAmount)} request`;
}

export function payoutGateText(gate: PayoutGate): string {
    switch (gate) {
        case PayoutGate.AccountConcluded: {
            return 'the account has already concluded (the lifetime payout limit is reached)';
        }
        case PayoutGate.BelowFullRequest: {
            return 'the ladder step affords less than the full requested amount';
        }
        case PayoutGate.BelowMinPayoutProfit: {
            return 'the account has not reached the minimum payout profit yet';
        }
        case PayoutGate.BelowMinRequest: {
            return 'the withdrawable amount is below the plan minimum request';
        }
        case PayoutGate.DayGateNotMet: {
            return 'the day gate since the last pass or payout has not been met yet';
        }
        case PayoutGate.EarlyWithdrawalBelowFloor: {
            return 'a one-time early withdrawal would put the balance at or below the floor';
        }
        case PayoutGate.EarlyWithdrawalBelowMinimum: {
            return 'a one-time early withdrawal would be below its own minimum';
        }
        case PayoutGate.FundedConsistency: {
            return 'the funded consistency rule is currently violated';
        }
        case PayoutGate.LadderExhausted: {
            return 'every payout-ladder step has already been used';
        }
        case PayoutGate.LadderStepUnaffordable: {
            return 'the current ladder step cannot afford this request';
        }
        case PayoutGate.LifetimeDollarCapReached: {
            return 'the lifetime payout dollar cap has been reached';
        }
        case PayoutGate.NothingWithdrawable: {
            return 'nothing is withdrawable above the retained cushion';
        }
    }
}

export function payoutPathStepText(step: PayoutPathStep): string {
    const label = payoutGateText(step.gate);
    if (step.satisfied) return `done: ${label}`;
    if (step.remaining === null) return label;
    switch (step.unit) {
        case PayoutPathStepUnit.Count: {
            return `${label}: ${countText(step.remaining, 'more')}`;
        }
        case PayoutPathStepUnit.Days: {
            return `${label}: ${countText(step.remaining, 'day')} left`;
        }
        case PayoutPathStepUnit.Dollars: {
            return `${label}: ${money(step.remaining)} left`;
        }
        case PayoutPathStepUnit.None: {
            return label;
        }
    }
}

export function payoutWaitText(
    wait: null | PayoutWait,
    reason: PayoutBlockReason,
): string {
    const resolved = wait ?? unmeasuredWaitFor(reason);
    if (resolved === null) {
        return 'wait: no further profit or time reaches this payout';
    }
    switch (resolved.basis) {
        case PayoutWaitBasis.CalendarDays: {
            return `wait: ${countText(resolved.daysStillNeeded, 'calendar day')}`;
        }
        case PayoutWaitBasis.NoClosedForm: {
            return 'wait: more profit or time (no closed-form estimate)';
        }
        case PayoutWaitBasis.Profit: {
            return `wait: ${money(resolved.profitStillNeeded)} more profit`;
        }
        case PayoutWaitBasis.QualifyingDays: {
            return `wait: ${countText(resolved.daysStillNeeded, 'qualifying day')}`;
        }
    }
}

export function planPayoutOutlook(
    request: PayoutPlannerOutlookRequest,
): PayoutPlannerOutlook {
    const { account, isEligible, spec } = request;
    if (account.fundedTracker === null) {
        throw new Error(
            'planPayoutOutlook: expected a funded account with a payout tracker',
        );
    }
    const base = toSimInputs(account.plan, spec);
    const projection = runNextPayoutProjection(account.plan, {
        base,
        policy: spec.enginePolicy,
        source: AdviceSource.NextPayoutProjection,
        start: {
            phase: TradingPhase.Funded,
            seed: fundedCycleSeedFromTracker(
                account.plan,
                account.state,
                account.fundedTracker,
            ),
            state: account.state,
        },
    });
    return {
        projection,
        stakeComparison: isEligible
            ? payoutStakeComparison(account, spec)
            : null,
    };
}

export function planPayoutReadiness(
    input: PayoutPlannerAccountInput,
): PayoutPlannerResult {
    let reconstructed: PayoutPlannerFundedAccount;
    try {
        reconstructed = reconstructPayoutPlannerAccount(input);
    } catch (error) {
        if (error instanceof ImplausibleSnapshotError) {
            return {
                issues: error.issues,
                kind: PayoutPlannerResultKind.Implausible,
            };
        }
        throw error;
    }
    const { account, retainedCushion } = reconstructed;
    const fundedTracker = account.fundedTracker;
    if (fundedTracker === null) {
        throw new Error(
            'planPayoutReadiness: expected a funded account with a payout tracker',
        );
    }
    const { state } = account;

    const liveTrigger = liveTriggerLimitsFor(
        findFirm(input.plan.id.firm)?.accountPolicy,
        input.plan,
        null,
    );
    const liveTriggerNote =
        liveTrigger.coverage === LiveTriggerCoverage.NotChecked
            ? PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT
            : null;
    const readiness = payoutReadiness(input.plan, state, fundedTracker, {
        liveTrigger,
        minRetainedCushion: retainedCushion.amount,
        payoutRequestSize: input.requestSize,
        statePendingPayoutsNetted: true,
    });

    const notice = firmMinimumNotice(
        input.requestSize,
        minimumPayoutRequest(input.plan),
    );

    const path = payoutPath(
        state,
        input.plan,
        fundedTracker,
        retainedCushion.amount,
        input.requestSize,
    );

    switch (readiness.kind) {
        case PayoutReadinessKind.Blocked: {
            return {
                account,
                blockingGateText: payoutBlockReasonText(readiness.reason),
                firmMinimumNotice: notice,
                kind: PayoutPlannerResultKind.Blocked,
                liveTriggerNote,
                path,
                readiness,
                simStayCeiling: simStayCeilingOf(input.plan),
                waitText: payoutWaitText(readiness.wait, readiness.reason),
            };
        }
        case PayoutReadinessKind.Eligible: {
            return {
                account,
                firmMinimumNotice: notice,
                kind: PayoutPlannerResultKind.Ready,
                liveTriggerNote,
                netAfterSplit: dollars(readiness.traderReceives),
                path,
                readiness,
                retainedCushion,
                ruleCappedWithdrawable: ruleCappedWithdrawable(
                    input.plan,
                    fundedTracker,
                    state,
                    retainedCushion.amount,
                ),
                simStayCeiling: simStayCeilingOf(input.plan),
            };
        }
    }
}

export function reconstructPayoutPlannerAccount(
    input: PayoutPlannerAccountInput,
): PayoutPlannerFundedAccount {
    const snapshot = accountSnapshotInputSchema.parse(
        payoutPlannerSnapshotOf(input),
    );
    assertPlausibleSnapshot(input.plan, snapshot);

    const account = AccountReconstruction.rebuild(snapshot, input.plan);
    if (
        account.kind !== TradingPhase.Funded ||
        account.fundedTracker === null
    ) {
        throw new Error(
            'reconstructPayoutPlannerAccount: expected a funded account with a payout tracker',
        );
    }

    const retainedCushion = retainedCushionForStage(input.rulebook, {
        ...fundedLiveTriggerFieldsOf(LIVE_TRIGGER_NOT_CHECKED),
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan: input.plan,
        stage: SizingStage.Funded,
        state: account.state,
        tracker: account.fundedTracker,
    });

    return { account, retainedCushion };
}

export function simStayCeilingText(ceiling: SimStayCeiling): string {
    return `This planner's simulations do not apply the verified firm trigger that moves an account live once cumulative payouts reach ${money(ceiling.cumulativePayoutLimit)} (${ceiling.sourceUrl}, fetched ${ceiling.fetchedOn}), so a withdrawal size it favors can cross it. Keep your total paid below it to stay simulated. The firm may count gross payouts rather than what you receive after the split and fees, which would put the ceiling lower in what you receive. This tool cannot subtract your past payouts, so compare the trigger with your own payout history.`;
}

function countText(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function money(amount: number): string {
    return formatGateCurrency(amount);
}

function payoutPlannerSnapshotOf(
    input: PayoutPlannerAccountInput,
): AccountSnapshotInput {
    return {
        asOf: input.asOf,
        balance: input.balance,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        floorAtLastPayout: input.floorAtLastPayout ?? undefined,
        lastPayoutOn: input.lastPayoutOn ?? undefined,
        payoutsTaken: input.payoutsTaken,
        qualifyingDaysSinceLastPayout: input.qualifyingDaysSinceLastPayout,
        stage: SizingStage.Funded,
        ...peakFieldsFor(input.plan, input.peak, input.balance),
    };
}

function peakFieldsFor(
    plan: Plan,
    peak: Dollars | null,
    balance: Dollars,
): Pick<AccountSnapshotInput, 'highestEodBalance' | 'highestIntradayBalance'> {
    const effectivePeak = peak ?? balance;
    switch (plan.fundedDrawdown.kind) {
        case DrawdownKind.EodTrailing: {
            return { highestEodBalance: effectivePeak };
        }
        case DrawdownKind.IntradayTrailing: {
            return { highestIntradayBalance: effectivePeak };
        }
        case DrawdownKind.Static: {
            return {};
        }
    }
}

function simStayCeilingOf(plan: Plan): null | SimStayCeiling {
    const triggers = findFirm(plan.id.firm)?.accountPolicy.liveTriggersFor(
        plan,
    );
    const verified =
        triggers === undefined
            ? null
            : tightestVerifiedCumulativeTrigger(triggers);
    return verified === null
        ? null
        : {
              cumulativePayoutLimit: verified.amount,
              fetchedOn: verified.source.fetchedOn,
              sourceUrl: verified.source.url,
          };
}

function unmeasuredWaitFor(reason: PayoutBlockReason): null | PayoutWait {
    switch (reason.kind) {
        case PayoutBlockReasonKind.Gate: {
            return TERMINAL_GATES.has(reason.gate)
                ? null
                : { basis: PayoutWaitBasis.NoClosedForm };
        }
        case PayoutBlockReasonKind.PayoutPending: {
            return { basis: PayoutWaitBasis.NoClosedForm };
        }
        case PayoutBlockReasonKind.WouldTriggerLive: {
            return null;
        }
    }
}
