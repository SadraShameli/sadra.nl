import { createDocumentedRule } from '~/lib/prop-calculator/advisor/createDocumentedRule';
import { type DocumentedDayPlan } from '~/lib/prop-calculator/advisor/DocumentedRule';
import {
    type NextTrade,
    NextTradeKind,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor/DocumentedSizing';
import { fundedConsistencyStatusAt } from '~/lib/prop-calculator/advisor/FundedConsistencyCeiling';
import { NO_PERSONAL_CAPS } from '~/lib/prop-calculator/advisor/PersonalCaps';
import { placeableMinimumFor } from '~/lib/prop-calculator/advisor/PlaceableMinimum';
import { type RulebookParameters } from '~/lib/prop-calculator/advisor/Rulebook';
import {
    type DayProgress,
    type EvalRuleContext,
    type FundedRuleContext,
    type PlanPhaseStage,
    type RuleContext,
    ruleContextAt,
    type RuleContextCaps,
} from '~/lib/prop-calculator/advisor/RuleContext';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';
import {
    type AccountState,
    type ComputeRisk,
    type Dollars,
    dollars,
    floorToWholeCents,
    type FundedCycleSnapshot,
    ONE_CENT,
    oneContractRisk,
    type Plan,
    policySizingOf,
    resolvePositionSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { type EnginePolicy } from './EnginePolicy';

export enum DocumentedPolicyDisclosure {
    CommissionCoveredTarget = 'commission-covered-target',
    DayStartContext = 'day-start-context',
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
    [DocumentedPolicyDisclosure.PostTargetSmallestPlaceableRisk]:
        'Once the evaluation target is reached but the pass is still waiting on days or consistency, the simulation places one trade a day at the smallest placeable risk: one contract of the engine instrument at its stop, or $1 without one.',
};

interface DayMemo {
    readonly context: EvalRuleContext | FundedRuleContext;
    readonly dayPlan: DocumentedDayPlan<RuleContext>;
    readonly isPastTarget: boolean;
    readonly ledger: DayLedger;
}

export class DayLedger {
    private lastTodayPnL: number;
    progress: DayProgress = {
        dayPnL: dollars(0),
        losses: 0,
        runningLoss: dollars(0),
        wins: 0,
    };
    tradesSeen = 0;

    constructor(todayPnL: number) {
        this.lastTodayPnL = todayPnL;
    }

    record(todayPnL: number, commission: number): void {
        const rawGross = todayPnL - this.lastTodayPnL + commission;
        const gross = floorToWholeCents(rawGross);
        const { dayPnL, losses, runningLoss, wins } = this.progress;
        this.progress =
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
        this.lastTodayPnL = todayPnL;
        this.tradesSeen += 1;
    }
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
        personalCaps: policy.personalCaps ?? NO_PERSONAL_CAPS,
        personalDll: policy.personalDll ?? null,
        placeableMinimum: placeableMinimumFor(
            policySizingOf(
                stage === SizingStage.Funded
                    ? TradingPhase.Funded
                    : TradingPhase.Eval,
            ),
            policy,
        ),
    };
    const commission = policy.commissionPerRoundTrip;
    const roundingPad = rulebook.strategy.rr * ONE_CENT;
    const smallestRisk = smallestPlaceableRisk(policy);
    const memos = new WeakMap<AccountState, DayMemo>();
    const isCoversCommission = commission > 0 && stage === SizingStage.Eval;
    const coveredTrade = (memo: DayMemo, first?: NextTrade): number => {
        if (!isCoversCommission) {
            return riskOf(
                first ?? rule.nextTradeIn(memo.dayPlan, memo.ledger.progress),
            );
        }
        const cover = commission * (memo.ledger.tradesSeen + 1) + roundingPad;
        return riskOf(
            rule.nextTrade(
                withTargetCover(memo.context, cover),
                memo.ledger.progress,
            ),
        );
    };
    const hasFundedConsistency = plan.fundedConsistencyRule() !== null;
    const capsAt = (
        state: AccountState,
        fundedCycle: FundedCycleSnapshot | undefined,
    ): RuleContextCaps => {
        if (!hasFundedConsistency || stage === SizingStage.Eval) return caps;
        if (fundedCycle === undefined) {
            throw new Error(
                `documented day risk: ${plan.label} sized a funded day without the funded cycle snapshot its consistency ceiling needs`,
            );
        }
        const { ceiling, note } = fundedConsistencyStatusAt(
            plan,
            state.balance,
            fundedCycle,
        );
        return { ...caps, consistencyCeiling: ceiling, consistencyNote: note };
    };
    return (state, tradeIndexToday, fundedCycle) => {
        if (tradeIndexToday === 0) {
            const context = ruleContextAt(
                plan,
                stage,
                state,
                capsAt(state, fundedCycle),
            );
            const ledger = new DayLedger(state.todayPnL);
            const dayPlan = rule.planDay(context);
            const first = rule.nextTradeIn(dayPlan, ledger.progress);
            const memo: DayMemo = {
                context,
                dayPlan,
                isPastTarget: isTargetReached(first),
                ledger,
            };
            memos.set(state, memo);
            return memo.isPastTarget ? smallestRisk : coveredTrade(memo, first);
        }
        const memo = memos.get(state);
        if (memo?.ledger.tradesSeen !== tradeIndexToday - 1) {
            throw new Error(
                `documented day risk: trade index ${tradeIndexToday} arrived without trade index ${tradeIndexToday - 1} of the same day`,
            );
        }
        memo.ledger.record(state.todayPnL, commission);
        return memo.isPastTarget ? 0 : coveredTrade(memo);
    };
}

function isTargetReached(trade: NextTrade): boolean {
    return (
        trade.kind === NextTradeKind.Stop &&
        trade.cappedBy.includes(SizingConstraint.RemainingTargetCap)
    );
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
