import { CENTS_PER_DOLLAR, DayStopRuleKind, dollars } from '~/lib/prop-calculator/core';

import { FlatRiskRule, SHARED_ASSUMPTIONS } from './DocumentedRule';
import {
    DailyProfitCapKind,
    type PlannedRisk,
    SizingAssumption,
    SizingProvenance,
    type SizingTerms,
} from './DocumentedSizing';
import {
    fundedStopRuleToDayStopRule,
    type RulebookParameters,
} from './Rulebook';
import {
    type FundedRuleContext,
    fundedRuleContextSchema,
    profitCeiling,
} from './RuleContext';
import { RuleSource } from './RuleSource';

export class FundedFixedRiskRule extends FlatRiskRule<FundedRuleContext> {
    constructor(rulebook: RulebookParameters) {
        super(rulebook, fundedRuleContextSchema);
    }

    protected flatRisk(): PlannedRisk {
        return {
            amount: dollars(this.rulebook.funded.riskCents / CENTS_PER_DOLLAR),
            cappedBy: [],
        };
    }

    protected terms(context: FundedRuleContext): SizingTerms {
        const { funded } = this.rulebook;
        const stopRule = fundedStopRuleToDayStopRule(funded.stopRule);
        const ceiling = profitCeiling(context);
        return {
            assumptions:
                ceiling === null
                    ? [...SHARED_ASSUMPTIONS, SizingAssumption.NoProfitCeiling]
                    : SHARED_ASSUMPTIONS,
            dailyProfitCap:
                stopRule.kind === DayStopRuleKind.AfterTarget
                    ? {
                          kind: DailyProfitCapKind.StopTrigger,
                          stopAfter: dollars(stopRule.dollars),
                      }
                    : null,
            maxTrades: funded.tradesPerDayMax,
            profitCeiling: ceiling,
            provenance: SizingProvenance.FundedFixedRisk,
            rewardMultiple: funded.takeProfitCents / funded.riskCents,
            sources: [RuleSource.HardRule5, RuleSource.HisNumbers],
            stopRule,
        };
    }
}
