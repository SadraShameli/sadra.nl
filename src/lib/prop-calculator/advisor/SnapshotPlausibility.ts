import { formatGateCurrency } from '~/lib/format';
import {
    dollars,
    type Dollars,
    DrawdownKind,
    type DrawdownStrategy,
    fundedResetsBeforeFirstPayout,
    isAtOrBelowWithinCentTolerance,
    type LivePlan,
    ONE_CENT,
    PayoutFloorEffect,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    LiveApplicabilityKind,
    type LivePlanApplicability,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';

import { type AccountSnapshotInput } from './AccountSnapshotInput';
import {
    DashboardBalanceConvention,
    nominalBalanceOf,
} from './DashboardBalanceConvention';
import { SizingStage } from './SizingStage';
import { SnapshotInputField } from './SnapshotInputField';

export enum SnapshotIssueSeverity {
    Impossible = 'impossible',
    Unlikely = 'unlikely',
}

export enum SnapshotPlausibilityIssueKind {
    BalanceFarAboveAccountSize = 'balance-far-above-account-size',
    BalanceLooksNominal = 'balance-looks-nominal',
    BalanceLooksZeroBased = 'balance-looks-zero-based',
    CushionAboveDrawdown = 'cushion-above-drawdown',
    FloorAtOrAboveBalance = 'floor-at-or-above-balance',
    FloorBelowStartingFloor = 'floor-below-starting-floor',
    FundedResetsAboveAllowed = 'funded-resets-above-allowed',
    HighestEodBelowBalance = 'highest-eod-below-balance',
    HighestIntradayBelowClose = 'highest-intraday-below-close',
    LiveStartOutsideDocumented = 'live-start-outside-documented',
}

export type SnapshotDraftFields = Partial<
    Omit<AccountSnapshotInput, 'asOf' | 'dashboardConvention' | 'stage'>
>;

export interface SnapshotPlausibilityIssue {
    readonly field: SnapshotInputField;
    readonly kind: SnapshotPlausibilityIssueKind;
    readonly message: string;
    readonly severity: SnapshotIssueSeverity;
}

type BalanceField =
    | SnapshotInputField.Balance
    | SnapshotInputField.BalanceAtLastPayout
    | SnapshotInputField.HighestEodBalance
    | SnapshotInputField.HighestIntradayBalance;

interface DraftContext {
    readonly accountSize: Dollars;
    readonly convention: DashboardBalanceConvention;
    readonly fields: SnapshotDraftFields;
    readonly plan: Plan;
    readonly stage: SizingStage;
}

type FloorField =
    SnapshotInputField.DashboardFloor | SnapshotInputField.FloorAtLastPayout;

interface FloorPair {
    readonly balance: Dollars | undefined;
    readonly balanceField: BalanceField;
    readonly floor: Dollars | undefined;
    readonly floorField: FloorField;
}

interface TrailingCheck {
    readonly drawdown: DrawdownStrategy;
    readonly payoutFloorEffect: PayoutFloorEffect;
    readonly peakProfitOf: (peak: Dollars) => null | number;
}

const BALANCE_FIELDS: readonly BalanceField[] = [
    SnapshotInputField.Balance,
    SnapshotInputField.BalanceAtLastPayout,
    SnapshotInputField.HighestEodBalance,
    SnapshotInputField.HighestIntradayBalance,
];

const FIELD_LABELS: Readonly<Record<BalanceField | FloorField, string>> = {
    [SnapshotInputField.Balance]: 'balance',
    [SnapshotInputField.BalanceAtLastPayout]: 'balance at the last payout',
    [SnapshotInputField.DashboardFloor]: 'dashboard floor',
    [SnapshotInputField.FloorAtLastPayout]: 'floor at the last payout',
    [SnapshotInputField.HighestEodBalance]: 'highest end-of-day balance',
    [SnapshotInputField.HighestIntradayBalance]: 'highest intraday balance',
};

const CLOSE_DEFINITION =
    'The snapshot balance is the end-of-day close of the snapshot date.';

export class ImplausibleSnapshotError extends Error {
    constructor(readonly issues: readonly SnapshotPlausibilityIssue[]) {
        super(
            `Implausible account snapshot: ${issues
                .map((issue) => `${issue.field}: ${issue.message}`)
                .join(' ')}`,
        );
        this.name = 'ImplausibleSnapshotError';
    }
}

export function assertPlausibleSnapshot(
    plan: Plan,
    input: AccountSnapshotInput,
    acknowledgedUnlikely: readonly SnapshotPlausibilityIssueKind[] = [],
): readonly SnapshotPlausibilityIssue[] {
    const issues = snapshotInputIssues(plan, input);
    const blocking = issues.filter(
        (issue) => !isAcknowledged(issue, acknowledgedUnlikely),
    );
    if (blocking.length > 0) throw new ImplausibleSnapshotError(blocking);
    return issues;
}

export function snapshotDraftIssues(
    plan: Plan,
    stage: SizingStage,
    dashboardConvention: DashboardBalanceConvention,
    accountSize: Dollars,
    fields: SnapshotDraftFields,
): readonly SnapshotPlausibilityIssue[] {
    const context: DraftContext = {
        accountSize,
        convention: dashboardConvention,
        fields,
        plan,
        stage,
    };
    return [
        ...balanceRangeIssues(context),
        ...floorIssues(context),
        ...peakIssues(fields),
        ...cushionIssues(context),
        ...fundedResetIssues(plan, fields),
        ...liveStartIssues(context),
    ];
}

export function snapshotInputIssues(
    plan: Plan,
    input: AccountSnapshotInput,
): readonly SnapshotPlausibilityIssue[] {
    return snapshotDraftIssues(
        plan,
        input.stage,
        input.dashboardConvention,
        plan.accountSize,
        input,
    );
}

function accountNoun(phase: TradingPhase): string {
    switch (phase) {
        case TradingPhase.Eval: {
            return 'an evaluation account';
        }
        case TradingPhase.Funded: {
            return 'a funded account';
        }
    }
}

function balanceCeilingProfit(
    context: DraftContext,
    phase: TradingPhase,
): number {
    switch (phase) {
        case TradingPhase.Eval: {
            return (
                context.plan.profitTarget +
                context.plan.drawdownFor(TradingPhase.Eval).amount
            );
        }
        case TradingPhase.Funded: {
            return context.accountSize;
        }
    }
}

function balanceRangeIssue(
    context: DraftContext,
    phase: TradingPhase,
    field: BalanceField,
    amount: Dollars,
): null | SnapshotPlausibilityIssue {
    return (
        conventionIssue(context, phase, field, amount) ??
        ceilingIssue(context, phase, field, amount)
    );
}

function balanceRangeIssues(
    context: DraftContext,
): readonly SnapshotPlausibilityIssue[] {
    const phase = stagePhase(context.stage);
    if (phase === null) return [];
    return BALANCE_FIELDS.flatMap((field) => {
        const amount = context.fields[field];
        if (amount === undefined) return [];
        const issue = balanceRangeIssue(context, phase, field, amount);
        return issue === null ? [] : [issue];
    });
}

function canHaveLockedOnPayout(
    effect: PayoutFloorEffect,
    payoutsTaken: number | undefined,
): boolean {
    return (
        effect !== PayoutFloorEffect.None &&
        (payoutsTaken === undefined || payoutsTaken > 0)
    );
}

function ceilingIssue(
    context: DraftContext,
    phase: TradingPhase,
    field: BalanceField,
    amount: Dollars,
): null | SnapshotPlausibilityIssue {
    const { accountSize, convention } = context;
    const nominal = nominalBalanceOf(amount, convention, accountSize);
    const ceilingProfit = balanceCeilingProfit(context, phase);
    if (
        isAtOrBelowWithinCentTolerance(
            nominal,
            accountSize + ceilingProfit + ONE_CENT,
        )
    )
        return null;
    return {
        field,
        kind: SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
        message: `A ${FIELD_LABELS[field]} of ${enteredAmountText(context, amount)} is ${money(nominal - accountSize)} above the ${money(accountSize)} account size, more than the ${money(ceilingProfit)} ${accountNoun(phase)} plausibly gains. Check the account size and the amount.`,
        severity: SnapshotIssueSeverity.Unlikely,
    };
}

function conventionIssue(
    context: DraftContext,
    phase: TradingPhase,
    field: BalanceField,
    amount: Dollars,
): null | SnapshotPlausibilityIssue {
    const { accountSize, convention, plan } = context;
    const startingFloor = plan.drawdownFor(phase).initialThreshold(accountSize);
    const isAtOrBelowStartingFloor = isAtOrBelowWithinCentTolerance(
        amount,
        startingFloor,
    );
    const label = FIELD_LABELS[field];
    switch (convention) {
        case DashboardBalanceConvention.Nominal: {
            return isAtOrBelowStartingFloor
                ? {
                      field,
                      kind: SnapshotPlausibilityIssueKind.BalanceLooksZeroBased,
                      message: `A ${label} of ${money(amount)} is at or below the ${money(startingFloor)} starting floor of a ${money(accountSize)} account, so the account would already be breached. If the firm dashboard shows profit from $0, set the dashboard convention to $0-based.`,
                      severity: SnapshotIssueSeverity.Unlikely,
                  }
                : null;
        }
        case DashboardBalanceConvention.ZeroBased: {
            return isAtOrBelowStartingFloor
                ? null
                : {
                      field,
                      kind: SnapshotPlausibilityIssueKind.BalanceLooksNominal,
                      message: `A $0-based ${label} of ${money(amount)} would put this ${money(accountSize)} account at ${money(nominalBalanceOf(amount, convention, accountSize))}. If the firm dashboard shows the full account balance, set the dashboard convention to nominal.`,
                      severity: SnapshotIssueSeverity.Unlikely,
                  };
        }
    }
}

function countText(count: number): string {
    return `${count} funded reset${count === 1 ? '' : 's'}`;
}

function cushionIssues(
    context: DraftContext,
): readonly SnapshotPlausibilityIssue[] {
    const { balance, dashboardFloor } = context.fields;
    if (balance === undefined || dashboardFloor === undefined) return [];
    const check = trailingCheck(context);
    if (check === null || !isCertainlyBeforeLock(context, check)) return [];
    const { drawdown } = check;
    const cushion = balance - dashboardFloor;
    if (isAtOrBelowWithinCentTolerance(cushion, drawdown.amount + ONE_CENT))
        return [];
    const closeNote =
        drawdown.kind === DrawdownKind.EodTrailing
            ? ` ${CLOSE_DEFINITION}`
            : '';
    return [
        {
            field: SnapshotInputField.DashboardFloor,
            kind: SnapshotPlausibilityIssueKind.CushionAboveDrawdown,
            message: `A dashboard floor of ${money(dashboardFloor)} leaves ${money(cushion)} of cushion under the ${money(balance)} balance, more than the ${money(drawdown.amount)} trailing drawdown allows before it locks.${closeNote}`,
            severity: SnapshotIssueSeverity.Impossible,
        },
    ];
}

function enteredAmountText(context: DraftContext, amount: Dollars): string {
    switch (context.convention) {
        case DashboardBalanceConvention.Nominal: {
            return money(amount);
        }
        case DashboardBalanceConvention.ZeroBased: {
            return `${money(amount)} ($0-based, ${money(nominalBalanceOf(amount, context.convention, context.accountSize))} in full)`;
        }
    }
}

function floorAboveBalanceIssue(
    pair: FloorPair,
): null | SnapshotPlausibilityIssue {
    const { balance, balanceField, floor, floorField } = pair;
    if (
        balance === undefined ||
        floor === undefined ||
        !isAtOrBelowWithinCentTolerance(balance, floor)
    )
        return null;
    return {
        field: floorField,
        kind: SnapshotPlausibilityIssueKind.FloorAtOrAboveBalance,
        message: `A ${FIELD_LABELS[floorField]} of ${money(floor)} is at or above the ${money(balance)} ${FIELD_LABELS[balanceField]}, so the account would already be breached.`,
        severity: SnapshotIssueSeverity.Impossible,
    };
}

function floorBelowStartIssue(
    context: DraftContext,
    phase: TradingPhase,
    floorField: FloorField,
    floor: Dollars | undefined,
): null | SnapshotPlausibilityIssue {
    if (floor === undefined) return null;
    const { accountSize, convention, plan } = context;
    const startingFloor = plan.drawdownFor(phase).initialThreshold(accountSize);
    const nominalFloor = nominalBalanceOf(floor, convention, accountSize);
    if (isAtOrBelowWithinCentTolerance(startingFloor, nominalFloor + ONE_CENT))
        return null;
    return {
        field: floorField,
        kind: SnapshotPlausibilityIssueKind.FloorBelowStartingFloor,
        message: `A ${FIELD_LABELS[floorField]} of ${enteredAmountText(context, floor)} is below the ${money(startingFloor)} starting floor of a ${money(accountSize)} account, but a floor never drops below where it starts. Check the amount and the dashboard convention.`,
        severity: SnapshotIssueSeverity.Impossible,
    };
}

function floorIssues(
    context: DraftContext,
): readonly SnapshotPlausibilityIssue[] {
    const { fields } = context;
    const phase = stagePhase(context.stage);
    const pairs: readonly FloorPair[] = [
        {
            balance: fields.balance,
            balanceField: SnapshotInputField.Balance,
            floor: fields.dashboardFloor,
            floorField: SnapshotInputField.DashboardFloor,
        },
        {
            balance: fields.balanceAtLastPayout,
            balanceField: SnapshotInputField.BalanceAtLastPayout,
            floor: fields.floorAtLastPayout,
            floorField: SnapshotInputField.FloorAtLastPayout,
        },
    ];
    return pairs.flatMap((pair) => {
        const issue =
            (phase === null
                ? null
                : floorBelowStartIssue(
                      context,
                      phase,
                      pair.floorField,
                      pair.floor,
                  )) ?? floorAboveBalanceIssue(pair);
        return issue === null ? [] : [issue];
    });
}

function fundedResetIssues(
    plan: Plan,
    fields: SnapshotDraftFields,
): readonly SnapshotPlausibilityIssue[] {
    const used = fields.fundedResetsUsed;
    if (used === undefined) return [];
    const allowed = fundedResetsBeforeFirstPayout(plan);
    if (used <= allowed) return [];
    return [
        {
            field: SnapshotInputField.FundedResetsUsed,
            kind: SnapshotPlausibilityIssueKind.FundedResetsAboveAllowed,
            message: fundedResetMessage(plan, used, allowed),
            severity: SnapshotIssueSeverity.Impossible,
        },
    ];
}

function fundedResetMessage(plan: Plan, used: number, allowed: number): string {
    const usedText = countText(used);
    if (plan.fundedReset === null) {
        return `${plan.label} offers no funded reset, so ${usedText} cannot have been used.`;
    }
    return plan.takesFundedReset
        ? `${plan.label} allows at most ${countText(allowed)} before the first payout, not ${used}.`
        : `This account did not take the ${plan.fundedReset.label} option, so ${usedText} cannot have been used.`;
}

function isAcknowledged(
    issue: SnapshotPlausibilityIssue,
    acknowledgedUnlikely: readonly SnapshotPlausibilityIssueKind[],
): boolean {
    switch (issue.severity) {
        case SnapshotIssueSeverity.Impossible: {
            return false;
        }
        case SnapshotIssueSeverity.Unlikely: {
            return acknowledgedUnlikely.includes(issue.kind);
        }
    }
}

function isCertainlyBeforeLock(
    context: DraftContext,
    check: TrailingCheck,
): boolean {
    const { fields } = context;
    const { drawdown, payoutFloorEffect } = check;
    const canHaveLocked = canHaveLockedOnPayout(
        payoutFloorEffect,
        fields.payoutsTaken,
    );
    switch (drawdown.kind) {
        case DrawdownKind.EodTrailing: {
            return (
                !canHaveLocked &&
                isPeakBelowLockTrigger(check, fields.highestEodBalance)
            );
        }
        case DrawdownKind.IntradayTrailing: {
            return (
                !canHaveLocked &&
                isPeakBelowLockTrigger(check, fields.highestIntradayBalance)
            );
        }
        case DrawdownKind.Static: {
            return false;
        }
    }
}

function isPeakBelowLockTrigger(
    check: TrailingCheck,
    peak: Dollars | undefined,
): boolean {
    const trigger = check.drawdown.lock?.atProfit ?? null;
    if (trigger === null) return true;
    if (peak === undefined) return false;
    const peakProfit = check.peakProfitOf(peak);
    return peakProfit !== null && peakProfit < trigger;
}

function liveStartIssues(
    context: DraftContext,
): readonly SnapshotPlausibilityIssue[] {
    const { accountSize, fields, plan, stage } = context;
    const liveStart = fields.liveStartBalance;
    if (liveStart === undefined || stage !== SizingStage.Live) return [];
    const applicability = livePlanApplicability(plan.id);
    if (applicability.kind !== LiveApplicabilityKind.Builder) return [];
    const range = applicability.documentedStart?.(accountSize) ?? null;
    if (range === null) return [];
    if (
        isAtOrBelowWithinCentTolerance(range.lowest, liveStart + ONE_CENT) &&
        isAtOrBelowWithinCentTolerance(liveStart, range.highest + ONE_CENT)
    )
        return [];
    const documented =
        range.lowest === range.highest
            ? money(range.lowest)
            : `between ${money(range.lowest)} and ${money(range.highest)}`;
    return [
        {
            field: SnapshotInputField.LiveStartBalance,
            kind: SnapshotPlausibilityIssueKind.LiveStartOutsideDocumented,
            message: `A live account after ${plan.label} starts at ${documented}, not ${money(liveStart)}.`,
            severity: SnapshotIssueSeverity.Impossible,
        },
    ];
}

function modeledLivePlan(
    applicability: LivePlanApplicability,
): LivePlan | null {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            return applicability.builder(applicability.defaultCushionPercent);
        }
        case LiveApplicabilityKind.NotModeled: {
            return null;
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.transitionBuilder(
                applicability.defaultCushionPercent,
                dollars(0),
            );
        }
    }
}

function money(amount: number): string {
    return formatGateCurrency(amount);
}

function peakIssues(
    fields: SnapshotDraftFields,
): readonly SnapshotPlausibilityIssue[] {
    const { balance, highestEodBalance, highestIntradayBalance } = fields;
    const issues: SnapshotPlausibilityIssue[] = [];
    if (
        balance !== undefined &&
        highestEodBalance !== undefined &&
        !isAtOrBelowWithinCentTolerance(balance, highestEodBalance + ONE_CENT)
    ) {
        issues.push({
            field: SnapshotInputField.HighestEodBalance,
            kind: SnapshotPlausibilityIssueKind.HighestEodBelowBalance,
            message: `The highest end-of-day balance of ${money(highestEodBalance)} is below the ${money(balance)} balance. ${CLOSE_DEFINITION} No close can be above the highest close, so enter the balance at the close, not a reading taken during the session.`,
            severity: SnapshotIssueSeverity.Impossible,
        });
    }
    const highestClose = Math.max(
        balance ?? -Infinity,
        highestEodBalance ?? -Infinity,
    );
    if (
        highestIntradayBalance !== undefined &&
        Number.isFinite(highestClose) &&
        !isAtOrBelowWithinCentTolerance(
            highestClose,
            highestIntradayBalance + ONE_CENT,
        )
    ) {
        issues.push({
            field: SnapshotInputField.HighestIntradayBalance,
            kind: SnapshotPlausibilityIssueKind.HighestIntradayBelowClose,
            message: `The highest intraday balance of ${money(highestIntradayBalance)} is below ${money(highestClose)}, a balance the account already reached, but the intraday high includes every close.`,
            severity: SnapshotIssueSeverity.Impossible,
        });
    }
    return issues;
}

function stagePhase(stage: SizingStage): null | TradingPhase {
    switch (stage) {
        case SizingStage.Eval: {
            return TradingPhase.Eval;
        }
        case SizingStage.Funded: {
            return TradingPhase.Funded;
        }
        case SizingStage.Live: {
            return null;
        }
    }
}

function trailingCheck(context: DraftContext): null | TrailingCheck {
    const { accountSize, convention, fields, plan } = context;
    const phase = stagePhase(context.stage);
    if (phase !== null) {
        return {
            drawdown: plan.drawdownFor(phase),
            payoutFloorEffect:
                phase === TradingPhase.Funded
                    ? plan.payoutFloorEffect
                    : PayoutFloorEffect.None,
            peakProfitOf: (peak) =>
                nominalBalanceOf(peak, convention, accountSize) - accountSize,
        };
    }
    const livePlan = modeledLivePlan(livePlanApplicability(plan.id));
    const drawdown = livePlan?.liveDrawdown ?? null;
    if (livePlan === null || drawdown === null) return null;
    const liveStart = fields.liveStartBalance;
    return {
        drawdown,
        payoutFloorEffect: livePlan.payoutFloorEffect,
        peakProfitOf: (peak) =>
            liveStart === undefined ? null : peak - liveStart,
    };
}
