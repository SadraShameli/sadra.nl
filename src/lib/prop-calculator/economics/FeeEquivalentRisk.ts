import {
    dollars,
    type Dollars,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import {
    EconomicsDisclosure,
    EconomicsReason,
    isNonNegativeAmount,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export type BustCostInputs = EvalBustCostInputs | FundedBustCostInputs;

export interface EvalBustCostInputs extends BustValues {
    phase: TradingPhase.Eval;
    retryFee: Dollars;
}

export interface FeeEquivalentTradeRiskInputs {
    evalDrawdown: Dollars;
    retryFee: Dollars;
    risk: Dollars;
}

export interface FundedBustCostInputs extends BustValues {
    phase: TradingPhase.Funded;
    rebuyFee: Dollars;
}

interface BustValues {
    valueFreshEval: Dollars;
    valueNow: Dollars;
}

export function bustCost(inputs: BustCostInputs): Quantity<Dollars> {
    const { valueFreshEval, valueNow } = inputs;
    const replacementFee = replacementFeeOf(inputs);
    if (
        !isNonNegativeAmount(replacementFee) ||
        !Number.isFinite(valueFreshEval) ||
        !Number.isFinite(valueNow)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    return quantityOf(dollars(valueNow - valueFreshEval + replacementFee), [
        EconomicsDisclosure.RebuyLagNotPriced,
    ]);
}

export function feeEquivalentTradeRisk(
    inputs: FeeEquivalentTradeRiskInputs,
): Quantity<Dollars> {
    const { evalDrawdown, retryFee, risk } = inputs;
    return !isNonNegativeAmount(retryFee) ||
        !isNonNegativeAmount(risk) ||
        !(Number.isFinite(evalDrawdown) && evalDrawdown > 0)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(dollars(Math.min(risk / evalDrawdown, 1) * retryFee), [
              EconomicsDisclosure.NearFreshEvalApproximation,
          ]);
}

function replacementFeeOf(inputs: BustCostInputs): Dollars {
    switch (inputs.phase) {
        case TradingPhase.Eval: {
            return inputs.retryFee;
        }
        case TradingPhase.Funded: {
            return inputs.rebuyFee;
        }
    }
}
