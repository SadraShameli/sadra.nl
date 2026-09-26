import { CENTS_PER_DOLLAR, DayStopRuleKind, dollars } from '../core';
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
import { type FundedRuleContext, fundedRuleContextSchema } from './RuleContext';
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

    protected terms(): SizingTerms {
        const { funded } = this.rulebook;
        const stopRule = fundedStopRuleToDayStopRule(funded.stopRule);
        return {
            assumptions: [
                ...SHARED_ASSUMPTIONS,
                SizingAssumption.NoProfitCeiling,
            ],
            dailyProfitCap:
                stopRule.kind === DayStopRuleKind.AfterTarget
                    ? {
                          kind: DailyProfitCapKind.StopTrigger,
                          stopAfter: dollars(stopRule.dollars),
                      }
                    : null,
            maxTrades: funded.tradesPerDayMax,
            profitCeiling: null,
            provenance: SizingProvenance.FundedFixedRisk,
            rewardMultiple: funded.takeProfitCents / funded.riskCents,
            sources: [RuleSource.HardRule5, RuleSource.HisNumbers],
            stopRule,
        };
    }
}
