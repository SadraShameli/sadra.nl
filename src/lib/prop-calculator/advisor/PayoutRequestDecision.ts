import { type Dollars } from '~/lib/prop-calculator/core';

import { type PayoutBlockReason } from './PayoutBlockReason';
import { type PayoutWait } from './PayoutReadiness';
import { type RuleSource } from './RuleSource';

export enum PayoutRequestDecisionKind {
    NotEligible = 'not-eligible',
    Request = 'request',
    Unreachable = 'unreachable',
    Wait = 'wait',
}

export enum PayoutRequestNotice {
    FirmMinimumAboveRequest = 'firm-minimum-above-request',
}

export enum RetainedCushionBasis {
    HardRule2Default = 'hard-rule-2-default',
    LiveOneDrawdown = 'live-one-drawdown',
    PersonalOverride = 'personal-override',
    RulebookSize = 'rulebook-size',
}

export interface FirmMinimumAboveRequestNotice {
    readonly kind: PayoutRequestNotice.FirmMinimumAboveRequest;
    readonly minimumRequestAmount: Dollars;
    readonly requestedAmount: Dollars;
}

export interface NotEligiblePayoutRequestDecision
    extends PayoutRequestDecisionBase {
    readonly kind: PayoutRequestDecisionKind.NotEligible;
    readonly reason: PayoutBlockReason;
}

export type PayoutRequestDecision =
    | NotEligiblePayoutRequestDecision
    | RequestPayoutDecision
    | UnreachablePayoutRequestDecision
    | WaitPayoutRequestDecision;

export interface RequestPayoutDecision extends PayoutRequestDecisionBase {
    readonly kind: PayoutRequestDecisionKind.Request;
    readonly notice: FirmMinimumAboveRequestNotice | null;
    readonly requestAmount: Dollars;
    readonly retainedCushion: Dollars;
    readonly retainedCushionBasis: RetainedCushionBasis;
}

export interface UnreachablePayoutRequestDecision
    extends PayoutRequestDecisionBase {
    readonly kind: PayoutRequestDecisionKind.Unreachable;
}

export interface WaitPayoutRequestDecision extends PayoutRequestDecisionBase {
    readonly kind: PayoutRequestDecisionKind.Wait;
    readonly wait: PayoutWait;
}

interface PayoutRequestDecisionBase {
    readonly sources: readonly RuleSource[];
}
