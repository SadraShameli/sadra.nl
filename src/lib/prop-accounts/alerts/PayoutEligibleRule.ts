import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import { AccountStateKind } from '~/lib/prop-accounts/metrics';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    type FundedPayoutRuleContext,
    fundedPayoutRuleContextOf,
    type LivePayoutRuleContext,
    liveTriggerBlockReasonFor,
    type LiveTriggerLimits,
    PayoutRequestDecisionKind,
    PayoutRequestRule,
    pendingPayoutCountsOf,
    pendingPayoutCountsOr,
    type PendingPayoutCountsOutcome,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { type AccountAlert, AlertDisclosure } from './AccountAlert';
import {
    type AccountPersonalPolicy,
    type AlertContext,
    isActive,
    liveTriggerDisclosuresOf,
    liveTriggerLimitsIn,
    type MonitoredAccount,
    pendingPayoutCountsIn,
    personalCushionSourceOf,
    personalPolicyIn,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class PayoutEligibleRule extends AccountAlertRule {
    readonly kind = AlertKind.PayoutEligible;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const liveTrigger = liveTriggerLimitsIn(
            context,
            monitored,
            state.plan,
            context.today,
        );
        const counts = pendingPayoutCountsIn(context, monitored, context.today);
        const policy = personalPolicyIn(context, monitored.account.id);
        const ruleContext = payoutRuleContextOf(
            state.latest.reconstructed,
            liveTrigger,
            counts,
            policy,
        );
        if (ruleContext === null) return null;
        const decision = new PayoutRequestRule(context.rulebook).decide(
            ruleContext,
        );
        if (decision.kind !== PayoutRequestDecisionKind.Request) return null;
        const disclosures =
            ruleContext.stage === SizingStage.Live
                ? [AlertDisclosure.LiveTriggersNotChecked]
                : liveTriggerDisclosuresOf(liveTrigger.coverage, counts);
        const amount = formatUsdCents(
            usdCentsFromDollars(decision.requestAmount),
        );
        const qualifiers = [
            ...(decision.notice === null
                ? []
                : [
                      `the firm's minimum payout request; your target of ${formatUsdCents(usdCentsFromDollars(decision.notice.requestedAmount))} is below it`,
                  ]),
            ...(decision.notice === null &&
            policy.payoutRequestOverride !== null
                ? ['your personal payout request']
                : []),
            personalCushionSourceOf({
                amount: decision.retainedCushion,
                basis: decision.retainedCushionBasis,
            }),
        ].filter((qualifier) => qualifier !== null);
        const qualifierText =
            qualifiers.length === 0 ? '' : ` (${qualifiers.join('; ')})`;
        return this.alertFor(
            monitored,
            AlertSeverity.Info,
            `Eligible to request ${amount}${qualifierText}`,
            disclosures,
        );
    }
}

function payoutRuleContextOf(
    account: ReconstructedAccount,
    liveTrigger: LiveTriggerLimits,
    countsOutcome: PendingPayoutCountsOutcome,
    policy: AccountPersonalPolicy,
): FundedPayoutRuleContext | LivePayoutRuleContext | null {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            if (account.livePlan === null || account.state === null) {
                return null;
            }
            return {
                livePlan: account.livePlan,
                paidPayoutsSinceLastLiveAccount:
                    liveTrigger.paidPayoutsSinceLastLiveAccount,
                personalRequestOverride: policy.payoutRequestOverride,
                personalRetainedCushion: policy.retainedCushionRequest,
                stage: SizingStage.Live,
                state: account.state,
            };
        }
        case TradingPhase.Eval: {
            return null;
        }
        case TradingPhase.Funded: {
            if (account.fundedTracker === null) return null;
            const pendingPayouts = account.pendingPayouts ?? 0;
            const counts = pendingPayoutCountsOr(
                countsOutcome,
                pendingPayoutCountsOf(account),
            );
            const isBlockedByLiveTrigger =
                liveTriggerBlockReasonFor(
                    account.fundedTracker.payoutsIssued,
                    liveTrigger,
                    counts.pendingPayoutCount,
                    counts.otherAccountsPendingPayoutCount,
                ) !== null;
            return isBlockedByLiveTrigger
                ? null
                : fundedPayoutRuleContextOf({
                      ...counts,
                      liveTrigger,
                      pendingPayouts,
                      personalRequestOverride: policy.payoutRequestOverride,
                      personalRetainedCushion: policy.retainedCushionRequest,
                      plan: account.plan,
                      state: account.state,
                      tracker: account.fundedTracker,
                  });
        }
    }
}
