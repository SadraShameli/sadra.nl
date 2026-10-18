import { formatPercent } from '~/lib/format';
import { totalRoiOnCost } from '~/lib/prop-calculator';

export function cashFlowRoiOnSpend(
    finalNet: number,
    finalSpend: number,
): null | string {
    const { value } = totalRoiOnCost(finalNet, finalSpend);
    return value === null ? null : formatPercent(value);
}
