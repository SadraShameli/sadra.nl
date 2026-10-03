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
import { type Dollars, findFirm, TradingPhase } from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    NextTradeRiskVerdict,
    NO_PERSONAL_CAPS,
    pendingPayoutCountsOf,
    pendingPayoutCountsOr,
    type PersonalCaps,
} from '~/lib/prop-calculator/advisor';
import { dayProgressFromCounts } from '~/lib/prop-calculator/advisor/actions';

import { type AccountAlert } from './AccountAlert';
import {
    type AccountPersonalPolicy,
    type AlertContext,
    type AlertDecisionRow,
    isActive,
    liveTriggerDisclosuresOf,
    type MonitoredAccount,
    paidPayoutsSinceLastLiveAccountIn,
    pendingPayoutCountsIn,
    personalPolicyIn,
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
            state?.kind !== AccountStateKind.Reconstructed
        ) {
            return null;
        }
        const { plan } = state;
        const { reconstructed } = state.latest;
        if (reconstructed.kind !== TradingPhase.Funded) return null;
        const paidPayoutsSinceLastLiveAccount =
            paidPayoutsSinceLastLiveAccountIn(
                context,
                monitored,
                context.today,
            );
        const pendingPayoutCounts = pendingPayoutCountsIn(
            context,
            monitored,
            context.today,
        );
        const policy = personalPolicyIn(context, monitored.account.id);
        const boardCounts = pendingPayoutCountsOr(
            pendingPayoutCounts,
            pendingPayoutCountsOf(reconstructed),
        );
        const [row] = payoutReadinessBoardOf(
            context.rulebook,
            [{ accountId: monitored.account.id, state }],
            new Map([
                [
                    monitored.account.id,
                    {
                        paidPayoutsSinceLastLiveAccount,
                        pendingPayoutCounts: boardCounts,
                        personalRequestOverride: policy.payoutRequestOverride,
                        personalRetainedCushion: policy.retainedCushionRequest,
                    },
                ],
            ]),
        ).rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) return null;
        const decision = latestDecisionOf(context, monitored.account.id);
        if (decision === null) return null;
        const riskCents =
            decision.actualRiskCents ?? decision.acceptedRiskCents;
        const checkWith = (
            personalCaps: PersonalCaps,
            personalDll: Dollars | null,
        ) => {
            const advisor = createSizingAdvisor(state.latest.reconstructed, {
                accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
                paidPayoutsSinceLastLiveAccount,
                personalCaps,
                personalDll,
                personalPayoutOverride: policy.payoutRequestOverride,
                personalRetainedCushion: policy.retainedCushionRequest,
                rulebook: context.rulebook,
                snapshotAsOf: state.latest.asOf,
                substate: accountSubstateOf(monitored.account.status),
                today: context.today,
            });
            return advisor.checkNextTradeRisk(
                usdCentsToDollars(riskCents),
                dayProgressFromCounts(advisor, 0, 0),
            );
        };
        const check = checkWith(policy.personalCaps, policy.personalDll);
        if (
            check?.verdict !== NextTradeRiskVerdict.AboveDocumented ||
            check.excessCents <= thresholdCents
        ) {
            return null;
        }
        const basis =
            decision.actualRiskCents === null ? 'accepted' : 'recorded';
        const excess = formatUsdCents(usdCents(check.excessCents));
        const documentedRung = hasPersonalLimits(policy)
            ? (checkWith(NO_PERSONAL_CAPS, null)?.documentedRung ?? null)
            : check.documentedRung;
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `A payout is available on this account and the ${basis} risk of ${formatUsdCents(riskCents)} is ${excess} above ${rungClauseOf(check.documentedRung, documentedRung)}; requesting the payout leaves the documented rung unchanged`,
            liveTriggerDisclosuresOf(
                row.liveTriggerCoverage,
                pendingPayoutCounts,
            ),
        );
    }
}

function hasPersonalLimits(policy: AccountPersonalPolicy): boolean {
    return (
        policy.personalDll !== null ||
        policy.personalCaps.dailyProfitCap !== null ||
        policy.personalCaps.maxRiskPerTrade !== null ||
        policy.personalCaps.maxTradesPerDay !== null
    );
}

function isNewerDecision(
    candidate: AlertDecisionRow,
    current: AlertDecisionRow,
): boolean {
    const byCreation =
        candidate.createdAt.getTime() - current.createdAt.getTime();
    return (
        (byCreation === 0
            ? compareText(candidate.id, current.id)
            : byCreation) > 0
    );
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

function rungClauseOf(
    appliedRung: Dollars | null,
    documentedRung: Dollars | null,
): string {
    if (appliedRung === documentedRung) {
        return appliedRung === null
            ? 'the documented rung (the documented plan has stopped for the day)'
            : `the documented rung of ${rungText(appliedRung)}`;
    }
    const documented =
        documentedRung === null
            ? 'the documented plan has stopped for the day'
            : `documented rung ${rungText(documentedRung)}`;
    return appliedRung === null
        ? `your personal limits (they stopped the plan for the day; ${documented})`
        : `your personal rung of ${rungText(appliedRung)} (${documented})`;
}

function rungText(rung: Dollars): string {
    return formatUsdCents(usdCentsFromDollars(rung));
}
