import { formatPercent } from '~/lib/format';
import { compareText, formatUsdCents } from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    AccountStateUnavailableKind,
    type DayLoss,
    type DayLossAccount,
    DayLossBasis,
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

const HEURISTIC_NOTE =
    'an eval loss is an approximation scaled to the retry fee (valid near a fresh eval), never the fees already paid';

export class LargeDayLossRule extends AlertRule {
    readonly kind = AlertKind.LargeDayLoss;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const fraction = context.rulebook.alerts.dayLossBankrollFraction;
        if (fraction === null) return [];
        const windowStart = addIsoDays(
            context.today,
            -LARGE_DAY_LOSS_WINDOW_DAYS,
        );
        const flagged = dayLossShareOfContext(context).days.filter(
            (day) =>
                day.share !== null &&
                day.share > fraction &&
                compareText(day.date, windowStart) >= 0,
        );
        const worst = flagged.reduce<DayLoss | null>(
            (current, day) =>
                current === null || (day.share ?? 0) > (current.share ?? 0)
                    ? day
                    : current,
            null,
        );
        if (worst === null) return [];
        const heuristic = worst.entries.some(
            (entry) => entry.basis === DayLossBasis.EvalFeeHeuristic,
        );
        const repeated =
            flagged.length > 1
                ? ` (${String(flagged.length)} recent days exceeded it; this is the worst)`
                : '';
        return [
            {
                disclosures: [],
                kind: this.kind,
                message: `On ${worst.date} your accounts lost ${formatUsdCents(worst.lossCents)} of expected value, ${formatPercent(worst.share ?? 0)} of your available bankroll, above your ${formatPercent(fraction)} limit${repeated}${heuristic ? `; ${HEURISTIC_NOTE}` : ''}`,
                severity: AlertSeverity.Warning,
                subject: {
                    accountIds: worst.entries.map((entry) => entry.accountId),
                    kind: AlertSubjectKind.Portfolio,
                },
            },
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
