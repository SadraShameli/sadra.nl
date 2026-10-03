import {
    type FirmCountMember,
    type FirmPayoutCount,
    firmPayoutCounts,
    isFirmCountMemberReadable,
    requestedPayoutCountAt,
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

export enum LiveProximityCountStatus {
    Checked = 'checked',
    NotChecked = 'not-checked',
}

export enum LiveProximityStatus {
    Unverified = 'unverified',
    Verified = 'verified',
}

export interface AccountLiveTriggerProximity {
    readonly accountId: string;
    readonly countStatus: LiveProximityCountStatus;
    readonly firmId: FirmId;
    readonly paidPayouts: number;
    readonly planSerial: string;
    readonly remaining: null | number;
    readonly requestedPayouts: number;
    readonly status: LiveProximityStatus;
    readonly triggerCount: null | number;
}

export interface FirmLiveTriggerProximity {
    readonly countStatus: LiveProximityCountStatus;
    readonly firmId: FirmId;
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly remaining: null | number;
    readonly requestedPayoutsSinceLastLiveAccount: number;
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

const NO_REPORTED_PAYOUTS: ReadonlyMap<string, number> = new Map();

const ZERO_PROGRESS: LiveTriggerProgress = {
    cumulativePayoutDollars: dollars(0),
    largestSingleDayProfit: dollars(0),
    payoutCountAcrossFirm: 0,
    payoutCountThisAccount: 0,
};

export function liveTransitionProximity(
    ledger: PortfolioLedger,
    asOf: string,
    reportedPayoutsTaken: ReadonlyMap<string, number> = NO_REPORTED_PAYOUTS,
): LiveTransitionProximity {
    const firmCounts = firmPayoutCounts(ledger, asOf);
    const groups = ledger
        .planGroups()
        .filter((group) =>
            group.accounts.some((entry) => entry.row.archivedAt === null),
        );
    const groupsByFirm = Map.groupBy(groups, (group) => group.firmId);

    return {
        byAccount: groups.flatMap((group) =>
            accountRowsOf(group, asOf, reportedPayoutsTaken),
        ),
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
    reportedPayoutsTaken: ReadonlyMap<string, number>,
): readonly AccountLiveTriggerProximity[] {
    const trigger = perAccountTriggerOf(group);
    const isVerified = isConfirmed(trigger?.source);
    return group.accounts
        .filter((entry) => entry.row.archivedAt === null)
        .map((entry) => {
            const member: FirmCountMember = {
                account: entry.row,
                events: entry.events,
                payouts: entry.payouts,
            };
            const isReadable = isFirmCountMemberReadable(member);
            const paidPayouts = isReadable
                ? Math.max(
                      reportedPayoutsTaken.get(entry.row.id) ?? 0,
                      paidPayoutsOnOrBefore(entry.payouts, asOf).length,
                  )
                : 0;
            const requestedPayouts = isReadable
                ? requestedPayoutCountAt(entry.payouts, asOf)
                : 0;
            return {
                accountId: entry.row.id,
                countStatus: isReadable
                    ? LiveProximityCountStatus.Checked
                    : LiveProximityCountStatus.NotChecked,
                firmId: group.firmId,
                paidPayouts,
                planSerial: group.planSerial,
                remaining:
                    trigger === undefined || !isVerified || !isReadable
                        ? null
                        : trigger.distance({
                              ...ZERO_PROGRESS,
                              payoutCountThisAccount:
                                  paidPayouts + requestedPayouts,
                          }),
                requestedPayouts,
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
    const count = firmCounts.find((entry) => entry.firmId === firmId);
    const paidPayoutsSinceLastLiveAccount =
        count?.paidPayoutsSinceLastLiveAccount ?? 0;
    const requestedPayoutsSinceLastLiveAccount =
        count?.requestedPayoutsSinceLastLiveAccount ?? 0;
    return {
        countStatus:
            count === undefined
                ? LiveProximityCountStatus.NotChecked
                : LiveProximityCountStatus.Checked,
        firmId,
        paidPayoutsSinceLastLiveAccount,
        remaining:
            trigger === undefined || !isVerified || count === undefined
                ? null
                : trigger.distance({
                      ...ZERO_PROGRESS,
                      payoutCountAcrossFirm:
                          paidPayoutsSinceLastLiveAccount +
                          requestedPayoutsSinceLastLiveAccount,
                  }),
        requestedPayoutsSinceLastLiveAccount,
        sinceOn: count?.sinceOn ?? null,
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
