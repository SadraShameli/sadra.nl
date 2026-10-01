import { AccountStage, isAccountDate, isEndedStatus } from '~/lib/prop-accounts/core';
import {
    InactivityBasisKind,
    isoDaysBetween,
    PolicyVerification,
    SimAccountEffect,
    TradingPhase,
} from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    type ModeledMonitoredAccount,
    type ResolvedFirmAccount,
    resolvedFirmAccountsOf,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

const WARNING_LEAD_DAYS = 2;
const CALENDAR_WEEK_IDLE_DAYS = 7;

export class CalendarInactivityRule extends AlertRule {
    readonly kind = AlertKind.CalendarInactivity;

    private accountAlerts(
        entry: ResolvedFirmAccount,
        dormant: ReadonlySet<string>,
        today: string,
    ): readonly AccountAlert[] {
        const { monitored } = entry;
        if (
            isEndedStatus(monitored.account.status) ||
            monitored.account.stage === AccountStage.Live ||
            dormant.has(monitored.account.id)
        ) {
            return [];
        }
        const phase = phaseFor(monitored.account.stage);
        if (phase === null) return [];
        const policy = entry.firm.accountPolicy.inactivityFor(
            entry.plan,
            phase,
        );
        if (policy.source?.verification !== PolicyVerification.Confirmed) {
            return [];
        }
        const lastTradedOn = monitored.latestSnapshot?.lastTradedOn ?? null;
        if (lastTradedOn === null || !isAccountDate(lastTradedOn)) {
            return [
                singleAccountAlert(
                    this.kind,
                    monitored,
                    AlertSeverity.Info,
                    lastTradedOn === null
                        ? 'not checked: no last-traded date is on file to compare against the verified calendar inactivity policy'
                        : "not checked: this account's stored last-traded date is invalid; fix the account's stored data",
                ),
            ];
        }
        const idleDays = isoDaysBetween(lastTradedOn, today);
        switch (policy.kind) {
            case InactivityBasisKind.CalendarDays:
            case InactivityBasisKind.TradingDays: {
                if (policy.maxIdleDays === null) return [];
                if (idleDays < policy.maxIdleDays - WARNING_LEAD_DAYS) {
                    return [];
                }
                const severity =
                    idleDays >= policy.maxIdleDays
                        ? AlertSeverity.Critical
                        : AlertSeverity.Warning;
                return [
                    singleAccountAlert(
                        this.kind,
                        monitored,
                        severity,
                        `${idleDays} idle calendar days since the last trade on ${lastTradedOn}, of the verified ${policy.maxIdleDays}-day inactivity limit (quote: "${policy.source.quote}")`,
                    ),
                ];
            }
            case InactivityBasisKind.CalendarWeek: {
                if (idleDays < CALENDAR_WEEK_IDLE_DAYS) return [];
                return [
                    singleAccountAlert(
                        this.kind,
                        monitored,
                        AlertSeverity.Warning,
                        `${idleDays} idle calendar days since the last trade on ${lastTradedOn}, short of the verified ${policy.sessionsPerWeek} trade(s) per calendar week; enforcement is discretionary (quote: "${policy.source.quote}")`,
                    ),
                ];
            }
        }
    }

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const resolved = resolvedFirmAccountsOf(context);
        const dormant = dormantAccountIdsOf(resolved);
        return resolved.flatMap((entry) =>
            this.accountAlerts(entry, dormant, context.today),
        );
    }
}

function dormantAccountIdsOf(
    resolved: readonly ResolvedFirmAccount[],
): ReadonlySet<string> {
    const byFirmId = Map.groupBy(
        resolved,
        (entry) => entry.monitored.planKey.firmId,
    );
    const dormant = new Set<string>();
    for (const group of byFirmId.values()) {
        const hasActiveLive = group.some(
            (entry) =>
                entry.monitored.account.stage === AccountStage.Live &&
                !isEndedStatus(entry.monitored.account.status),
        );
        if (!hasActiveLive) continue;
        for (const entry of group) {
            if (entry.monitored.account.stage === AccountStage.Live) continue;
            const policy = entry.firm.accountPolicy.liveExclusivityFor(
                entry.plan,
            );
            if (
                policy.source?.verification === PolicyVerification.Confirmed &&
                policy.simAccountEffect === SimAccountEffect.Dormant
            ) {
                dormant.add(entry.monitored.account.id);
            }
        }
    }
    return dormant;
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

function singleAccountAlert(
    kind: AlertKind,
    monitored: ModeledMonitoredAccount,
    severity: AlertSeverity,
    message: string,
): AccountAlert {
    return {
        disclosures: [],
        kind,
        message,
        severity,
        subject: {
            accountId: monitored.account.id,
            kind: AlertSubjectKind.Account,
            label: monitored.account.label,
        },
    };
}
