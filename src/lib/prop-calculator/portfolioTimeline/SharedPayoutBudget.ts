import { LifetimeCapScope, type Plan } from '~/lib/prop-calculator/core/Plan';

export interface SharedPayoutBudget {
    remaining: number;
}

export function drawFromPayoutBudget(
    budget: null | SharedPayoutBudget,
    amount: number,
): number {
    if (budget === null) return amount;
    const drawn = Math.max(0, Math.min(amount, budget.remaining));
    budget.remaining -= drawn;
    return drawn;
}

export function pooledLifetimePayoutBudget(
    plan: Plan,
): null | SharedPayoutBudget {
    const cap = plan.maxLifetimePayoutDollars;
    return cap === null ||
        plan.lifetimeConclusion.dollarCapScope !==
            LifetimeCapScope.PerUserAcrossVariant
        ? null
        : { remaining: cap };
}
