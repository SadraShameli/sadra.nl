import {
    type AccountState,
    type ComputeRisk,
    type Dollars,
    dollars,
    floorToWholeCents,
    ONE_CENT,
    oneContractRisk,
    type Plan,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';

import { createDocumentedRule } from '../createDocumentedRule';
import {
    type NextTrade,
    NextTradeKind,
    SizingConstraint,
} from '../DocumentedSizing';
import { type RulebookParameters } from '../Rulebook';
import {
    type DayProgress,
    type EvalRuleContext,
    type FundedRuleContext,
    type PlanPhaseStage,
    ruleContextAt,
    type RuleContextCaps,
} from '../RuleContext';
import { SizingStage } from '../SizingStage';
import { type EnginePolicy } from './EnginePolicy';

export enum DocumentedPolicyDisclosure {
    CommissionCoveredTarget = 'commission-covered-target',
    DayStartContext = 'day-start-context',
    PersonalCapsNotSimulated = 'personal-caps-not-simulated',
    PostTargetSmallestPlaceableRisk = 'post-target-smallest-placeable-risk',
}

const SMALLEST_UNSIZED_RISK = dollars(1);

export const DOCUMENTED_POLICY_DISCLOSURE_TEXT: Readonly<
    Record<DocumentedPolicyDisclosure, string>
> = {
    [DocumentedPolicyDisclosure.CommissionCoveredTarget]:
        'With a commission above zero, a simulated evaluation trade capped by the target left is sized so that its win also pays the commission of every trade placed that day plus a cent of rounding, so the net profit reaches the target; this trade can be a few dollars above the commission-free documented rung.',
    [DocumentedPolicyDisclosure.DayStartContext]:
        'Each simulated day sizes from the cushion, daily loss room and target left at the day start, then follows the rule through that day; an intraday-trailing floor that moves during the day is not re-read until the next day.',
    [DocumentedPolicyDisclosure.PersonalCapsNotSimulated]:
        'Simulated documented numbers use the rulebook only; personal caps such as a personal daily loss limit are not applied to them.',
    [DocumentedPolicyDisclosure.PostTargetSmallestPlaceableRisk]:
        'Once the evaluation target is reached but the pass is still waiting on days or consistency, the simulation places one trade a day at the smallest placeable risk: one contract of the engine instrument at its stop, or $1 without one.',
};

interface DayMemo {
    readonly context: EvalRuleContext | FundedRuleContext;
    readonly isPastTarget: boolean;
    lastTodayPnL: number;
    progress: DayProgress;
    tradesSeen: number;
}

export function documentedDayRisk(
    plan: Plan,
    stage: PlanPhaseStage,
    rulebook: RulebookParameters,
    policy: EnginePolicy,
): ComputeRisk {
    const rule = createDocumentedRule(stage, rulebook);
    const caps: RuleContextCaps = {
        instrument: policy.instrument ?? null,
        personalDll: null,
    };
    const commission = policy.commissionPerRoundTrip;
    const roundingPad = rulebook.strategy.rr * ONE_CENT;
    const smallestRisk = smallestPlaceableRisk(policy);
    const memos = new WeakMap<AccountState, DayMemo>();
    const coveredTrade = (memo: DayMemo, first?: NextTrade): number => {
        const cover =
            commission > 0
                ? commission * (memo.tradesSeen + 1) + roundingPad
                : 0;
        const trade =
            cover === 0 && first !== undefined
                ? first
                : rule.nextTrade(
                      withTargetCover(memo.context, cover),
                      memo.progress,
                  );
        return riskOf(trade);
    };
    return (state, tradeIndexToday) => {
        if (tradeIndexToday === 0) {
            const context = ruleContextAt(plan, stage, state, caps);
            const progress = freshDay();
            const first = rule.nextTrade(context, progress);
            const memo: DayMemo = {
                context,
                isPastTarget: isTargetReached(first),
                lastTodayPnL: state.todayPnL,
                progress,
                tradesSeen: 0,
            };
            memos.set(state, memo);
            return memo.isPastTarget ? smallestRisk : coveredTrade(memo, first);
        }
        const memo = memos.get(state);
        if (memo?.tradesSeen !== tradeIndexToday - 1) {
            throw new Error(
                `documented day risk: trade index ${tradeIndexToday} arrived without trade index ${tradeIndexToday - 1} of the same day`,
            );
        }
        recordTrade(memo, state.todayPnL, commission);
        return memo.isPastTarget ? 0 : coveredTrade(memo);
    };
}

function freshDay(): DayProgress {
    return {
        dayPnL: dollars(0),
        losses: 0,
        runningLoss: dollars(0),
        wins: 0,
    };
}

function isTargetReached(trade: NextTrade): boolean {
    return (
        trade.kind === NextTradeKind.Stop &&
        trade.cappedBy.includes(SizingConstraint.RemainingTargetCap)
    );
}

function recordTrade(
    memo: DayMemo,
    todayPnL: number,
    commission: number,
): void {
    const rawGross = todayPnL - memo.lastTodayPnL + commission;
    const gross = floorToWholeCents(rawGross);
    const { dayPnL, losses, runningLoss, wins } = memo.progress;
    memo.progress =
        rawGross > 0
            ? {
                  dayPnL: dollars(dayPnL + gross),
                  losses,
                  runningLoss,
                  wins: wins + 1,
              }
            : {
                  dayPnL: dollars(dayPnL + gross),
                  losses: losses + 1,
                  runningLoss: dollars(runningLoss - gross),
                  wins,
              };
    memo.lastTodayPnL = todayPnL;
    memo.tradesSeen += 1;
}

function riskOf(trade: NextTrade): number {
    switch (trade.kind) {
        case NextTradeKind.Stop: {
            return 0;
        }
        case NextTradeKind.Trade: {
            return trade.rung.risk;
        }
    }
}

function smallestPlaceableRisk(policy: EnginePolicy): Dollars {
    const positionSizing = resolvePositionSizing(
        policy.instrument,
        policy.stopPoints,
    );
    return positionSizing === null
        ? SMALLEST_UNSIZED_RISK
        : dollars(oneContractRisk(positionSizing));
}

function withTargetCover(
    context: EvalRuleContext | FundedRuleContext,
    cover: number,
): EvalRuleContext | FundedRuleContext {
    switch (context.stage) {
        case SizingStage.Eval: {
            return {
                ...context,
                remainingProfitToTarget: dollars(
                    context.remainingProfitToTarget + cover,
                ),
            };
        }
        case SizingStage.Funded: {
            return context;
        }
    }
}
