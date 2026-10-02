import { formatPercent } from '~/lib/format';
import { compareText, formatUsdCents } from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    AccountStateUnavailableKind,
    type DayLoss,
    type DayLossAccount,
    dayLossBasisNotes,
    dayLossBreakdownText,
    type DayLossShare,
    dayLossShareOf,
} from '~/lib/prop-accounts/metrics';
import { addIsoDays } from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    isActive,
    isModeledMonitored,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

export const LARGE_DAY_LOSS_WINDOW_DAYS = 7;

export class LargeDayLossRule extends AlertRule {
    readonly kind = AlertKind.LargeDayLoss;

    private alertOf(
        day: DayLoss,
        severity: AlertSeverity,
        message: string,
    ): AccountAlert {
        return {
            disclosures: [],
            kind: this.kind,
            message,
            severity,
            subject: {
                accountIds: day.entries.map((entry) => entry.accountId),
                kind: AlertSubjectKind.Portfolio,
            },
        };
    }

    private uncheckedAlertOf(
        recent: readonly DayLoss[],
        fraction: number,
    ): readonly AccountAlert[] {
        const worst = recent
            .filter((day) => day.share === null)
            .reduce<DayLoss | null>(
                (current, day) =>
                    current === null || day.lossCents > current.lossCents
                        ? day
                        : current,
                null,
            );
        return worst === null
            ? []
            : [
                  this.alertOf(
                      worst,
                      AlertSeverity.Info,
                      `On ${worst.date} your accounts lost ${formatUsdCents(worst.lossCents)}, ${dayLossBreakdownText(worst)}, but there is no available bankroll to compare it with your ${formatPercent(fraction)} limit; record a deposit so the limit can be checked${notesOf(worst)}`,
                  ),
              ];
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const fraction = context.rulebook.alerts.dayLossBankrollFraction;
        if (fraction === null) return [];
        const windowStart = addIsoDays(
            context.today,
            -LARGE_DAY_LOSS_WINDOW_DAYS,
        );
        const recent = dayLossShareOfContext(context).days.filter(
            (day) => compareText(day.date, windowStart) >= 0,
        );
        const flagged = recent.filter(
            (day) => day.share !== null && day.share > fraction,
        );
        const worst = flagged.reduce<DayLoss | null>(
            (current, day) =>
                current === null || (day.share ?? 0) > (current.share ?? 0)
                    ? day
                    : current,
            null,
        );
        if (worst === null) return this.uncheckedAlertOf(recent, fraction);
        const repeated =
            flagged.length > 1
                ? ` (${String(flagged.length)} recent days exceeded it; this is the worst)`
                : '';
        return [
            this.alertOf(
                worst,
                AlertSeverity.Warning,
                `On ${worst.date} your accounts lost ${formatUsdCents(worst.lossCents)}, ${dayLossBreakdownText(worst)}, ${formatPercent(worst.share ?? 0)} of your available bankroll, above your ${formatPercent(fraction)} limit${repeated}${notesOf(worst)}`,
            ),
        ];
    }
}

export function dayLossShareOfContext(context: AlertContext): DayLossShare {
    return dayLossShareOf({
        accounts: context.accounts
            .filter(
                (monitored) =>
                    isModeledMonitored(monitored) && isActive(monitored),
            )
            .map((monitored): DayLossAccount => ({
                accountId: monitored.account.id,
                events: monitored.events,
                paidPayouts: monitored.payouts,
                state: monitored.accountState ?? {
                    kind: AccountStateKind.Unavailable,
                    reason: {
                        kind: AccountStateUnavailableKind.NoSnapshot,
                    },
                },
            })),
        availableBankrollCents: context.availableBankrollCents,
        rulebook: context.rulebook,
    });
}

function notesOf(day: DayLoss): string {
    const notes = dayLossBasisNotes(day);
    return notes.length === 0 ? '' : `; ${notes.join('; ')}`;
}
