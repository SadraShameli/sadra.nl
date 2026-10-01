import { AccountAction } from '~/lib/prop-calculator/advisor/AccountAction';
import { type Advice } from '~/lib/prop-calculator/advisor/Advice';
import { type PayoutReadiness, PayoutReadinessKind } from '~/lib/prop-calculator/advisor/PayoutReadiness';
import { RetireComparisonVerdict } from '~/lib/prop-calculator/advisor/value';

export interface AccountActionResult {
    readonly action: AccountAction;
    readonly retireVerdict: null | RetireComparisonVerdict;
}

export interface AccountActionSettings {
    readonly retireOnSwitchBeatsKeep: boolean;
}

export function accountActionOf(
    advice: Advice,
    readiness: PayoutReadiness,
    retireVerdict: null | RetireComparisonVerdict,
    settings: AccountActionSettings,
): AccountActionResult {
    if (advice.staleness.kind === 'stale') {
        return { action: AccountAction.EnterSnapshot, retireVerdict };
    }
    if (advice.documented === null) {
        return { action: AccountAction.NotModeled, retireVerdict };
    }
    if (readiness.kind === PayoutReadinessKind.Eligible) {
        return { action: AccountAction.RequestPayout, retireVerdict };
    }
    if (advice.dailyPlanCard !== null && advice.dailyPlanCard.rungs.length === 0) {
        return { action: AccountAction.StopForToday, retireVerdict };
    }
    const shouldRetire =
        retireVerdict === RetireComparisonVerdict.SwitchBeatsKeep &&
        settings.retireOnSwitchBeatsKeep;
    return {
        action: shouldRetire ? AccountAction.Retire : AccountAction.Trade,
        retireVerdict,
    };
}
