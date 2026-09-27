import {
    type AccountState,
    CENTS_PER_DOLLAR,
    dollars,
    type FundedCycleTracker,
    minimumPayoutRequest,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type FundedPayoutRuleContext,
    type PayoutBlockReason,
    payoutReadiness,
    PayoutReadinessKind,
    type PayoutWait,
    type ReconstructedFundedOrEvalAccount,
    retainedCushionForStage,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { type UsdCents, usdCentsFromDollars } from '../core';
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
    readonly personalRequestOverride?: null | number;
    readonly personalRetainedCushion?: null | number;
}

export interface PayoutReadinessBlockedRow {
    readonly accountId: string;
    readonly asOf: string;
    readonly kind: PayoutReadinessRowKind.Blocked;
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

export function fundedPayoutRuleContextOf(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    personalRetainedCushion: null | number,
): FundedPayoutRuleContext {
    return {
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion:
            personalRetainedCushion == null
                ? null
                : dollars(personalRetainedCushion),
        plan,
        stage: SizingStage.Funded,
        state,
        tracker,
    };
}

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
    const minimum = minimumPayoutRequest(plan);
    return minimum > rawRequest
        ? {
              minimumRequestAmountCents: usdCentsFromDollars(minimum),
              requestedAmountCents: usdCentsFromDollars(rawRequest),
          }
        : null;
}

function fundedRowOf(
    rulebook: RulebookParameters,
    accountId: string,
    asOf: string,
    plan: Plan,
    account: ReconstructedFundedOrEvalAccount,
    override: PayoutReadinessAccountOverride | undefined,
): PayoutReadinessRow {
    const { fundedTracker: tracker, state } = account;
    if (tracker === null) {
        throw new Error(
            'a funded reconstructed account is missing its funded cycle tracker',
        );
    }
    const ruleContext = fundedPayoutRuleContextOf(
        plan,
        state,
        tracker,
        override?.personalRetainedCushion ?? null,
    );
    const { amount: minRetainedCushion } = retainedCushionForStage(
        rulebook,
        ruleContext,
    );
    const rawRequest =
        override?.personalRequestOverride ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const readiness = payoutReadiness(plan, state, tracker, {
        minRetainedCushion,
        payoutRequestSize: rawRequest,
        statePendingPayoutsNetted: true,
    });
    switch (readiness.kind) {
        case PayoutReadinessKind.Blocked: {
            return {
                accountId,
                asOf,
                kind: PayoutReadinessRowKind.Blocked,
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
