import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { TradingPhase } from '~/lib/prop-calculator/core';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { closedSessionOf } from './MilestoneState';
import { valueAtState } from './ValueAtState';
import { freshFundedAccount, requireValue } from './ValueChain';
import {
    notModeled,
    valueGap,
    type ValueNotModeledResult,
    type ValueResult,
    ValueResultKind,
    ValueUnavailableReason,
} from './ValueEstimate';

export const TRADE_VALUE_SWING_ASSUMPTION =
    'valued at the next session start, as if you stop after this trade';

export type TradeValueSwingOutcome =
    TradeValueSwingResult | ValueNotModeledResult;

export interface TradeValueSwingRequest {
    readonly earlierRisks?: readonly number[];
    readonly risk: number;
    readonly rr: number;
}

export interface TradeValueSwingResult {
    readonly afterLoss: ValueResult;
    readonly afterLossBusted: boolean;
    readonly afterLossRebuyLagDays: null | number;
    readonly afterWin: ValueResult;
    readonly assumption: typeof TRADE_VALUE_SWING_ASSUMPTION;
    readonly deltaLoss: UncertainValue;
    readonly deltaWin: UncertainValue;
    readonly kind: ValueResultKind.Swing;
    readonly now: ValueResult;
    readonly winProbability: number;
}

export function netOfReplacementFee(
    swing: TradeValueSwingResult,
    replacementFee: number,
): TradeValueSwingResult {
    if (!swing.afterLossBusted) return swing;
    const afterLoss: ValueResult = {
        ...swing.afterLoss,
        creditFree: {
            ...swing.afterLoss.creditFree,
            value: swing.afterLoss.creditFree.value - replacementFee,
        },
        creditInclusive: {
            ...swing.afterLoss.creditInclusive,
            value: swing.afterLoss.creditInclusive.value - replacementFee,
        },
    };
    return {
        ...swing,
        afterLoss,
        deltaLoss: valueGap(swing.now, afterLoss),
    };
}

export function tradeValueSwing(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
    request: TradeValueSwingRequest,
): TradeValueSwingOutcome {
    if (account.kind === ReconstructedLiveKind.Live) {
        return notModeled(ValueUnavailableReason.LiveNotModeled);
    }
    const validatedSpec = documentedPolicySpecSchema.parse(spec);
    const commission = validatedSpec.enginePolicy.commissionPerRoundTrip;
    const earlierLosses = (request.earlierRisks ?? []).map(
        (risk) => -risk - commission,
    );
    const reached = reachedAccountOf(account, earlierLosses);
    const now = requireValue(valueAtState(reached, spec));
    const won = closedSessionOf(account, [
        ...earlierLosses,
        request.risk * request.rr - commission,
    ]).account;
    const afterWin = requireValue(
        valueAtState(
            account.kind === TradingPhase.Eval &&
                account.plan.isPassed(won.state)
                ? freshFundedAccount(account.plan)
                : won,
            spec,
        ),
    );

    const lost = closedSessionOf(account, [
        ...earlierLosses,
        -request.risk - commission,
    ]);
    const isBusted = lost.isBusted;
    const afterLossAccount = isBusted
        ? freshEvalAccount(account)
        : lost.account;
    const afterLoss = requireValue(valueAtState(afterLossAccount, spec));

    return {
        afterLoss,
        afterLossBusted: isBusted,
        afterLossRebuyLagDays: isBusted
            ? validatedSpec.enginePolicy.rebuyLagDays
            : null,
        afterWin,
        assumption: TRADE_VALUE_SWING_ASSUMPTION,
        deltaLoss: valueGap(now, afterLoss),
        deltaWin: valueGap(now, afterWin),
        kind: ValueResultKind.Swing,
        now,
        winProbability: spec.rulebook.strategy.winrate,
    };
}

function freshEvalAccount(
    account: ReconstructedFundedOrEvalAccount,
): ReconstructedFundedOrEvalAccount {
    return {
        ...account,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        state: account.plan.initialState(),
    };
}

function reachedAccountOf(
    account: ReconstructedFundedOrEvalAccount,
    earlierLosses: readonly number[],
): ReconstructedFundedOrEvalAccount {
    if (earlierLosses.length === 0) return account;
    const reached = closedSessionOf(account, earlierLosses);
    if (reached.isDayEnded) {
        throw new Error(
            'value/TradeValueSwing: the earlier rungs already end the day, so this rung is never taken',
        );
    }
    return reached.account;
}
