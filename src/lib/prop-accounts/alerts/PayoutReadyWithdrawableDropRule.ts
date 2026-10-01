import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    fundedRetainedCushionDollarsOf,
    fundedWithdrawableDollarsOf,
} from '~/lib/prop-accounts/metrics';
import { CENTS_PER_DOLLAR, TradingPhase } from '~/lib/prop-calculator';
import {
    payoutReadiness,
    PayoutReadinessKind,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

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
            !wasPayoutEligible(context, previous)
        ) {
            return null;
        }
        const previousWithdrawable = fundedWithdrawableDollarsOf(
            context.rulebook,
            previous,
        );
        if (previousWithdrawable <= 0) return null;
        const latestWithdrawable = fundedWithdrawableDollarsOf(
            context.rulebook,
            latest,
        );
        const drop =
            (previousWithdrawable - latestWithdrawable) / previousWithdrawable;
        return drop <= lossFraction
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Critical,
                  `The withdrawable amount fell from ${formatUsdCents(usdCentsFromDollars(previousWithdrawable))} to ${formatUsdCents(usdCentsFromDollars(latestWithdrawable))} since the account was last payout-ready`,
              );
    }
}

function wasPayoutEligible(
    context: AlertContext,
    account: ReconstructedFundedOrEvalAccount,
): boolean {
    if (account.fundedTracker === null) return false;
    const minRetainedCushion = fundedRetainedCushionDollarsOf(
        context.rulebook,
        account,
    );
    const rawRequest = context.rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const readiness = payoutReadiness(
        account.plan,
        account.state,
        account.fundedTracker,
        {
            minRetainedCushion,
            payoutRequestSize: rawRequest,
            statePendingPayoutsNetted: true,
        },
    );
    return readiness.kind === PayoutReadinessKind.Eligible;
}
