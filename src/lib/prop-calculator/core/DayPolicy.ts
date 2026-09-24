import { z } from 'zod';

import { type AccountState } from './AccountState';
import { type Fraction0to1 } from './lib/units';

export enum DayStopRuleKind {
    AfterKLosses = 'after-k-losses',
    AfterTarget = 'after-target',
    DayGreen = 'day-green',
    FirstWin = 'first-win',
    None = 'none',
}

export enum RungSizing {
    CapToCushion = 'capToCushion',
    SkipIfUnaffordable = 'skipIfUnaffordable',
}

export type ComputeRisk = (
    state: AccountState,
    tradeIndexToday: number,
    fundedCycle?: FundedCycleSnapshot,
) => number;

export interface DayPolicy {
    readonly computeRisk?: ComputeRisk;
    readonly ladder: readonly number[];
    readonly maxLossesPerDay: null | number;
    readonly stopRule: DayStopRule;
}

export type DayStopRule =
    | { dollars: number; kind: DayStopRuleKind.AfterTarget }
    | { k: number; kind: DayStopRuleKind.AfterKLosses }
    | { kind: DayStopRuleKind.DayGreen }
    | { kind: DayStopRuleKind.FirstWin }
    | { kind: DayStopRuleKind.None };

export interface FundedCycleSnapshot {
    readonly cycleBestDayProfit: number;
    readonly dayGateProgress: number;
    readonly lastPayoutBalance: number;
    readonly payoutsIssued: number;
}

export const DEFAULT_RUNG_SIZING: RungSizing = RungSizing.CapToCushion;

export const stopLossCountSchema = z.number().int().positive();

export const stopTargetDollarsSchema = z.number().positive();

export const ladderRungSchema = z.number().nonnegative();

export const ladderRungsSchema = z
    .array(ladderRungSchema)
    .min(1)
    .superRefine((rungs, context) => {
        if (rungs[0] === 0) {
            context.addIssue({
                code: 'custom',
                message: 'the first rung must be > 0 (a $0 rung ends the day)',
            });
            return;
        }
        const firstZero = rungs.indexOf(0);
        const revived =
            firstZero === -1
                ? -1
                : rungs.findIndex(
                      (rung, index) => index > firstZero && rung > 0,
                  );
        if (revived !== -1) {
            context.addIssue({
                code: 'custom',
                message: `rung ${revived + 1} follows a $0 rung and would never trade`,
            });
        }
    });

export const PNL_ONLY_STOP_RULE_KINDS: Record<DayStopRuleKind, boolean> = {
    [DayStopRuleKind.AfterKLosses]: false,
    [DayStopRuleKind.AfterTarget]: true,
    [DayStopRuleKind.DayGreen]: true,
    [DayStopRuleKind.FirstWin]: false,
    [DayStopRuleKind.None]: true,
};

export function canonicaliseLadder(ladder: readonly number[]): number[] {
    const out: number[] = [];
    for (const rung of ladder) {
        if (rung <= 0) break;
        out.push(rung);
    }
    return out;
}

export function computedDayPolicy(
    computeRisk: ComputeRisk,
    maxTrades: number,
    stopRule?: DayStopRule,
): DayPolicy {
    const slots = Math.max(1, Math.floor(maxTrades));
    return {
        computeRisk,
        ladder: Array.from({ length: slots }, () => 0),
        maxLossesPerDay: null,
        stopRule: stopRule ?? { kind: DayStopRuleKind.None },
    };
}

export function flatDayPolicy(
    riskPerTrade: number,
    tradesPerDay: number,
    stopRule?: DayStopRule,
): DayPolicy {
    const slots = Math.max(1, Math.floor(tradesPerDay));
    return {
        ladder: Array.from({ length: slots }, () => riskPerTrade),
        maxLossesPerDay: null,
        stopRule: stopRule ?? { kind: DayStopRuleKind.None },
    };
}

export function isFlatLadder(ladder: readonly number[]): boolean {
    const first = ladder[0];
    return first === undefined || ladder.every((rung) => rung === first);
}

export function ladderSum(ladder: readonly number[]): number {
    let total = 0;
    for (const rung of ladder) {
        if (rung <= 0) break;
        total += rung;
    }
    return total;
}

export function resolveAffordableRisk(
    cushion: number,
    dailyLossLimit: null | number,
    todayPnL: number,
    commission: number,
): number {
    return dailyLossLimit === null
        ? cushion
        : Math.min(cushion, dailyLossLimit - commission + todayPnL);
}

export function resolveFundedTradeRisk(
    cushion: number,
    percent: Fraction0to1,
): number {
    return percent * cushion;
}

export function resolveTradeRisk(
    intendedRisk: number,
    cushion: number,
    rungSizing: RungSizing,
): number {
    if (intendedRisk <= 0 || cushion <= 0) return 0;
    if (rungSizing === RungSizing.SkipIfUnaffordable) {
        return cushion < intendedRisk ? 0 : intendedRisk;
    }
    return Math.min(intendedRisk, cushion);
}

export function shouldStopDay(
    rule: DayStopRule,
    hasWon: boolean,
    lossesToday: number,
    pnlToday: number,
): boolean {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return lossesToday >= rule.k;
        }
        case DayStopRuleKind.AfterTarget: {
            return pnlToday >= rule.dollars;
        }
        case DayStopRuleKind.DayGreen: {
            return pnlToday > 0;
        }
        case DayStopRuleKind.FirstWin: {
            return hasWon;
        }
        case DayStopRuleKind.None: {
            return false;
        }
    }
}
