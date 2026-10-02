import { accountSubstateOf } from '~/lib/prop-accounts/advice';
import {
    compareText,
    formatUsdCents,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import { TradingPhase } from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    NextTradeRiskVerdict,
} from '~/lib/prop-calculator/advisor';
import { dayProgressFromCounts } from '~/lib/prop-calculator/advisor/actions';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    type AlertDecisionRow,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class PayoutReadyOpenRiskRule extends AccountAlertRule {
    readonly kind = AlertKind.PayoutReadyOpenRisk;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        const thresholdCents =
            context.rulebook.alerts.payoutReadyRiskAboveRungCents;
        const state = monitored.accountState;
        if (
            thresholdCents === null ||
            !isActive(monitored) ||
            state?.kind !== AccountStateKind.Reconstructed ||
            state.latest.reconstructed.kind !== TradingPhase.Funded
        ) {
            return null;
        }
        const [row] = payoutReadinessBoardOf(context.rulebook, [
            { accountId: monitored.account.id, state },
        ]).rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) return null;
        const decision = latestDecisionOf(context, monitored.account.id);
        if (decision === null) return null;
        const riskCents =
            decision.actualRiskCents ?? decision.acceptedRiskCents;
        const advisor = createSizingAdvisor(state.latest.reconstructed, {
            rulebook: context.rulebook,
            snapshotAsOf: state.latest.asOf,
            substate: accountSubstateOf(monitored.account.status),
            today: context.today,
        });
        const check = advisor.checkNextTradeRisk(
            usdCentsToDollars(riskCents),
            dayProgressFromCounts(advisor, 0, 0),
        );
        if (
            check?.verdict !== NextTradeRiskVerdict.AboveDocumented ||
            check.excessCents <= thresholdCents
        ) {
            return null;
        }
        const basis =
            decision.actualRiskCents === null ? 'accepted' : 'recorded';
        const excess = formatUsdCents(usdCents(check.excessCents));
        const rung =
            check.documentedRung === null
                ? ' (the documented plan has stopped for the day)'
                : ` of ${formatUsdCents(usdCentsFromDollars(check.documentedRung))}`;
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `A payout is available on this account and the ${basis} risk of ${formatUsdCents(riskCents)} is ${excess} above the documented rung${rung}; requesting the payout leaves the documented rung unchanged`,
        );
    }
}

function isNewerDecision(
    candidate: AlertDecisionRow,
    current: AlertDecisionRow,
): boolean {
    const byCreation =
        candidate.createdAt.getTime() - current.createdAt.getTime();
    return (byCreation === 0 ? compareText(candidate.id, current.id) : byCreation) > 0;
}

function latestDecisionOf(
    context: AlertContext,
    accountId: string,
): AlertDecisionRow | null {
    return context.decisions
        .filter(
            (decision) =>
                decision.accountId === accountId &&
                decision.decidedOn === context.today,
        )
        .reduce<AlertDecisionRow | null>(
            (newest, decision) =>
                newest === null || isNewerDecision(decision, newest)
                    ? decision
                    : newest,
            null,
        );
}
