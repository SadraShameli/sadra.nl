import { describeUnresolvedPlan, PlanKeyResolutionKind } from '~/lib/prop-accounts/core';

import { type AccountAlert } from './AccountAlert';
import { isModeledMonitored, type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class UnresolvablePlanRule extends AccountAlertRule {
    readonly kind = AlertKind.UnresolvablePlan;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        const resolution = monitored.plan;
        return !isModeledMonitored(monitored) ||
            resolution.kind !== PlanKeyResolutionKind.Unresolved
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `${describeUnresolvedPlan(monitored.planKey, resolution.reason)}; the account is read-only and gets no sizing advice until its plan is fixed`,
              );
    }
}
