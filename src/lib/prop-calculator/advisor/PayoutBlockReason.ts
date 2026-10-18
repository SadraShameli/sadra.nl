import { type PayoutGate, type PolicyQuote } from '~/lib/prop-calculator/core';

export enum LiveTriggerScope {
    Account = 'account',
    Firm = 'firm',
}

export enum PayoutBlockReasonKind {
    Gate = 'gate',
    PayoutPending = 'payout-pending',
    WouldTriggerLive = 'would-trigger-live',
}

export interface GatePayoutBlockReason {
    readonly gate: PayoutGate;
    readonly kind: PayoutBlockReasonKind.Gate;
}

export interface LiveTriggerInfo {
    readonly payoutsTaken: number;
    readonly scope: LiveTriggerScope;
    readonly source?: PolicyCitation;
    readonly triggerAtPayoutCount: number;
}

export type PayoutBlockReason =
    | GatePayoutBlockReason
    | PayoutPendingBlockReason
    | WouldTriggerLiveBlockReason;

export interface PayoutPendingBlockReason {
    readonly kind: PayoutBlockReasonKind.PayoutPending;
}

export type PolicyCitation = Pick<PolicyQuote, 'fetchedOn' | 'quote' | 'url'>;

export interface WouldTriggerLiveBlockReason {
    readonly kind: PayoutBlockReasonKind.WouldTriggerLive;
    readonly trigger: LiveTriggerInfo;
}

export function liveTriggerCountText(trigger: LiveTriggerInfo): string {
    const counts = `${String(trigger.payoutsTaken)} of ${String(trigger.triggerAtPayoutCount)} payouts taken`;
    const text = `${counts} ${liveTriggerScopeText(trigger.scope)}`;
    return trigger.source === undefined
        ? text
        : `${text} (${policyCitationText(trigger.source)})`;
}

export function payoutBlockReasonFromGate(gate: PayoutGate): PayoutBlockReason {
    return { gate, kind: PayoutBlockReasonKind.Gate };
}

export function payoutPendingBlockReason(): PayoutBlockReason {
    return { kind: PayoutBlockReasonKind.PayoutPending };
}

export function wouldTriggerLiveBlockReason(
    trigger: LiveTriggerInfo,
): PayoutBlockReason {
    return { kind: PayoutBlockReasonKind.WouldTriggerLive, trigger };
}

function liveTriggerScopeText(scope: LiveTriggerScope): string {
    switch (scope) {
        case LiveTriggerScope.Account: {
            return 'on this account';
        }
        case LiveTriggerScope.Firm: {
            return "across the firm's accounts since the last live account";
        }
    }
}

function policyCitationText(source: PolicyCitation): string {
    return `source: ${source.url}, fetched ${source.fetchedOn}: "${source.quote}"`;
}
