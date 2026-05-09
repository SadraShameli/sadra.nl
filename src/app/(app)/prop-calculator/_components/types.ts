import {
    type FirmId,
    type PlanId,
    type Plan,
    type PropFirm,
} from '~/lib/prop-calculator';

export interface PortfolioEntry {
    id: string;
    firmId: FirmId;
    planId: PlanId;
    count: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
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
}
