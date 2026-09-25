import {
    type DayPolicy,
    type DayStopRule,
    type RungSizing,
} from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type FundedResetCharge } from '../core/FundedReset';
import { type InstrumentSymbol } from '../core/Instruments';
import { type Dollars, type Fraction0to1 } from '../core/lib/units';
import { type Plan } from '../core/Plan';
import { type PositionSizingConfig } from '../core/PositionSizing';
import { type Rng } from '../rng';

export { TRADING_DAYS_PER_YEAR as DEFAULT_DAY_BUDGET } from '../core/constants';

export interface AccountTimelineInputs {
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    idleDayProbability?: number;
    initialPurchaseDiscounts?: CouponDiscounts;
    instrument?: InstrumentSymbol;
    maxEvalDays: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rng: Rng;
    rrRatio: number;
    rungSizing?: RungSizing;
    stopPoints?: number;
    tradesPerDay: number;
    winrate: number;
}

export interface AccountTimelineResult {
    cumulativeNet: Float64Array;
    cumulativePayout: Float64Array;
    cumulativeSpend: Float64Array;
}

export interface CardResult {
    attemptsUsed: number;
    evalCost: number;
    evalDays: number;
    fundedResetCharges: readonly FundedResetCharge[];
    payouts: readonly PayoutEvent[];
    totalDays: number;
}

export interface EvalToFundedCycleOptions {
    commission: Dollars;
    discounts: CouponDiscounts | undefined;
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
    idleDayProbability?: number;
    maxEvalDays: number;
    maxFundedDays: number;
    minRetainedCushion: Dollars;
    payoutRequestSize: Dollars | undefined;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: Fraction0to1;
}

export interface PayoutEvent {
    amount: number;
    dayOffset: number;
}

export interface PortfolioTimelineInputs {
    accounts: number;
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    idleDayProbability?: number;
    instrument?: InstrumentSymbol;
    maxEvalDays: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing?: RungSizing;
    seed: number;
    stopPoints?: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export interface PortfolioTimelineResult {
    accountsSimulated: number;
    breakEvenMonthValues: number[];
    days: number[];
    netP10: number[];
    netP50: number[];
    netP90: number[];
    payoutP10: number[];
    payoutP50: number[];
    payoutP90: number[];
    pEverCashflowPositive: number;
    spendP10: number[];
    spendP50: number[];
    spendP90: number[];
}
