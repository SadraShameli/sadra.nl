import {
    AccountAction,
    type Advice,
    payoutBlockReasonFromGate,
    type PayoutReadiness,
    PayoutReadinessKind,
    PayoutRequestDecisionKind,
    PayoutWaitBasis,
} from '~/lib/prop-calculator/advisor';
import {
    accountActionOf,
    type AccountActionResult,
} from '~/lib/prop-calculator/advisor/actions';
import { PayoutGate } from '~/lib/prop-calculator/core';

export const ACCOUNT_ACTION_TEXT: Readonly<Record<AccountAction, string>> = {
    [AccountAction.EnterSnapshot]: "Enter today's balance",
    [AccountAction.NotModeled]: 'Not modeled for this account',
    [AccountAction.RequestPayout]: 'Request payout',
    [AccountAction.Retire]: 'Retire this account',
    [AccountAction.StopForToday]: 'Stop for today',
    [AccountAction.Trade]: 'Trade at the documented rung',
};

export const PAYOUT_READY_LESSON_TEXT =
    'Reminder: do not risk the account across several trades for a bigger payout when you can withdraw now.';

const NON_REQUEST_FALLBACK_GATE = PayoutGate.NothingWithdrawable;

export function accountActionFor(advice: Advice): AccountActionResult {
    return accountActionOf(advice, payoutReadinessOfAdvice(advice), null, {
        retireOnSwitchBeatsKeep: false,
    });
}

function blockedBy(): PayoutReadiness {
    return {
        kind: PayoutReadinessKind.Blocked,
        reason: payoutBlockReasonFromGate(NON_REQUEST_FALLBACK_GATE),
        wait: null,
    };
}

function payoutReadinessOfAdvice(advice: Advice): PayoutReadiness {
    const payout = advice.payoutAdvice;
    if (payout === null) return blockedBy();
    const decision = payout.documented;
    switch (decision.kind) {
        case PayoutRequestDecisionKind.NotEligible: {
            return {
                kind: PayoutReadinessKind.Blocked,
                reason: decision.reason,
                wait: null,
            };
        }
        case PayoutRequestDecisionKind.Request: {
            return {
                kind: PayoutReadinessKind.Eligible,
                requestedAmount: decision.requestAmount,
                traderReceives: payout.netAfterSplit ?? 0,
            };
        }
        case PayoutRequestDecisionKind.Unreachable: {
            return blockedBy();
        }
        case PayoutRequestDecisionKind.Wait: {
            return {
                kind: PayoutReadinessKind.Blocked,
                reason: payoutBlockReasonFromGate(
                    waitGateOf(decision.wait.basis),
                ),
                wait: decision.wait,
            };
        }
    }
}

function waitGateOf(basis: PayoutWaitBasis): PayoutGate {
    switch (basis) {
        case PayoutWaitBasis.CalendarDays:
        case PayoutWaitBasis.QualifyingDays: {
            return PayoutGate.DayGateNotMet;
        }
        case PayoutWaitBasis.NoClosedForm: {
            return PayoutGate.BelowFullRequest;
        }
        case PayoutWaitBasis.Profit: {
            return PayoutGate.BelowMinPayoutProfit;
        }
    }
}
