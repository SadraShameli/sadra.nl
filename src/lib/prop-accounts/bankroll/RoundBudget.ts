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

export function willExceedRoundBudget(
    budgetCents: null | number,
    spentCents: number,
    additionalCents: number,
): boolean {
    return budgetCents !== null && spentCents + additionalCents > budgetCents;
}
