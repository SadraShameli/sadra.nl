import { isoDaysBetween, TradingPhase } from '~/lib/prop-calculator';

import { AccountStage, PlanKeyResolutionKind } from '../core';
import { type AccountAlert, AlertDisclosure } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    isModeledMonitored,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const WARNING_LEAD_DAYS = 2;

export class IdleSessionLimitRule extends AccountAlertRule {
    readonly kind = AlertKind.IdleSessionLimit;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (
            !isActive(monitored) ||
            !isModeledMonitored(monitored) ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved
        ) {
            return null;
        }
        const phase = phaseFor(monitored.account.stage);
        if (phase === null) return null;
        const limit = monitored.plan.plan.maxConsecutiveIdleDaysFor(phase);
        if (limit === null) return null;
        const lastTradedOn = monitored.latestSnapshot?.lastTradedOn ?? null;
        if (lastTradedOn === null) return null;
        const idleDays = isoDaysBetween(lastTradedOn, context.today);
        if (idleDays < limit - WARNING_LEAD_DAYS) return null;
        const severity =
            idleDays >= limit ? AlertSeverity.Critical : AlertSeverity.Warning;
        return this.alertFor(
            monitored,
            severity,
            `${idleDays} idle calendar days since the last trade on ${lastTradedOn}, of a ${limit}-day inactivity limit`,
            [AlertDisclosure.SessionLimitApproximatedAsCalendarDays],
        );
    }
}

function phaseFor(stage: AccountStage): null | TradingPhase {
    switch (stage) {
        case AccountStage.Eval: {
            return TradingPhase.Eval;
        }
        case AccountStage.Funded: {
            return TradingPhase.Funded;
        }
        case AccountStage.Live: {
            return null;
        }
    }
}
