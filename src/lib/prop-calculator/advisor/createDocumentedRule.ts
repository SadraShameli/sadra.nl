import { type DocumentedRule } from './DocumentedRule';
import { EvalLadderRule } from './EvalLadderRule';
import { EvalMaxRiskRule } from './EvalMaxRiskRule';
import { FundedFixedRiskRule } from './FundedFixedRiskRule';
import { LiveCushionPercentRule } from './LiveCushionPercentRule';
import { EvalSizingMode, type RulebookParameters } from './Rulebook';
import {
    type EvalRuleContext,
    type FundedRuleContext,
    type LiveRuleContext,
} from './RuleContext';
import { SizingStage } from './SizingStage';

export function createDocumentedRule(
    stage: SizingStage.Eval,
    rulebook: RulebookParameters,
): DocumentedRule<EvalRuleContext>;
export function createDocumentedRule(
    stage: SizingStage.Funded,
    rulebook: RulebookParameters,
): DocumentedRule<FundedRuleContext>;
export function createDocumentedRule(
    stage: SizingStage.Live,
    rulebook: RulebookParameters,
): DocumentedRule<LiveRuleContext>;
export function createDocumentedRule(
    stage: SizingStage,
    rulebook: RulebookParameters,
): DocumentedRule;
export function createDocumentedRule(
    stage: SizingStage,
    rulebook: RulebookParameters,
): DocumentedRule {
    switch (stage) {
        case SizingStage.Eval: {
            return createEvalRule(rulebook);
        }
        case SizingStage.Funded: {
            return new FundedFixedRiskRule(rulebook);
        }
        case SizingStage.Live: {
            return new LiveCushionPercentRule(rulebook);
        }
    }
}

function createEvalRule(
    rulebook: RulebookParameters,
): DocumentedRule<EvalRuleContext> {
    switch (rulebook.eval.mode) {
        case EvalSizingMode.Ladder: {
            return new EvalLadderRule(rulebook);
        }
        case EvalSizingMode.MaxRisk: {
            return new EvalMaxRiskRule(rulebook);
        }
    }
}
