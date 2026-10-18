export enum PlanAvailability {
    CallUpOnly = 'call-up-only',
    Discontinued = 'discontinued',
    Purchasable = 'purchasable',
}

export const PLAN_AVAILABILITY_LABEL: Record<PlanAvailability, string> = {
    [PlanAvailability.CallUpOnly]: 'call-up only',
    [PlanAvailability.Discontinued]: 'no longer sold',
    [PlanAvailability.Purchasable]: 'purchasable',
};

export function rankablePlans<T extends { readonly isPurchasable: boolean }>(
    plans: readonly T[],
    shouldIncludeCallUp: boolean,
): T[] {
    return shouldIncludeCallUp
        ? [...plans]
        : plans.filter((plan) => plan.isPurchasable);
}
