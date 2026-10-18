export interface RoundBudgetStatus {
    readonly budgetCents: null | number;
    readonly isSpent: boolean;
    readonly remainingCents: null | number;
    readonly spentCents: number;
}

export function roundBudgetStatus(
    budgetCents: null | number,
    spentCents: number,
): RoundBudgetStatus {
    return {
        budgetCents,
        isSpent: budgetCents !== null && spentCents >= budgetCents,
        remainingCents: budgetCents === null ? null : budgetCents - spentCents,
        spentCents,
    };
}
