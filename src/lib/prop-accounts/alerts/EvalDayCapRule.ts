import { AccountStage, PlanKeyResolutionKind } from '../core';
import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    isModeledMonitored,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';
import { TradingSessionCalendar } from './TradingSessionCalendar';

export class EvalDayCapRule extends AccountAlertRule {
    readonly kind = AlertKind.EvalDayCapNear;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (
            !isActive(monitored) ||
            !isModeledMonitored(monitored) ||
            monitored.account.stage !== AccountStage.Eval ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved
        ) {
            return null;
        }
        const maxDays = monitored.plan.plan.maxEvalTradingDays;
        if (maxDays === null) return null;
        const purchasedOn = monitored.account.purchasedOn;
        const sessions = TradingSessionCalendar.sessionsBetween(
            purchasedOn,
            context.today,
        );
        const traded = monitored.latestSnapshot?.tradingDays ?? null;
        const used = Math.max(sessions, traded ?? 0);
        const tradedText = traded === null ? 'none recorded' : String(traded);
        const basis = `${sessions} sessions since the purchase on ${purchasedOn}, traded days ${tradedText}`;
        const remaining = maxDays - used;
        if (remaining <= 0) {
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                `Eval day cap reached: ${used} of ${maxDays} trading days used (${basis})`,
                [TradingSessionCalendar.disclosure],
            );
        }
        return remaining > context.rulebook.alerts.evalDaysRemainingWarning
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `${remaining} eval trading days left of ${maxDays} (${used} used: ${basis})`,
                  [TradingSessionCalendar.disclosure],
              );
    }
}
