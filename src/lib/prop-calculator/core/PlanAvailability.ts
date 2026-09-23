export enum PlanAvailability {
    CallUpOnly = 'call-up-only',
    Purchasable = 'purchasable',
}

export const PLAN_AVAILABILITY_LABEL: Record<PlanAvailability, string> = {
    [PlanAvailability.CallUpOnly]: 'call-up only',
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
