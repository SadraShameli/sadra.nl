import {
    CENTS_PER_DOLLAR,
    type ConsistencyRule,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

import { formatUsdCents, usdCentsFromDollars } from '../core';
import {
    AccountStateKind,
    type ConsistencyStatus,
    ConsistencyStatusKind,
    evalConsistencyStatus,
    fundedConsistencyStatus,
} from '../metrics';
import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class ConsistencyNearBreachRule extends AccountAlertRule {
    readonly kind = AlertKind.ConsistencyNearBreach;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const state = monitored.accountState;
        if (state?.kind !== AccountStateKind.Reconstructed) return null;
        const status = consistencyStatusOf(state.latest.reconstructed);
        if (status?.kind !== ConsistencyStatusKind.Evaluated) return null;
        if (status.isViolated) {
            const needed = moreCycleProfitNeeded(
                status.rule,
                status.bestDayProfit,
                status.totalProfit,
            );
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                `Consistency already violated (max ${status.rule.shareLabel()} best day share): ${formatUsdCents(usdCentsFromDollars(needed))} more cycle profit needed to bring the best day back within the rule`,
            );
        }
        if (state.latest.reconstructed.kind !== TradingPhase.Funded) {
            return null;
        }
        const documentedWin =
            context.rulebook.funded.takeProfitCents / CENTS_PER_DOLLAR;
        const room = status.rule.maxDayProfitBeforeViolation(
            status.totalProfit,
        );
        return room < documentedWin
            ? this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `One documented winning day of ${formatUsdCents(usdCentsFromDollars(documentedWin))} would break the ${status.rule.shareLabel()} consistency rule (${formatUsdCents(usdCentsFromDollars(room))} of room left before violation)`,
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

function moreCycleProfitNeeded(
    rule: ConsistencyRule,
    bestDayProfit: number,
    totalProfit: number,
): number {
    if (rule.maxBestDayShare >= 1) return 0;
    const required = bestDayProfit / rule.maxBestDayShare;
    return Math.max(0, required - totalProfit);
}
