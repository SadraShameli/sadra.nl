import { describeUnresolvedPlan, PlanKeyResolutionKind } from '../core';
import { type AccountAlert } from './AccountAlert';
import { type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class UnresolvablePlanRule extends AccountAlertRule {
    readonly kind = AlertKind.UnresolvablePlan;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        const resolution = monitored.plan;
        return resolution.kind === PlanKeyResolutionKind.Resolved
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `${describeUnresolvedPlan(monitored.planKey, resolution.reason)}; the account is read-only and gets no sizing advice until its plan is fixed`,
              );
    }
}
