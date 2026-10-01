import {
    type FirmPayoutCount,
    firmPayoutCounts,
    paidPayoutsSinceLastLiveAccountFor,
} from '~/lib/prop-accounts/advice/FirmPayoutCount';
import {
    type Dollars,
    dollars,
    type FirmId,
    type LiveTriggerProgress,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type PolicyQuote,
    PolicyVerification,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';

import { type PlanGroup, type PortfolioLedger } from './PortfolioLedger';
import { paidPayoutsOnOrBefore } from './SpendAndPayouts';

export enum LiveProximityStatus {
    Unverified = 'unverified',
    Verified = 'verified',
}

export interface AccountLiveTriggerProximity {
    readonly accountId: string;
    readonly firmId: FirmId;
    readonly paidPayouts: number;
    readonly planSerial: string;
    readonly remaining: null | number;
    readonly status: LiveProximityStatus;
    readonly triggerCount: null | number;
}

export interface FirmLiveTriggerProximity {
    readonly firmId: FirmId;
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly remaining: null | number;
    readonly sinceOn: null | string;
    readonly status: LiveProximityStatus;
    readonly triggerCount: null | number;
}

export interface LiveTransitionProximity {
    readonly byAccount: readonly AccountLiveTriggerProximity[];
    readonly byFirm: readonly FirmLiveTriggerProximity[];
    readonly singleDayFacts: readonly SingleDayTriggerFact[];
}

export interface SingleDayTriggerFact {
    readonly amount: Dollars;
    readonly firmId: FirmId;
    readonly isAutomatic: boolean;
    readonly isExcessForfeited: boolean;
    readonly planSerial: string;
    readonly quote: PolicyQuote;
}

const ZERO_PROGRESS: LiveTriggerProgress = {
    cumulativePayoutDollars: dollars(0),
    largestSingleDayProfit: dollars(0),
    payoutCountAcrossFirm: 0,
    payoutCountThisAccount: 0,
};

export function liveTransitionProximity(
    ledger: PortfolioLedger,
    asOf: string,
): LiveTransitionProximity {
    const groups = ledger
        .planGroups()
        .filter((group) =>
            group.accounts.some((entry) => entry.row.archivedAt === null),
        );
    const firmCounts = firmPayoutCounts(ledger, asOf);
    const groupsByFirm = Map.groupBy(groups, (group) => group.firmId);

    return {
        byAccount: groups.flatMap((group) => accountRowsOf(group, asOf)),
        byFirm: groupsByFirm
            .values()
            .flatMap((firmGroups) => {
                const first = firmGroups[0];
                return first === undefined
                    ? []
                    : [firmRowOf(first.firmId, firmGroups, firmCounts)];
            })
            .toArray(),
        singleDayFacts: groups.flatMap(singleDayFactsOf),
    };
}

function accountRowsOf(
    group: PlanGroup,
    asOf: string,
): readonly AccountLiveTriggerProximity[] {
    const trigger = perAccountTriggerOf(group);
    const isVerified = isConfirmed(trigger?.source);
    return group.accounts
        .filter((entry) => entry.row.archivedAt === null)
        .map((entry) => {
            const paidPayouts = paidPayoutsOnOrBefore(
                entry.payouts,
                asOf,
            ).length;
            return {
                accountId: entry.row.id,
                firmId: group.firmId,
                paidPayouts,
                planSerial: group.planSerial,
                remaining:
                    trigger === undefined || !isVerified
                        ? null
                        : trigger.distance({
                              ...ZERO_PROGRESS,
                              payoutCountThisAccount: paidPayouts,
                          }),
                status: isVerified
                    ? LiveProximityStatus.Verified
                    : LiveProximityStatus.Unverified,
                triggerCount:
                    trigger === undefined || !isVerified ? null : trigger.cap,
            };
        });
}

function firmRowOf(
    firmId: FirmId,
    firmGroups: readonly PlanGroup[],
    firmCounts: readonly FirmPayoutCount[],
): FirmLiveTriggerProximity {
    const trigger = firmTotalTriggerAcrossPlans(firmGroups);
    const isVerified = isConfirmed(trigger?.source);
    const paidPayoutsSinceLastLiveAccount =
        paidPayoutsSinceLastLiveAccountFor(firmCounts, firmId) ?? 0;
    const sinceOn =
        firmCounts.find((entry) => entry.firmId === firmId)?.sinceOn ?? null;
    return {
        firmId,
        paidPayoutsSinceLastLiveAccount,
        remaining:
            trigger === undefined || !isVerified
                ? null
                : trigger.distance({
                      ...ZERO_PROGRESS,
                      payoutCountAcrossFirm: paidPayoutsSinceLastLiveAccount,
                  }),
        sinceOn,
        status: isVerified
            ? LiveProximityStatus.Verified
            : LiveProximityStatus.Unverified,
        triggerCount: trigger === undefined || !isVerified ? null : trigger.cap,
    };
}

function firmTotalTriggerAcrossPlans(
    groups: readonly PlanGroup[],
): PayoutCountTotalTrigger | undefined {
    const triggers = groups.flatMap((group) => {
        const trigger = firmTotalTriggerOf(group);
        return trigger === undefined ? [] : [trigger];
    });
    const confirmed = triggers.filter((trigger) => isConfirmed(trigger.source));
    const first = confirmed[0];
    if (first === undefined) return triggers[0];
    return confirmed.every((trigger) => trigger.cap === first.cap)
        ? first
        : undefined;
}

function firmTotalTriggerOf(
    group: PlanGroup,
): PayoutCountTotalTrigger | undefined {
    return group.firm.accountPolicy
        .liveTriggersFor(group.plan)
        .find(
            (trigger): trigger is PayoutCountTotalTrigger =>
                trigger instanceof PayoutCountTotalTrigger,
        );
}

function isConfirmed(
    source: undefined | { readonly verification: PolicyVerification },
): boolean {
    return source?.verification === PolicyVerification.Confirmed;
}

function perAccountTriggerOf(
    group: PlanGroup,
): PayoutCountPerAccountTrigger | undefined {
    return group.firm.accountPolicy
        .liveTriggersFor(group.plan)
        .find(
            (trigger): trigger is PayoutCountPerAccountTrigger =>
                trigger instanceof PayoutCountPerAccountTrigger,
        );
}

function singleDayFactsOf(group: PlanGroup): readonly SingleDayTriggerFact[] {
    return group.firm.accountPolicy
        .liveTriggersFor(group.plan)
        .flatMap((trigger) => {
            if (!(trigger instanceof SingleDayProfitTrigger)) return [];
            const { source } = trigger;
            if (source?.verification !== PolicyVerification.Confirmed) {
                return [];
            }
            return [
                {
                    amount: trigger.amount,
                    firmId: group.firmId,
                    isAutomatic: trigger.isAutomatic,
                    isExcessForfeited: trigger.isExcessForfeited,
                    planSerial: group.planSerial,
                    quote: source,
                },
            ];
        });
}
