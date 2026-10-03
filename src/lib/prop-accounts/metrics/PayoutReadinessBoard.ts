import { type UsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    CENTS_PER_DOLLAR,
    dollars,
    findFirm,
    minimumPayoutRequest,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type AccountPendingPayoutCounts,
    firmMinimumNotice,
    fundedPayoutRuleContextOf,
    type LiveTriggerCoverage,
    liveTriggerLimitsFor,
    type PayoutBlockReason,
    PayoutBlockReasonKind,
    payoutReadiness,
    PayoutReadinessKind,
    type PayoutWait,
    pendingPayoutCountsOf,
    type ReconstructedFundedOrEvalAccount,
    retainedCushionForStage,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateUnavailableReason,
} from './AccountStates';

export enum PayoutReadinessNotApplicableKind {
    NotFunded = 'not-funded',
    Unavailable = 'unavailable',
}

export enum PayoutReadinessRowKind {
    Blocked = 'blocked',
    Eligible = 'eligible',
}

export interface FirmMinimumNotice {
    readonly minimumRequestAmountCents: UsdCents;
    readonly requestedAmountCents: UsdCents;
}

export interface PayoutReadinessAccountOverride {
    readonly paidPayoutsSinceLastLiveAccount?: null | number;
    readonly pendingPayoutCounts?: AccountPendingPayoutCounts;
    readonly personalRequestOverride?: null | number;
    readonly personalRetainedCushion?: null | number;
}

export interface PayoutReadinessBlockedRow {
    readonly accountId: string;
    readonly asOf: string;
    readonly kind: PayoutReadinessRowKind.Blocked;
    readonly pendingAmountCents: null | UsdCents;
    readonly reason: PayoutBlockReason;
    readonly wait: null | PayoutWait;
}

export interface PayoutReadinessBoard {
    readonly notApplicable: readonly PayoutReadinessNotApplicableRow[];
    readonly rows: readonly PayoutReadinessRow[];
}

export interface PayoutReadinessEligibleRow {
    readonly accountId: string;
    readonly asOf: string;
    readonly firmMinimumNotice: FirmMinimumNotice | null;
    readonly kind: PayoutReadinessRowKind.Eligible;
    readonly liveTriggerCoverage: LiveTriggerCoverage;
    readonly requestedAmountCents: UsdCents;
    readonly traderReceivesCents: UsdCents;
}

export type PayoutReadinessNotApplicable =
    | { readonly kind: PayoutReadinessNotApplicableKind.NotFunded }
    | {
          readonly kind: PayoutReadinessNotApplicableKind.Unavailable;
          readonly reason: AccountStateUnavailableReason;
      };

export interface PayoutReadinessNotApplicableRow {
    readonly accountId: string;
    readonly notApplicable: PayoutReadinessNotApplicable;
}

export type PayoutReadinessRow =
    PayoutReadinessBlockedRow | PayoutReadinessEligibleRow;

export function payoutReadinessBoardOf(
    rulebook: RulebookParameters,
    entries: readonly AccountStateEntry[],
    overrides: ReadonlyMap<string, PayoutReadinessAccountOverride> = new Map(),
): PayoutReadinessBoard {
    const rows: PayoutReadinessRow[] = [];
    const notApplicable: PayoutReadinessNotApplicableRow[] = [];
    for (const entry of entries) {
        const { state } = entry;
        if (state.kind === AccountStateKind.Unavailable) {
            notApplicable.push({
                accountId: entry.accountId,
                notApplicable: {
                    kind: PayoutReadinessNotApplicableKind.Unavailable,
                    reason: state.reason,
                },
            });
            continue;
        }
        const { reconstructed } = state.latest;
        if (reconstructed.kind !== TradingPhase.Funded) {
            notApplicable.push({
                accountId: entry.accountId,
                notApplicable: {
                    kind: PayoutReadinessNotApplicableKind.NotFunded,
                },
            });
            continue;
        }
        rows.push(
            fundedRowOf(
                rulebook,
                entry.accountId,
                state.latest.asOf,
                reconstructed.plan,
                reconstructed,
                overrides.get(entry.accountId),
            ),
        );
    }
    return { notApplicable, rows };
}

function firmMinimumNoticeOf(
    rawRequest: number,
    plan: Plan,
): FirmMinimumNotice | null {
    const notice = firmMinimumNotice(rawRequest, minimumPayoutRequest(plan));
    return notice === null
        ? null
        : {
              minimumRequestAmountCents: usdCentsFromDollars(
                  notice.minimumRequestAmount,
              ),
              requestedAmountCents: usdCentsFromDollars(notice.requestedAmount),
          };
}

function fundedRowOf(
    rulebook: RulebookParameters,
    accountId: string,
    asOf: string,
    plan: Plan,
    account: ReconstructedFundedOrEvalAccount,
    override: PayoutReadinessAccountOverride | undefined,
): PayoutReadinessRow {
    const { fundedTracker: tracker, pendingPayouts, state } = account;
    if (tracker === null) {
        throw new Error(
            'a funded reconstructed account is missing its funded cycle tracker',
        );
    }
    const liveTriggerLimits = liveTriggerLimitsFor(
        findFirm(plan.id.firm)?.accountPolicy,
        plan,
        override?.paidPayoutsSinceLastLiveAccount ?? null,
    );
    const pendingPayoutCounts =
        override?.pendingPayoutCounts ?? pendingPayoutCountsOf(account);
    const ruleContext = fundedPayoutRuleContextOf({
        ...pendingPayoutCounts,
        liveTrigger: liveTriggerLimits,
        pendingPayouts: pendingPayouts ?? 0,
        personalRequestOverride: null,
        personalRetainedCushion:
            override?.personalRetainedCushion == null
                ? null
                : dollars(override.personalRetainedCushion),
        plan,
        state,
        tracker,
    });
    const { amount: minRetainedCushion } = retainedCushionForStage(
        rulebook,
        ruleContext,
    );
    const rawRequest =
        override?.personalRequestOverride ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const grossPendingPayouts = pendingPayouts ?? 0;
    const readiness = payoutReadiness(plan, ruleContext.state, tracker, {
        ...pendingPayoutCounts,
        liveTrigger: liveTriggerLimits,
        minRetainedCushion,
        payoutRequestSize: rawRequest,
        pendingPayouts: grossPendingPayouts,
        statePendingPayoutsNetted: false,
    });
    switch (readiness.kind) {
        case PayoutReadinessKind.Blocked: {
            return {
                accountId,
                asOf,
                kind: PayoutReadinessRowKind.Blocked,
                pendingAmountCents:
                    readiness.reason.kind ===
                    PayoutBlockReasonKind.PayoutPending
                        ? usdCentsFromDollars(grossPendingPayouts)
                        : null,
                reason: readiness.reason,
                wait: readiness.wait,
            };
        }
        case PayoutReadinessKind.Eligible: {
            return {
                accountId,
                asOf,
                firmMinimumNotice: firmMinimumNoticeOf(rawRequest, plan),
                kind: PayoutReadinessRowKind.Eligible,
                liveTriggerCoverage: liveTriggerLimits.coverage,
                requestedAmountCents: usdCentsFromDollars(
                    readiness.requestedAmount,
                ),
                traderReceivesCents: usdCentsFromDollars(
                    readiness.traderReceives,
                ),
            };
        }
    }
}
