import {
    findStoredFirm,
    liveBustCooldownStateOf,
    PlanKeyResolutionKind,
} from '~/lib/prop-accounts/core';
import {
    FixedCooldown,
    type LiveBustCooldown,
    PolicyVerification,
    TimeLiveReducedCooldown,
    UpToCooldown,
} from '~/lib/prop-calculator';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isModeledMonitored,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const COOLDOWN_OVER_NOTICE_MULTIPLE = 2;

export class CooldownActiveRule extends AccountAlertRule {
    readonly kind = AlertKind.CooldownActive;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (
            !isModeledMonitored(monitored) ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved
        ) {
            return null;
        }
        const firm = findStoredFirm(monitored.planKey.firmId);
        if (firm === undefined) return null;
        const policy = firm.accountPolicy.liveExclusivityFor(
            monitored.plan.plan,
        );
        if (policy.source?.verification !== PolicyVerification.Confirmed) {
            return null;
        }
        const state = liveBustCooldownStateOf(monitored.events, context.today);
        if (state === null) return null;
        if (policy.cooldown.isActive(state.daysSinceBust, state.daysLive)) {
            return this.alertFor(
                monitored,
                AlertSeverity.Warning,
                `in the verified cooldown after the live bust on ${state.bustedOn} (${state.daysSinceBust} days elapsed)`,
            );
        }
        const window = cooldownWindowDaysOf(policy.cooldown);
        return window !== null &&
            state.daysSinceBust <= window * COOLDOWN_OVER_NOTICE_MULTIPLE
            ? this.alertFor(
                  monitored,
                  AlertSeverity.Info,
                  `cooldown over: the verified cooldown after the live bust on ${state.bustedOn} has ended`,
              )
            : null;
    }
}

function cooldownWindowDaysOf(cooldown: LiveBustCooldown): null | number {
    if (cooldown instanceof FixedCooldown) return cooldown.cooldownDays;
    if (cooldown instanceof UpToCooldown) return cooldown.maxCooldownDays;
    return cooldown instanceof TimeLiveReducedCooldown
        ? cooldown.steps.reduce(
              (max, step) => Math.max(max, step.cooldownDays),
              0,
          )
        : null;
}
