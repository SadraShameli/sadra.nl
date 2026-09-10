import {
    type DayPolicy,
    type DayStopRule,
    type RungSizing,
} from '../core/DayPolicy';
import { type CouponDiscounts } from '../core/FeeSchedule';
import { type InstrumentSymbol } from '../core/Instruments';
import { type Plan } from '../core/Plan';
import { type PositionSizingConfig } from '../core/PositionSizing';
import { type Dollars, type Fraction0to1 } from '../core/units';
import { type Rng } from '../rng';

export const DEFAULT_DAY_BUDGET = 252;
export const DEFAULT_MAX_PAYOUTS_PER_CARD = 6;

export interface AccountTimelineInputs {
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    instrument?: InstrumentSymbol;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
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
    cardsRun: number;
    cumulativeNet: Float64Array;
    cumulativePayout: Float64Array;
    cumulativeSpend: Float64Array;
}

export interface CardResult {
    attemptsUsed: number;
    payouts: readonly PayoutEvent[];
    totalCost: number;
    totalDays: number;
}

export interface EvalToFundedCycleOptions {
    commission: Dollars;
    discounts: CouponDiscounts | undefined;
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
    maxEvalDays: number;
    maxFundedDays: number;
    maxPayoutsPerCard?: number;
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
    instrument?: InstrumentSymbol;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
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
