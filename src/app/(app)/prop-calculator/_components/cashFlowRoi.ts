import { formatPercent } from '~/lib/format';
import { totalRoiOnCost } from '~/lib/prop-calculator';

import { type KpiAccent, roiAccent } from './kpiAccent';

export interface CashFlowRoiDisplay {
    accent: KpiAccent;
    text: null | string;
}

export function cashFlowRoiOnSpend(
    finalNet: number,
    finalSpend: number,
): CashFlowRoiDisplay {
    const roi = totalRoiOnCost(finalNet, finalSpend);
    return {
        accent: roiAccent(roi),
        text: roi.value === null ? null : formatPercent(roi.value),
    };
}
