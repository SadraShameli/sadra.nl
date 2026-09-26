import { type Plan } from '~/lib/prop-calculator';
import { planConsistencyLabels } from '~/lib/prop-calculator/describe';

export function describeConsistencyBadge(plan: Plan): null | string {
    const { eval: evalLabel, funded: fundedLabel } =
        planConsistencyLabels(plan);
    if (evalLabel === fundedLabel) return evalLabel;
    const parts = [
        ...(evalLabel === null ? [] : [`Eval ${evalLabel}`]),
        ...(fundedLabel === null ? [] : [`Funded ${fundedLabel}`]),
    ];
    return parts.join(' · ');
}
