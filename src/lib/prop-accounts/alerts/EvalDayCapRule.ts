import { AccountStage, PlanKeyResolutionKind } from '~/lib/prop-accounts/core';
import { isoDaysBetween } from '~/lib/prop-calculator';

import { type AccountAlert, type AlertDisclosure } from './AccountAlert';
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

interface CapProgress {
    readonly disclosures: readonly AlertDisclosure[];
    readonly messageFor: (severity: AlertSeverity) => string;
    readonly remaining: number;
}

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
        const plan = monitored.plan.plan;
        const candidates: CapProgress[] = [];
        if (plan.maxEvalTradingDays !== null) {
            candidates.push(
                tradingDayProgress(monitored, context, plan.maxEvalTradingDays),
            );
        }
        if (plan.evalAccessWindowDays !== null) {
            candidates.push(
                calendarWindowProgress(
                    monitored,
                    context,
                    plan.evalAccessWindowDays,
                ),
            );
        }
        if (candidates.length === 0) return null;
        const binding = candidates.reduce((tightest, candidate) =>
            candidate.remaining < tightest.remaining ? candidate : tightest,
        );
        if (binding.remaining <= 0) {
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                binding.messageFor(AlertSeverity.Critical),
                binding.disclosures,
            );
        }
        return binding.remaining >
            context.rulebook.alerts.evalDaysRemainingWarning
            ? null
            : this.alertFor(
                  monitored,
                  AlertSeverity.Warning,
                  binding.messageFor(AlertSeverity.Warning),
                  binding.disclosures,
              );
    }
}

function calendarWindowProgress(
    monitored: MonitoredAccount,
    context: AlertContext,
    windowDays: number,
): CapProgress {
    const purchasedOn = monitored.account.purchasedOn;
    const elapsed = Math.max(0, isoDaysBetween(purchasedOn, context.today));
    const remaining = windowDays - elapsed;
    return {
        disclosures: [],
        messageFor: (severity) =>
            severity === AlertSeverity.Critical
                ? `Eval access window reached: ${elapsed} of ${windowDays} calendar days used since the purchase on ${purchasedOn}`
                : `${remaining} eval access days left of ${windowDays} calendar days since the purchase on ${purchasedOn}`,
        remaining,
    };
}

function tradingDayProgress(
    monitored: MonitoredAccount,
    context: AlertContext,
    maxDays: number,
): CapProgress {
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
    return {
        disclosures: [TradingSessionCalendar.disclosure],
        messageFor: (severity) =>
            severity === AlertSeverity.Critical
                ? `Eval day cap reached: ${used} of ${maxDays} trading days used (${basis})`
                : `${remaining} eval trading days left of ${maxDays} (${used} used: ${basis})`,
        remaining,
    };
}
