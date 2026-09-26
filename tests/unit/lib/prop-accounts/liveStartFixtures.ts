import { ALL_FIRMS, type Plan, type TradingFirm } from '~/lib/prop-calculator';
import {
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/advisor';

export interface DocumentedLiveStartEntry {
    readonly firm: TradingFirm;
    readonly highestStart: number;
    readonly lowestStart: number;
    readonly plan: Plan;
}

export function documentedLiveStartEntry(): DocumentedLiveStartEntry {
    for (const firm of ALL_FIRMS) {
        for (const plan of firm.plans) {
            const applicability = livePlanApplicability(plan.id);
            if (
                plan.isInstantFunded ||
                applicability.kind !== LiveApplicabilityKind.Builder
            ) {
                continue;
            }
            const range = applicability.documentedStart?.(plan.accountSize);
            if (range !== undefined) {
                return {
                    firm,
                    highestStart: range.highest,
                    lowestStart: range.lowest,
                    plan,
                };
            }
        }
    }
    throw new Error('no plan with a documented live start');
}
