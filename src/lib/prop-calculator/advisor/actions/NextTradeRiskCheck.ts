import { type DocumentedRule } from '~/lib/prop-calculator/advisor/DocumentedRule';
import {
    type DayStopReason,
    NextTradeKind,
} from '~/lib/prop-calculator/advisor/DocumentedSizing';
import { NextTradeRiskVerdict } from '~/lib/prop-calculator/advisor/NextTradeRiskVerdict';
import {
    isPlacementChecked,
    RungPlacement,
    rungPlacementOf,
    type SizingPlacement,
} from '~/lib/prop-calculator/advisor/PlaceableMinimum';
import {
    type DayProgress,
    type RuleContext,
} from '~/lib/prop-calculator/advisor/RuleContext';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
} from '~/lib/prop-calculator/core';

export interface NextTradeRiskCheckRequest<TContext extends RuleContext> {
    readonly context: TContext;
    readonly day: DayProgress;
    readonly dpRisk?: Dollars | null;
    readonly isPayoutEligible: boolean;
    readonly placement?: null | SizingPlacement;
    readonly proposedRisk: Dollars;
    readonly rule: DocumentedRule<TContext>;
}

export interface NextTradeRiskCheckResult {
    readonly documentedRung: Dollars | null;
    readonly documentedRungPlacement: RungPlacement;
    readonly dpRisk: Dollars | null;
    readonly excessCents: number;
    readonly payoutEligibleAboveRung: boolean;
    readonly stopReason: DayStopReason | null;
    readonly verdict: NextTradeRiskVerdict;
}

export function nextTradeRiskCheck<TContext extends RuleContext>(
    request: NextTradeRiskCheckRequest<TContext>,
): NextTradeRiskCheckResult {
    const {
        context,
        day,
        dpRisk = null,
        isPayoutEligible,
        placement = null,
        proposedRisk,
        rule,
    } = request;
    const trade = rule.nextTrade(context, day);
    const documentedRung =
        trade.kind === NextTradeKind.Trade ? trade.rung.risk : null;
    const stopReason = trade.kind === NextTradeKind.Stop ? trade.reason : null;
    const documentedRungPlacement =
        documentedRung !== null && isPlacementChecked(context.stage)
            ? rungPlacementOf(documentedRung, placement)
            : RungPlacement.NotChecked;

    const excessOverDocumentedCents = excessCentsOf(
        proposedRisk,
        documentedRung ?? dollars(0),
    );
    if (excessOverDocumentedCents > 0) {
        return {
            documentedRung,
            documentedRungPlacement,
            dpRisk,
            excessCents: excessOverDocumentedCents,
            payoutEligibleAboveRung: isPayoutEligible,
            stopReason,
            verdict: NextTradeRiskVerdict.AboveDocumented,
        };
    }

    const excessOverDpCents = excessCentsOf(proposedRisk, dpRisk);
    if (excessOverDpCents > 0) {
        return {
            documentedRung,
            documentedRungPlacement,
            dpRisk,
            excessCents: excessOverDpCents,
            payoutEligibleAboveRung: false,
            stopReason,
            verdict: NextTradeRiskVerdict.AboveDp,
        };
    }

    return {
        documentedRung,
        documentedRungPlacement,
        dpRisk,
        excessCents: 0,
        payoutEligibleAboveRung: false,
        stopReason,
        verdict: NextTradeRiskVerdict.WithinPlan,
    };
}

function excessCentsOf(proposedRisk: Dollars, cap: Dollars | null): number {
    if (cap === null) return 0;
    const excess = Math.round((proposedRisk - cap) * CENTS_PER_DOLLAR);
    return Math.max(excess, 0);
}
