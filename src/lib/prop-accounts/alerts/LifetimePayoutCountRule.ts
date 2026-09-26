import { AccountStage, PayoutStatus, PlanKeyResolutionKind } from '../core';
import { type AccountAlert } from './AccountAlert';
import { isActive, type MonitoredAccount } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export class LifetimePayoutCountRule extends AccountAlertRule {
    readonly kind = AlertKind.LifetimePayoutCountNear;

    protected evaluateAccount(
        monitored: MonitoredAccount,
    ): AccountAlert | null {
        if (
            !isActive(monitored) ||
            monitored.account.stage !== AccountStage.Funded ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved
        ) {
            return null;
        }
        const maxPayouts = monitored.plan.plan.maxLifetimePayouts;
        if (maxPayouts === null) return null;
        const paidCount = monitored.payouts.filter(
            (payout) => payout.status === PayoutStatus.Paid,
        ).length;
        const taken = Math.max(
            monitored.latestSnapshot?.payoutsTaken ?? 0,
            paidCount,
        );
        if (taken >= maxPayouts) {
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                `${taken} of ${maxPayouts} lifetime payouts taken; the plan allows no further payout`,
            );
        }
        return taken < maxPayouts - 1
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `${taken} of ${maxPayouts} lifetime payouts taken; the next payout is the last one the plan allows`,
              );
    }
}
