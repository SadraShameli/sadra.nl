import { dollars, type Dollars } from '~/lib/prop-calculator/core';

import { type Assumption, AssumptionBias, inputAssumption } from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import {
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
} from './PayoutRequestDecision';
import { PayoutRequestRule, type PayoutRuleContext } from './PayoutRequestRule';
import { type RulebookParameters } from './Rulebook';
import { SizingStage } from './SizingStage';

export interface PayoutAdvice {
    readonly assumptions: readonly Assumption[];
    readonly documented: PayoutRequestDecision;
    readonly engineHorizonCredit: Dollars | null;
    readonly netAfterSplit: Dollars | null;
}

export function payoutAdvice(
    rulebook: RulebookParameters,
    context: PayoutRuleContext,
): PayoutAdvice {
    const rule = new PayoutRequestRule(rulebook);
    const documented = rule.decide(context);
    const { engineHorizonCredit, netAfterSplit } = numbersFor(
        context,
        documented,
    );
    return {
        assumptions: [
            inputAssumption(
                AssumptionKind.LiveTriggersNotChecked,
                AssumptionBias.Optimistic,
            ),
        ],
        documented,
        engineHorizonCredit,
        netAfterSplit,
    };
}

function numbersFor(
    context: PayoutRuleContext,
    documented: PayoutRequestDecision,
): { engineHorizonCredit: Dollars | null; netAfterSplit: Dollars | null } {
    if (documented.kind !== PayoutRequestDecisionKind.Request) {
        return { engineHorizonCredit: null, netAfterSplit: null };
    }
    switch (context.stage) {
        case SizingStage.Funded: {
            const { plan, state, tracker } = context;
            return {
                engineHorizonCredit: dollars(
                    tracker.closeoutCredit({
                        minRetainedCushion: documented.retainedCushion,
                        payoutRequestSize: documented.requestAmount,
                        plan,
                        state,
                    }),
                ),
                netAfterSplit: dollars(
                    plan.payoutFromProfit(
                        documented.requestAmount,
                        tracker.payoutsIssued,
                    ),
                ),
            };
        }
        case SizingStage.Live: {
            return {
                engineHorizonCredit: null,
                netAfterSplit: dollars(
                    context.livePlan.payoutFromProfit(documented.requestAmount),
                ),
            };
        }
    }
}
