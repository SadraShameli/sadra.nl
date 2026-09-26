import { PlanKeyResolutionKind } from '../core';
import { type AccountAlert } from './AccountAlert';
import { isModeledMonitored, type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class PlanRulesChangedRule extends AccountAlertRule {
    readonly kind = AlertKind.PlanRulesChanged;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        return !isModeledMonitored(monitored) ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved ||
            monitored.account.readIssues.length > 0 ||
            monitored.account.planRulesChanged !== true
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `The plan rules for "${monitored.account.label}" changed since this account was purchased; check the plan page and re-check its sizing advice`,
              );
    }
}
