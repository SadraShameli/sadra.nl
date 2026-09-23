import { type Plan } from '~/lib/prop-calculator';

export function describeConsistencyBadge(plan: Plan): null | string {
    const evalLabel = plan.isInstantFunded
        ? null
        : (plan.evalConsistencyRule()?.shareLabel() ?? null);
    const fundedLabel = plan.fundedConsistencyRule()?.shareLabel() ?? null;
    if (evalLabel === fundedLabel) return evalLabel;
    const parts = [
        ...(evalLabel === null ? [] : [`Eval ${evalLabel}`]),
        ...(fundedLabel === null ? [] : [`Funded ${fundedLabel}`]),
    ];
    return parts.join(' · ');
}
