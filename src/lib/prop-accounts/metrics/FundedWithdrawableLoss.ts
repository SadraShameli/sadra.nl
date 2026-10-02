import {
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import { dollars } from '~/lib/prop-calculator';
import {
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import { fundedWithdrawableDollarsOf } from './FirmProfitConcentration';

export interface FundedWithdrawableAfterPayoutInputs {
    readonly payoutsPaidGrossCents: UsdCents;
    readonly previous: ReconstructedFundedOrEvalAccount;
    readonly rulebook: RulebookParameters;
}

export interface FundedWithdrawableLossInputs
    extends FundedWithdrawableAfterPayoutInputs {
    readonly latestWithdrawableCents: UsdCents;
    readonly profitSinceSnapshotDollars: number;
}

export function fundedWithdrawableAfterPayoutCents(
    inputs: FundedWithdrawableAfterPayoutInputs,
): UsdCents {
    const { payoutsPaidGrossCents, previous, rulebook } = inputs;
    const afterPayout: ReconstructedFundedOrEvalAccount =
        payoutsPaidGrossCents > 0
            ? {
                  ...previous,
                  state: {
                      ...previous.state,
                      balance: dollars(
                          previous.state.balance -
                              usdCentsToDollars(payoutsPaidGrossCents),
                      ),
                  },
              }
            : previous;
    return usdCentsFromDollars(fundedWithdrawableDollarsOf(rulebook, afterPayout));
}

export function fundedWithdrawableLossCents(
    inputs: FundedWithdrawableLossInputs,
): UsdCents {
    const withdrawableAfterPayoutCents = fundedWithdrawableAfterPayoutCents(inputs);
    const droppedCents =
        withdrawableAfterPayoutCents - inputs.latestWithdrawableCents;
    if (inputs.payoutsPaidGrossCents <= 0) {
        return usdCents(Math.max(0, droppedCents));
    }
    const lostTradingProfitCents = usdCentsFromDollars(
        Math.max(0, -inputs.profitSinceSnapshotDollars),
    );
    return usdCents(Math.max(0, Math.min(droppedCents, lostTradingProfitCents)));
}

export function fundedWithdrawableLostToResetCents(
    inputs: FundedWithdrawableAfterPayoutInputs,
): UsdCents {
    return usdCents(Math.max(0, fundedWithdrawableAfterPayoutCents(inputs)));
}
