import { dollars } from '~/lib/prop-calculator';
import {
    type DailyPlanCard,
    DayStopReason,
    type PayoutAdvice,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

const FIXTURE_CUSHION = dollars(2000);

export function dailyPlanCardOf(
    overrides: Partial<DailyPlanCard> = {},
): DailyPlanCard {
    return {
        consistencyNote: null,
        cushion: FIXTURE_CUSHION,
        dailyLossCap: {
            amount: FIXTURE_CUSHION,
            constraint: SizingConstraint.CushionCap,
        },
        dailyLossRoom: null,
        dailyProfitCeiling: null,
        maxTradesPerWindow: 1,
        oneContractRisk: null,
        profitCeiling: null,
        rungPlacements: [],
        rungs: [],
        stopCappedBy: [],
        stopReason: DayStopReason.MaxTrades,
        valueAfterLoss: null,
        valueAfterWin: null,
        valueNow: null,
        ...overrides,
    };
}

export function payoutAdviceOf(
    overrides: Partial<PayoutAdvice> & Pick<PayoutAdvice, 'documented'>,
): PayoutAdvice {
    return {
        assumptions: [],
        caps: [],
        engineHorizonCredit: null,
        netAfterSplit: null,
        ruleCappedWithdrawable: null,
        ...overrides,
    };
}
