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
    | PayoutGate.AccountConcluded
    | PayoutGate.LadderExhausted
    | PayoutGate.LifetimeDollarCapReached;

export interface AccountConclusionSource {
    readonly maxLifetimePayoutDollars: Dollars | null;
    readonly maxLifetimePayouts: null | number;
    readonly payoutLadder: null | Pick<
        PayoutLadder,
        'capsAtLastStep' | 'steps'
    >;
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
    if (source.maxLifetimePayouts !== null) {
        return payoutsIssued >= source.maxLifetimePayouts
            ? PayoutGate.AccountConcluded
            : null;
    }
    const ladder = source.payoutLadder;
    return ladder !== null &&
        ladder.capsAtLastStep !== true &&
        payoutsIssued >= ladder.steps.length
        ? PayoutGate.LadderExhausted
        : null;
}
