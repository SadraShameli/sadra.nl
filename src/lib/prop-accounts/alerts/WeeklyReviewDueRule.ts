import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import { type AlertContext, isActive } from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';
import { TradingSessionCalendar } from './TradingSessionCalendar';

export class WeeklyReviewDueRule extends AlertRule {
    readonly kind = AlertKind.WeeklyReviewDue;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const weekday = context.rulebook.review.weekday;
        const reviewDay = TradingSessionCalendar.latestWeekdayOnOrBefore(
            context.today,
            weekday,
        );
        const active = context.accounts.filter(isActive);
        const pending = active.filter(
            (monitored) =>
                monitored.latestSnapshot === null ||
                monitored.latestSnapshot.asOf < reviewDay,
        );
        if (pending.length === 0) return [];
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: `Weekly review due since ${weekday} ${reviewDay}: ${pending.length} of ${active.length} active accounts have no snapshot since then`,
                severity: AlertSeverity.Info,
                subject: {
                    accountIds: pending.map(
                        (monitored) => monitored.account.id,
                    ),
                    kind: AlertSubjectKind.Portfolio,
                },
            },
        ];
    }
}
