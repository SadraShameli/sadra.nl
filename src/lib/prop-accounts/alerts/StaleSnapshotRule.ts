import { AccountStage } from '../core';
import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    type MonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';
import { TradingSessionCalendar } from './TradingSessionCalendar';

export class StaleSnapshotRule extends AccountAlertRule {
    readonly kind = AlertKind.StaleSnapshot;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (!isActive(monitored)) return null;
        const snapshot = monitored.latestSnapshot;
        const stage = monitored.account.stage;
        if (snapshot === null) {
            return this.alertFor(
                monitored,
                AlertSeverity.Warning,
                `No balance snapshot recorded yet for this ${stage} account; enter its current balance`,
            );
        }
        switch (stage) {
            case AccountStage.Eval:
            case AccountStage.Live: {
                const session = TradingSessionCalendar.lastSessionBefore(
                    context.today,
                );
                return snapshot.asOf >= session.date
                    ? null
                    : this.alertFor(
                          monitored,
                          AlertSeverity.Warning,
                          `Snapshot from ${snapshot.asOf} predates the last trading session ${session.date}; enter today's balance before sizing this ${stage} account`,
                          [session.disclosure],
                      );
            }
            case AccountStage.Funded: {
                const age = TradingSessionCalendar.daysBetween(
                    snapshot.asOf,
                    context.today,
                );
                const staleDays = context.rulebook.review.fundedStaleDays;
                return age <= staleDays
                    ? null
                    : this.alertFor(
                          monitored,
                          AlertSeverity.Warning,
                          `Funded snapshot from ${snapshot.asOf} is ${age} days old (stale after ${staleDays} days); enter this week's balance`,
                      );
            }
        }
    }
}
