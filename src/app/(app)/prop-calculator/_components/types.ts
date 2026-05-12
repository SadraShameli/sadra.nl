import {
    type FirmId,
    type PlanId,
    type Plan,
    type PropFirm,
    type CorrelationMode,
    type DayStopRule,
    type MultiAccountResult,
} from '~/lib/prop-calculator';

export type { CorrelationMode, DayStopRule, MultiAccountResult };

export interface PortfolioEntryMemory {
    planId: PlanId;
    count: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
}

export interface PortfolioEntry {
    id: string;
    firmId: FirmId;
    planId: PlanId;
    count: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
    memory: Partial<Record<FirmId, PortfolioEntryMemory>>;
}

export enum SizingMode {
    Dollar = 'dollar',
    Percent = 'percent',
}

export enum ChartType {
    Equity = 'equity',
    Drawdown = 'drawdown',
    PassRate = 'pass-rate',
    FinalBalanceHistogram = 'final-balance-hist',
    DaysToPassHistogram = 'days-to-pass-hist',
}

export interface FirmMemoryEntry {
    planId: PlanId;
    copyAccounts: number;
}

export type FirmMemory = Partial<Record<FirmId, FirmMemoryEntry>>;

export interface LabScenario {
    id: string;
    label: string;
    riskPerTrade: number;
    winrate: number;
    rrRatio: number;
    tradesPerDay: number;
    accounts: number;
    correlation: CorrelationMode;
    groups: number;
    dayStop: DayStopRule;
}

export interface CalculatorState {
    firm: PropFirm;
    plan: Plan;
    winrate: number;
    rrRatio: number;
    tradesPerDay: number;
    sizingMode: SizingMode;
    riskDollars: number;
    riskPercent: number;
    seed: number;
    trials: number;
    maxEvalDays: number;
    fundedHorizonDays: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
    commissionPerRoundTrip: number;
    maxAttempts: number;
    copyAccounts: number;
    firmMemory: FirmMemory;
    dayStop: DayStopRule;
    labScenarios: LabScenario[];
}
