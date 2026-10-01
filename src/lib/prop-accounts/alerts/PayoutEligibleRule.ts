import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import { AccountStateKind, fundedPayoutRuleContextOf } from '~/lib/prop-accounts/metrics';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    type FundedPayoutRuleContext,
    type LivePayoutRuleContext,
    PayoutRequestDecisionKind,
    PayoutRequestRule,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { type AccountAlert, AlertDisclosure } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
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
        const ruleContext = payoutRuleContextOf(state.latest.reconstructed);
        if (ruleContext === null) return null;
        const decision = new PayoutRequestRule(context.rulebook).decide(
            ruleContext,
        );
        if (decision.kind !== PayoutRequestDecisionKind.Request) return null;
        const disclosures =
            ruleContext.stage === SizingStage.Live
                ? [AlertDisclosure.LiveTriggersNotChecked]
                : [];
        const amount = formatUsdCents(
            usdCentsFromDollars(decision.requestAmount),
        );
        const noticeText =
            decision.notice === null
                ? ''
                : ` (the firm's minimum payout request; your target of ${formatUsdCents(usdCentsFromDollars(decision.notice.requestedAmount))} is below it)`;
        return this.alertFor(
            monitored,
            AlertSeverity.Info,
            `Eligible to request ${amount}${noticeText}`,
            disclosures,
        );
    }
}

function payoutRuleContextOf(
    account: ReconstructedAccount,
): FundedPayoutRuleContext | LivePayoutRuleContext | null {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            if (account.livePlan === null || account.state === null) {
                return null;
            }
            return {
                livePlan: account.livePlan,
                paidPayoutsSinceLastLiveAccount: null,
                personalRequestOverride: null,
                personalRetainedCushion: null,
                stage: SizingStage.Live,
                state: account.state,
            };
        }
        case TradingPhase.Eval: {
            return null;
        }
        case TradingPhase.Funded: {
            return account.fundedTracker === null
                ? null
                : fundedPayoutRuleContextOf(
                      account.plan,
                      account.state,
                      account.fundedTracker,
                      null,
                  );
        }
    }
}
