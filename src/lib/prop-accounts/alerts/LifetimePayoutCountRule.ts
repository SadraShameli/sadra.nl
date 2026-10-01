import { AccountStage, PlanKeyResolutionKind } from '~/lib/prop-accounts/core';
import {
    type LifetimePayoutCountGate,
    lifetimePayoutCountLimit,
    PayoutGate,
} from '~/lib/prop-calculator/core';

import { type AccountAlert } from './AccountAlert';
import {
    isActive,
    type MonitoredAccount,
    payoutsTakenOf,
} from './AlertContext';
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
        const limit = lifetimePayoutCountLimit(
            monitored.plan.plan.lifetimeConclusion,
        );
        const taken = payoutsTakenOf(monitored);
        if (limit === null || taken < limit.count - 1) return null;
        const progress = `${taken} of ${limit.count} payouts taken under ${payoutCountSource(limit.gate)}`;
        return taken < limit.count
            ? this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  `${progress}; the next payout is the last one this limit allows`,
              )
            : this.alertFor(
                  monitored,
                  AlertSeverity.Critical,
                  `${progress}; the plan allows no further payout`,
              );
    }
}

function payoutCountSource(gate: LifetimePayoutCountGate): string {
    switch (gate) {
        case PayoutGate.AccountConcluded: {
            return "the plan's lifetime payout limit";
        }
        case PayoutGate.LadderExhausted: {
            return "the plan's payout ladder, which ends at its last step";
        }
    }
}
