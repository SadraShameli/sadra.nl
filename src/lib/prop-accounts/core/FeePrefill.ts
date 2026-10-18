import {
    activationFee,
    fundedResetFee,
    initialEvalFee,
    monthlySubscriptionFee,
    type Plan,
    resetFee,
    RetryKind,
} from '~/lib/prop-calculator';

import { FeeKind } from './FeeKind';
import { usdCents, type UsdCents, usdCentsFromDollars } from './UsdCents';

export type FeePrefillPlan = Pick<Plan, 'fees' | 'fundedReset'>;

const DEFAULT_KIND_ORDER = [FeeKind.EvalPurchase, FeeKind.Subscription];

export function feePrefillCents(
    plan: FeePrefillPlan,
    kind: FeeKind,
): null | UsdCents {
    switch (kind) {
        case FeeKind.Activation: {
            return listPrice(activationFee(plan.fees));
        }
        case FeeKind.EvalPurchase:
        case FeeKind.Rebuy: {
            return listPrice(initialEvalFee(plan.fees));
        }
        case FeeKind.FundedReset: {
            return plan.fundedReset === null
                ? null
                : listPrice(fundedResetFee(plan.fundedReset, undefined));
        }
        case FeeKind.Other: {
            return null;
        }
        case FeeKind.Refund: {
            return usdCents(0);
        }
        case FeeKind.Reset: {
            return plan.fees.retry === RetryKind.Rebuy
                ? null
                : listPrice(resetFee(plan.fees));
        }
        case FeeKind.Subscription: {
            return listPrice(monthlySubscriptionFee(plan.fees));
        }
    }
}

export function feePrefillDefaultKind(plan: FeePrefillPlan): FeeKind {
    return (
        DEFAULT_KIND_ORDER.find(
            (kind) => feePrefillCents(plan, kind) !== null,
        ) ?? FeeKind.EvalPurchase
    );
}

function listPrice(dollars: number): null | UsdCents {
    return dollars > 0 ? usdCentsFromDollars(dollars) : null;
}
