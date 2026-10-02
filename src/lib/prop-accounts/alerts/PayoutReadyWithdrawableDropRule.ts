import {
    AccountEventKind,
    compareText,
    formatUsdCents,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    fundedRetainedCushionDollarsOf,
    fundedWithdrawableDollarsOf,
    fundedWithdrawableLossCents,
    fundedWithdrawableLostToResetCents,
    grossStateOf,
    PerformanceComparabilityKind,
    PerformanceIncomparabilityReason,
    performanceSinceSnapshot,
} from '~/lib/prop-accounts/metrics';
import { CENTS_PER_DOLLAR, TradingPhase } from '~/lib/prop-calculator';
import {
    payoutReadiness,
    PayoutReadinessKind,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    liveTriggerLimitsIn,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

interface WithdrawableLoss {
    readonly isReset: boolean;
    readonly lostCents: UsdCents;
    readonly paidCents: UsdCents;
}

interface WithdrawableLossInputs {
    readonly latest: ReconstructedFundedOrEvalAccount;
    readonly latestAsOf: string;
    readonly latestCents: UsdCents;
    readonly monitored: MonitoredAccount;
    readonly previous: ReconstructedFundedOrEvalAccount;
    readonly previousAsOf: string;
    readonly previousCents: UsdCents;
    readonly rulebook: RulebookParameters;
}

export class PayoutReadyWithdrawableDropRule extends AccountAlertRule {
    readonly kind = AlertKind.PayoutReadyWithdrawableDrop;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        const lossFraction = context.rulebook.alerts.payoutReadyLossFraction;
        const state = monitored.accountState;
        if (
            lossFraction === null ||
            !isActive(monitored) ||
            state?.kind !== AccountStateKind.Reconstructed ||
            state.previous === null
        ) {
            return null;
        }
        const previous = state.previous.reconstructed;
        const latest = state.latest.reconstructed;
        if (
            previous.kind !== TradingPhase.Funded ||
            latest.kind !== TradingPhase.Funded ||
            !wasPayoutEligible(
                context,
                monitored,
                previous,
                state.previous.asOf,
            )
        ) {
            return null;
        }
        const previousCents = usdCentsFromDollars(
            fundedWithdrawableDollarsOf(context.rulebook, previous),
        );
        if (previousCents <= 0) return null;
        const latestCents = usdCentsFromDollars(
            fundedWithdrawableDollarsOf(context.rulebook, latest),
        );
        const loss = lossBetween({
            latest,
            latestAsOf: state.latest.asOf,
            latestCents,
            monitored,
            previous,
            previousAsOf: state.previous.asOf,
            previousCents,
            rulebook: context.rulebook,
        });
        if (loss === null || loss.lostCents / previousCents <= lossFraction) {
            return null;
        }
        const afterPayout =
            loss.paidCents > 0
                ? ` after the ${formatUsdCents(loss.paidCents)} paid out in between`
                : '';
        return this.alertFor(
            monitored,
            AlertSeverity.Critical,
            loss.isReset
                ? `The account was reset after it was payout-ready, so ${formatUsdCents(loss.lostCents)} of the ${formatUsdCents(previousCents)} withdrawable was lost${afterPayout}`
                : `The withdrawable amount fell from ${formatUsdCents(previousCents)} to ${formatUsdCents(latestCents)} since the account was last payout-ready${loss.paidCents > 0 ? `, ${formatUsdCents(loss.lostCents)} of it lost trading${afterPayout}` : ''}`,
        );
    }
}

function firstResetBetween(inputs: WithdrawableLossInputs): null | string {
    const resetDates = inputs.monitored.events
        .filter(
            (event) =>
                event.kind === AccountEventKind.FundedReset &&
                compareText(event.occurredOn, inputs.previousAsOf) > 0 &&
                compareText(event.occurredOn, inputs.latestAsOf) <= 0,
        )
        .map((event) => event.occurredOn)
        .toSorted(compareText);
    return resetDates[0] ?? null;
}

function lossAcrossIncomparable(
    reason: PerformanceIncomparabilityReason,
    inputs: WithdrawableLossInputs,
): null | WithdrawableLoss {
    switch (reason) {
        case PerformanceIncomparabilityReason.FundedReset: {
            const paidCents = paidGrossBeforeReset(inputs);
            return {
                isReset: true,
                lostCents: fundedWithdrawableLostToResetCents({
                    payoutsPaidGrossCents: paidCents,
                    previous: inputs.previous,
                    rulebook: inputs.rulebook,
                }),
                paidCents,
            };
        }
        case PerformanceIncomparabilityReason.LiveNotModeled:
        case PerformanceIncomparabilityReason.NoPreviousSnapshot:
        case PerformanceIncomparabilityReason.StageChange: {
            return null;
        }
    }
}

function lossBetween(inputs: WithdrawableLossInputs): null | WithdrawableLoss {
    const { latest, latestAsOf, monitored, previous, previousAsOf } = inputs;
    const performance = performanceSinceSnapshot(
        latest,
        latestAsOf,
        previous,
        previousAsOf,
        monitored.events,
        monitored.payouts,
    );
    if (performance.kind === PerformanceComparabilityKind.NotComparable) {
        return lossAcrossIncomparable(performance.reason, inputs);
    }
    const paidCents = usdCentsFromDollars(performance.payoutsPaidGross);
    return {
        isReset: false,
        lostCents: fundedWithdrawableLossCents({
            latestWithdrawableCents: inputs.latestCents,
            payoutsPaidGrossCents: paidCents,
            previous: inputs.previous,
            profitSinceSnapshotDollars: performance.profitSinceSnapshot,
            rulebook: inputs.rulebook,
        }),
        paidCents,
    };
}

function paidGrossBeforeReset(inputs: WithdrawableLossInputs): UsdCents {
    const withoutResetGate = performanceSinceSnapshot(
        inputs.latest,
        firstResetBetween(inputs) ?? inputs.latestAsOf,
        inputs.previous,
        inputs.previousAsOf,
        [],
        inputs.monitored.payouts,
    );
    return withoutResetGate.kind === PerformanceComparabilityKind.Comparable
        ? usdCentsFromDollars(withoutResetGate.payoutsPaidGross)
        : usdCents(0);
}

function wasPayoutEligible(
    context: AlertContext,
    monitored: MonitoredAccount,
    account: ReconstructedFundedOrEvalAccount,
    asOf: string,
): boolean {
    if (account.fundedTracker === null) return false;
    const minRetainedCushion = fundedRetainedCushionDollarsOf(
        context.rulebook,
        account,
    );
    const rawRequest = context.rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const pendingPayouts = account.pendingPayouts ?? 0;
    const readiness = payoutReadiness(
        account.plan,
        grossStateOf(account.state, pendingPayouts),
        account.fundedTracker,
        {
            liveTrigger: liveTriggerLimitsIn(
                context,
                monitored,
                account.plan,
                asOf,
            ),
            minRetainedCushion,
            payoutRequestSize: rawRequest,
            pendingPayouts,
            statePendingPayoutsNetted: false,
        },
    );
    return readiness.kind === PayoutReadinessKind.Eligible;
}
