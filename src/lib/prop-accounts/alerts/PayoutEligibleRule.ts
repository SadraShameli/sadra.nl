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

import { formatUsdCents, usdCentsFromDollars } from '../core';
import { AccountStateKind, fundedPayoutRuleContextOf } from '../metrics';
import { type AccountAlert } from './AccountAlert';
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
        const liveTriggerNote =
            ruleContext.stage === SizingStage.Live
                ? '; the live trigger count since the last live account is not checked here'
                : '';
        return this.alertFor(
            monitored,
            AlertSeverity.Info,
            `Eligible to request ${formatUsdCents(usdCentsFromDollars(decision.requestAmount))}${liveTriggerNote}`,
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
