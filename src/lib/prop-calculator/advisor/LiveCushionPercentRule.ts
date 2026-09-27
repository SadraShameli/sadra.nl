import {
    DayStopRuleKind,
    type Dollars,
    dollars,
    type Fraction0to1,
    resolveLiveTradeRisk,
} from '../core';
import { FlatRiskRule, SHARED_ASSUMPTIONS } from './DocumentedRule';
import {
    type PlannedRisk,
    SizingAssumption,
    SizingProvenance,
    type SizingTerms,
} from './DocumentedSizing';
import { type RulebookParameters } from './Rulebook';
import {
    type LiveRuleContext,
    liveRuleContextSchema,
    profitCeiling,
} from './RuleContext';
import { RuleSource } from './RuleSource';

export class LiveCushionPercentRule extends FlatRiskRule<LiveRuleContext> {
    constructor(rulebook: RulebookParameters) {
        super(rulebook, liveRuleContextSchema);
    }

    private livePercent(context: LiveRuleContext): Fraction0to1 {
        if (context.liveCushionPercent !== null) {
            return context.liveCushionPercent;
        }
        const { postLock, preLock } = this.rulebook.live.cushionPercent;
        return context.thresholdLocked ? postLock : preLock;
    }

    protected flatRisk(
        context: LiveRuleContext,
        runningLoss: Dollars,
    ): PlannedRisk {
        return {
            amount: dollars(
                resolveLiveTradeRisk(
                    context.cushion - runningLoss,
                    this.livePercent(context),
                ),
            ),
            cappedBy: [],
        };
    }

    protected terms(context: LiveRuleContext): SizingTerms {
        const ceiling = profitCeiling(context);
        return {
            assumptions:
                ceiling === null
                    ? [
                          ...SHARED_ASSUMPTIONS,
                          SizingAssumption.LiveDayPolicyUndocumented,
                          SizingAssumption.NoProfitCeiling,
                      ]
                    : [
                          ...SHARED_ASSUMPTIONS,
                          SizingAssumption.LiveDayPolicyUndocumented,
                      ],
            dailyProfitCap: null,
            maxTrades: this.rulebook.strategy.tradesPerDayMax,
            profitCeiling: ceiling,
            provenance: SizingProvenance.LiveCushionPercent,
            rewardMultiple: this.rulebook.strategy.rr,
            sources: [RuleSource.LiveSizing, RuleSource.HisNumbers],
            stopRule: { kind: DayStopRuleKind.None },
        };
    }
}
