import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import { applyClosedTrade, TradingPhase } from '~/lib/prop-calculator/core';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { valueAtState } from './ValueAtState';
import { requireValue } from './ValueChain';
import {
    notModeled,
    valueGap,
    type ValueNotModeledResult,
    type ValueResult,
    ValueResultKind,
    ValueUnavailableReason,
} from './ValueEstimate';

export type TradeValueSwingOutcome =
    | TradeValueSwingResult
    | ValueNotModeledResult;

export interface TradeValueSwingRequest {
    readonly risk: number;
    readonly rr: number;
}

export interface TradeValueSwingResult {
    readonly afterLoss: ValueResult;
    readonly afterLossBusted: boolean;
    readonly afterLossRebuyLagDays: null | number;
    readonly afterWin: ValueResult;
    readonly deltaLoss: UncertainValue;
    readonly deltaWin: UncertainValue;
    readonly kind: ValueResultKind.Swing;
    readonly now: ValueResult;
    readonly winProbability: number;
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
    const now = requireValue(valueAtState(account, spec));
    const won = stateAfter(account, request.risk * request.rr - commission);
    const afterWin = requireValue(valueAtState(won, spec));

    const lost = stateAfter(account, -request.risk - commission);
    const isBusted = account.plan.isBust(lost.state, account.kind);
    const afterLossAccount = isBusted ? freshEvalAccount(account) : lost;
    const afterLoss = requireValue(valueAtState(afterLossAccount, spec));

    return {
        afterLoss,
        afterLossBusted: isBusted,
        afterLossRebuyLagDays: isBusted
            ? validatedSpec.enginePolicy.rebuyLagDays
            : null,
        afterWin,
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

function stateAfter(
    account: ReconstructedFundedOrEvalAccount,
    pnl: number,
): ReconstructedFundedOrEvalAccount {
    const state = { ...account.state };
    applyClosedTrade(state, account.plan, account.kind, pnl);
    return { ...account, state };
}
