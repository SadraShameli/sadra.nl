import { formatOptionalPercent } from '~/lib/format';
import { totalRoiOnCost } from '~/lib/prop-calculator';

import { type KpiAccent, roiAccent } from './kpiAccent';

export interface CashFlowRoiDisplay {
    accent: KpiAccent;
    text: string;
}

export function cashFlowRoiOnSpend(
    finalNet: number,
    finalSpend: number,
): CashFlowRoiDisplay {
    const roi = totalRoiOnCost(finalNet, finalSpend);
    return {
        accent: roiAccent(roi),
        text: formatOptionalPercent(roi.value),
    };
}
