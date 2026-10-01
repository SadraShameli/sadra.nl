import { type DayStopRule, type Dollars, type Points } from '~/lib/prop-calculator/core';

import { type RuleSource } from './RuleSource';

export const NO_COMMISSION = 0;

export enum DailyProfitCapKind {
    HardCeiling = 'hard-ceiling',
    StopTrigger = 'stop-trigger',
}

export enum DayStopReason {
    CeilingReached = 'ceiling-reached',
    LadderExhausted = 'ladder-exhausted',
    MaxTrades = 'max-trades',
    NoLossRoom = 'no-loss-room',
    StopRule = 'stop-rule',
}

export enum NextTradeKind {
    Stop = 'stop',
    Trade = 'trade',
}

export enum SizingAssumption {
    LiveDayPolicyUndocumented = 'live-day-policy-undocumented',
    NoCommission = 'no-commission',
    NoProfitCeiling = 'no-profit-ceiling',
    RungsAssumeEarlierLosses = 'rungs-assume-earlier-losses',
    WinsAddNoLossRoom = 'wins-add-no-loss-room',
}

export enum SizingConstraint {
    CeilingCap = 'ceiling-cap',
    ConsistencyCap = 'consistency-cap',
    CushionCap = 'cushion-cap',
    DailyLossCap = 'daily-loss-cap',
    DailyProfitCap = 'daily-profit-cap',
    NoCushion = 'no-cushion',
    PersonalCap = 'personal-cap',
    RemainingTargetCap = 'remaining-target-cap',
}

export enum SizingProvenance {
    FundedFixedRisk = 'Hard Rule 5 fixed risk and take profit',
    GeneralDerivation = 'General derivation for any plan',
    LiveCushionPercent = 'Live account percent of cushion',
    MaxRisk = 'Hard Rules 3 and 4 max risk with a daily cap',
    MffRapidEodSearch = 'from the MFF Rapid EOD 50K search, extrapolated to this plan',
}

export interface CappedAmount {
    readonly amount: Dollars;
    readonly constraint: SizingConstraint;
}

export type DailyProfitCap =
    | {
          readonly ceiling: Dollars;
          readonly kind: DailyProfitCapKind.HardCeiling;
      }
    | {
          readonly kind: DailyProfitCapKind.StopTrigger;
          readonly stopAfter: Dollars;
      };

export interface DocumentedRung {
    readonly cappedBy: readonly SizingConstraint[];
    readonly risk: Dollars;
    readonly runningLossAfter: Dollars;
    readonly runningLossBefore: Dollars;
    readonly takeProfit: Dollars;
}

export interface DocumentedSizing extends SizingTerms {
    readonly constraints: readonly SizingConstraint[];
    readonly minStopPointsAtCap: null | Points;
    readonly rungs: readonly DocumentedRung[];
}

export type NextTrade =
    | {
          readonly cappedBy: readonly SizingConstraint[];
          readonly kind: NextTradeKind.Stop;
          readonly reason: DayStopReason;
      }
    | { readonly kind: NextTradeKind.Trade; readonly rung: DocumentedRung };

export interface PlannedRisk {
    readonly amount: Dollars;
    readonly cappedBy: readonly SizingConstraint[];
}

export interface SizingTerms {
    readonly assumptions: readonly SizingAssumption[];
    readonly dailyProfitCap: DailyProfitCap | null;
    readonly maxTrades: number;
    readonly profitCeiling: CappedAmount | null;
    readonly provenance: SizingProvenance;
    readonly rewardMultiple: number;
    readonly sources: readonly RuleSource[];
    readonly stopRule: DayStopRule;
}

export function hardProfitCeiling(cap: DailyProfitCap | null): Dollars | null {
    if (cap === null) return null;
    switch (cap.kind) {
        case DailyProfitCapKind.HardCeiling: {
            return cap.ceiling;
        }
        case DailyProfitCapKind.StopTrigger: {
            return null;
        }
    }
}
