import { type Dollars } from './lib/units';
import { type PayoutLadder } from './PayoutTiers';

export enum PayoutGate {
    AccountConcluded = 'account-concluded',
    BelowFullRequest = 'below-full-request',
    BelowMinPayoutProfit = 'below-min-payout-profit',
    BelowMinRequest = 'below-min-request',
    DayGateNotMet = 'day-gate-not-met',
    EarlyWithdrawalBelowFloor = 'early-withdrawal-below-floor',
    EarlyWithdrawalBelowMinimum = 'early-withdrawal-below-minimum',
    FundedConsistency = 'funded-consistency',
    LadderExhausted = 'ladder-exhausted',
    LadderStepUnaffordable = 'ladder-step-unaffordable',
    LifetimeDollarCapReached = 'lifetime-dollar-cap-reached',
    NothingWithdrawable = 'nothing-withdrawable',
}

export type AccountConclusionGate =
    LifetimePayoutCountGate | PayoutGate.LifetimeDollarCapReached;

export interface AccountConclusionSource {
    readonly maxLifetimePayoutDollars: Dollars | null;
    readonly maxLifetimePayouts: null | number;
    readonly payoutLadder: null | Pick<
        PayoutLadder,
        'capsAtLastStep' | 'steps'
    >;
}

export type LifetimePayoutCountGate =
    PayoutGate.AccountConcluded | PayoutGate.LadderExhausted;

export interface LifetimePayoutCountLimit {
    readonly count: number;
    readonly gate: LifetimePayoutCountGate;
}

export function accountConclusionGate(
    source: AccountConclusionSource,
    payoutsIssued: number,
    cumulativePayout: number,
): AccountConclusionGate | null {
    if (
        source.maxLifetimePayoutDollars !== null &&
        cumulativePayout >= source.maxLifetimePayoutDollars
    ) {
        return PayoutGate.LifetimeDollarCapReached;
    }
    const countLimit = lifetimePayoutCountLimit(source);
    return countLimit !== null && payoutsIssued >= countLimit.count
        ? countLimit.gate
        : null;
}

export function lifetimePayoutCountLimit(
    source: AccountConclusionSource,
): LifetimePayoutCountLimit | null {
    const ladderLength =
        source.payoutLadder === null ||
        source.payoutLadder.capsAtLastStep === true
            ? null
            : source.payoutLadder.steps.length;
    if (
        source.maxLifetimePayouts !== null &&
        (ladderLength === null || source.maxLifetimePayouts <= ladderLength)
    ) {
        return {
            count: source.maxLifetimePayouts,
            gate: PayoutGate.AccountConcluded,
        };
    }
    return ladderLength === null
        ? null
        : { count: ladderLength, gate: PayoutGate.LadderExhausted };
}
