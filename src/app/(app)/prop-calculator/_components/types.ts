import {
    type CorrelationMode,
    type DayPolicy,
    type DayStopRule,
    type FirmId,
    type Plan,
    type PlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

export enum ChartType {
    DaysToPassHistogram = 'days-to-pass-hist',
    Drawdown = 'drawdown',
    Equity = 'equity',
    FinalBalanceHistogram = 'final-balance-hist',
    PassRate = 'pass-rate',
}

export enum SizingMode {
    Dollar = 'dollar',
    Percent = 'percent',
}

export interface CalculatorState {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    copyAccounts: number;
    dayStop: DayStopRule;
    evalDayPolicy: DayPolicy | null;
    evalDiscountPercent: number;
    firm: TradingFirm;
    firmMemory: FirmMemory;
    fundedHorizonDays: number;
    labScenarios: LabScenario[];
    linkActivationDiscount: boolean;
    maxAttempts: number;
    maxEvalDays: number;
    plan: Plan;
    portfolio: PortfolioEntry[];
    riskDollars: number;
    riskPercent: number;
    rrRatio: number;
    seed: number;
    sizingMode: SizingMode;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export type FirmMemory = Partial<Record<FirmId, FirmMemoryEntry>>;

export interface FirmMemoryEntry {
    copyAccounts: number;
    planId: PlanId;
}

export interface LabScenario {
    accounts: number;
    correlation: CorrelationMode;
    dayStop: DayStopRule;
    groups: number;
    id: string;
    label: string;
    riskPerTrade: number;
    rrRatio: number;
    tradesPerDay: number;
    winrate: number;
}

export interface PortfolioEntry {
    activationDiscountPercent: number;
    count: number;
    evalDiscountPercent: number;
    firmId: FirmId;
    id: string;
    linkActivationDiscount: boolean;
    planId: PlanId;
}

export {
    type CorrelationMode,
    type DayStopRule,
    type MultiAccountResult,
} from '~/lib/prop-calculator';
