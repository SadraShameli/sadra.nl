import { formatCurrency } from '~/lib/format';

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
import { TradingSessionCalendar } from './TradingSessionCalendar';

export const SUBSCRIPTION_CYCLE_DAYS = 30;
export const SUBSCRIPTION_RENEWAL_WARNING_DAYS = 3;

const CENT_DIGITS = 2;

export class SubscriptionRenewalDueRule extends AccountAlertRule {
    readonly kind = AlertKind.SubscriptionRenewalDue;

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
        const fee = monitored.plan.plan.fees.monthlySubscription;
        if (fee <= 0) return null;
        const purchasedOn = monitored.account.purchasedOn;
        const elapsed = TradingSessionCalendar.daysBetween(
            purchasedOn,
            context.today,
        );
        if (elapsed < 0) return null;
        const daysUntil = daysUntilRenewal(elapsed);
        if (daysUntil > SUBSCRIPTION_RENEWAL_WARNING_DAYS) return null;
        const renewsOn = TradingSessionCalendar.addDays(
            context.today,
            daysUntil,
        );
        const when = daysUntil === 0 ? 'today' : `in ${daysUntil} days`;
        return this.alertFor(
            monitored,
            AlertSeverity.Info,
            `Monthly subscription of ${formatCurrency(fee, CENT_DIGITS)} (plan list price) renews ${when} (${renewsOn}), assuming a ${SUBSCRIPTION_CYCLE_DAYS}-day cycle from the purchase on ${purchasedOn}`,
            [AlertDisclosure.ThirtyDayBillingCycle],
        );
    }
}

function daysUntilRenewal(elapsedDays: number): number {
    const intoCycle = elapsedDays % SUBSCRIPTION_CYCLE_DAYS;
    return intoCycle === 0 && elapsedDays > 0
        ? 0
        : SUBSCRIPTION_CYCLE_DAYS - intoCycle;
}
