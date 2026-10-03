import { formatCurrency, formatPercent } from '~/lib/format';

import { type RunAttemptEconomics } from './AttemptEconomics';

interface PaidFundedPayoutInputs {
    readonly anyPayoutGivenFundedProbability: number;
    readonly expectedPayoutPerFundedAccount: number;
    readonly payoutsPerFundedAccount: number;
}

interface PaidFundedPayoutStats {
    readonly averagePayout: null | number;
    readonly payoutsPerPaidFunded: null | number;
}

export function filledEvFormulaText(
    economics: RunAttemptEconomics,
    resultText: string,
): string {
    const liveTransferTerm =
        economics.liveTransferCashPerAttempt === 0
            ? ''
            : ` + live transfer cash per attempt ${formatCurrency(economics.liveTransferCashPerAttempt)}`;
    return `pass ${formatPercent(economics.passProbability)} × funded value ${formatCurrency(economics.fundedValue)}${liveTransferTerm} − attempt cost ${formatCurrency(economics.attemptCost)} = ${resultText}`;
}

export function paidFundedPayoutStatsOf(
    outputs: PaidFundedPayoutInputs,
): PaidFundedPayoutStats {
    return {
        averagePayout: ratioOf(
            outputs.expectedPayoutPerFundedAccount,
            outputs.payoutsPerFundedAccount,
        ),
        payoutsPerPaidFunded: ratioOf(
            outputs.payoutsPerFundedAccount,
            outputs.anyPayoutGivenFundedProbability,
        ),
    };
}

function ratioOf(numerator: number, denominator: number): null | number {
    return denominator > 0 ? numerator / denominator : null;
}
