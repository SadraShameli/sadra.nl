import { formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    type ConsistencyStatus,
    ConsistencyStatusKind,
    evalConsistencyStatus,
    fundedConsistencyStatus,
} from '~/lib/prop-accounts/metrics';
import {
    CENTS_PER_DOLLAR,
    type ConsistencyRule,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    documentedSizingOf,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
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

type EvaluatedConsistencyStatus = Extract<
    ConsistencyStatus,
    { kind: ConsistencyStatusKind.Evaluated }
>;

export class ConsistencyNearBreachRule extends AccountAlertRule {
    readonly kind = AlertKind.ConsistencyNearBreach;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const { reconstructed } = state.latest;
        const status = consistencyStatusOf(reconstructed);
        if (
            status?.kind !== ConsistencyStatusKind.Evaluated ||
            reconstructed.kind === ReconstructedLiveKind.Live
        )
            return null;
        if (status.isViolated) {
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                violationText(reconstructed.kind, status),
            );
        }
        const documentedWin = documentedWinningDayOf(reconstructed, context);
        if (documentedWin === null) return null;
        const room = status.rule.maxDayProfitBeforeViolation(
            status.totalProfit,
        );
        return room < documentedWin
            ? this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `One documented winning ${reconstructed.kind === TradingPhase.Eval ? 'eval ' : ''}day of ${dollarText(documentedWin)} would break the ${status.rule.shareLabel()} consistency rule (${dollarText(room)} of room left before violation)`,
              )
            : null;
    }
}

function consistencyStatusOf(
    account: ReconstructedAccount,
): ConsistencyStatus | null {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            return null;
        }
        case TradingPhase.Eval: {
            return evalConsistencyStatus(
                account.plan,
                account.state.bestDayProfit,
                account.plan.accountProfit(account.state),
            );
        }
        case TradingPhase.Funded: {
            if (account.fundedTracker === null) return null;
            const tracker = account.fundedTracker;
            const cycleProfit =
                account.state.balance - tracker.lastPayoutBalance;
            return fundedConsistencyStatus(
                account.plan,
                tracker.payoutsIssued,
                tracker.cycleBestDayProfit,
                cycleProfit,
            );
        }
    }
}

function documentedWinningDayOf(
    account: ReconstructedFundedOrEvalAccount,
    context: AlertContext,
): null | number {
    switch (account.kind) {
        case TradingPhase.Eval: {
            const { rewardMultiple, rungs } = documentedSizingOf(
                account,
                context.rulebook,
            ).sizing;
            const [firstRung] = rungs;
            return firstRung === undefined
                ? null
                : firstRung.risk * rewardMultiple;
        }
        case TradingPhase.Funded: {
            return context.rulebook.funded.takeProfitCents / CENTS_PER_DOLLAR;
        }
    }
}

function dollarText(amount: number): string {
    return formatUsdCents(usdCentsFromDollars(amount));
}

function moreCycleProfitNeeded(
    rule: ConsistencyRule,
    bestDayProfit: number,
    totalProfit: number,
): number {
    if (rule.maxBestDayShare >= 1) return 0;
    const required = bestDayProfit / rule.maxBestDayShare;
    return Math.max(0, required - totalProfit);
}

function violationText(
    phase: TradingPhase,
    status: EvaluatedConsistencyStatus,
): string {
    const needed = moreCycleProfitNeeded(
        status.rule,
        status.bestDayProfit,
        status.totalProfit,
    );
    const lead = `Consistency already violated (max ${status.rule.shareLabel()} best day share)`;
    if (phase === TradingPhase.Funded) {
        return `${lead}: ${dollarText(needed)} more cycle profit needed to bring the best day back within the rule`;
    }
    return status.violationEffectLabel === null
        ? `${lead}: ${dollarText(needed)} more profit needed to bring the best day back within the rule`
        : `${lead}: ${status.violationEffectLabel}, so the account needs more than ${dollarText(status.totalProfit + needed)} of profit (${dollarText(needed)} more) to pass`;
}
