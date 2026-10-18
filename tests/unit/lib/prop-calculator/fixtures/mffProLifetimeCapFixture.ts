import {
    DayStopRuleKind,
    FirmId,
    MffuVariant,
    type Plan,
    type SimInputs,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

export interface MffProLifetimeCapFixture {
    readonly cap: number;
    readonly plan: Plan;
}

export function mffProLifetimeCapFixture(): MffProLifetimeCapFixture {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('MFF Pro plan not found');
    const cap = plan.maxLifetimePayoutDollars;
    if (cap === null) throw new Error('MFF Pro has no lifetime dollar cap');
    return { cap, plan };
}

export const WINNING_TRADER_BASE: Omit<SimInputs, 'plan'> = {
    dayStop: { kind: DayStopRuleKind.None },
    fundedHorizonDays: 120,
    maxEvalDays: 150,
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 1,
    trials: 1,
    winrate: 1,
};

export const WINNING_TRADER: Omit<SimInputs, 'plan'> = {
    ...WINNING_TRADER_BASE,
    copyAccounts: 3,
};
