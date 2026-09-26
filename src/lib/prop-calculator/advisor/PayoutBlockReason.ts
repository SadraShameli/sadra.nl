import { type PayoutGate } from '../core';

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
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly triggerAtPayoutCount: number;
}

export type PayoutBlockReason =
    | GatePayoutBlockReason
    | PayoutPendingBlockReason
    | WouldTriggerLiveBlockReason;

export interface PayoutPendingBlockReason {
    readonly kind: PayoutBlockReasonKind.PayoutPending;
}

export interface WouldTriggerLiveBlockReason {
    readonly kind: PayoutBlockReasonKind.WouldTriggerLive;
    readonly trigger: LiveTriggerInfo;
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
