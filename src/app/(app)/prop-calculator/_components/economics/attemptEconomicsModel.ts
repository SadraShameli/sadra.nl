import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    attemptEconomicsOfRun,
    ECONOMICS_REASON_TEXT,
    type EconomicsReason,
    type RunAttemptEconomics,
    type RunAttemptOutputs,
} from '~/lib/prop-calculator/economics';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export type AttemptEconomicsCardModel =
    | {
          readonly decomposition: null;
          readonly economics: null;
          readonly formula: null;
          readonly reason: string;
          readonly reasonCode: EconomicsReason;
      }
    | {
          readonly decomposition: readonly AttemptEconomicsDecompositionRow[];
          readonly economics: RunAttemptEconomics;
          readonly formula: string;
          readonly reason: null;
          readonly reasonCode: null;
      };

export interface AttemptEconomicsDecompositionRow {
    label: string;
    valueText: string;
}

export type AttemptEconomicsRunOutputs = RunAttemptOutputs & {
    anyPayoutGivenFundedProbability: number;
    estimates: RunAttemptOutputs['estimates'] & {
        anyPayoutGivenFundedProbability: UncertainValue;
        payoutsPerFundedAccount: UncertainValue;
    };
    payoutsPerFundedAccount: number;
};

export function attemptEconomicsCardModel(
    outputs: AttemptEconomicsRunOutputs,
    fundedHorizonDays: number,
): AttemptEconomicsCardModel {
    const decomposition = attemptEconomicsOfRun(outputs, fundedHorizonDays);
    if (decomposition.value === null) {
        return {
            decomposition: null,
            economics: null,
            formula: null,
            reason: ECONOMICS_REASON_TEXT[decomposition.reason],
            reasonCode: decomposition.reason,
        };
    }
    const economics = decomposition.value;
    const payoutsPerPaidFunded = ratioOf(
        outputs.payoutsPerFundedAccount,
        outputs.anyPayoutGivenFundedProbability,
    );
    const averagePayout = ratioOf(
        outputs.expectedPayoutPerFundedAccount,
        outputs.payoutsPerFundedAccount,
    );
    return {
        decomposition: [
            {
                label: 'Per-attempt pass',
                valueText: withStandardError(
                    formatPercent(economics.passProbability),
                    economics.passProbabilityStandardError,
                    formatPercent,
                ),
            },
            {
                label: 'P(payout | funded)',
                valueText: withStandardError(
                    formatPercent(outputs.anyPayoutGivenFundedProbability),
                    outputs.estimates.anyPayoutGivenFundedProbability
                        .standardError,
                    formatPercent,
                ),
            },
            {
                label: 'Payouts per paid funded',
                valueText:
                    payoutsPerPaidFunded === null
                        ? NOT_APPLICABLE
                        : payoutsPerPaidFunded.toFixed(2),
            },
            {
                label: 'Average payout',
                valueText:
                    averagePayout === null
                        ? NOT_APPLICABLE
                        : formatCurrency(averagePayout),
            },
            {
                label: `Funded value (${String(economics.fundedHorizonDays)}-day horizon, ${economics.basis} net)`,
                valueText: formatCurrency(economics.fundedValue),
            },
        ],
        economics,
        formula: formulaTextOf(economics),
        reason: null,
        reasonCode: null,
    };
}

function formulaTextOf(economics: RunAttemptEconomics): string {
    return `EV per attempt = pass ${formatPercent(economics.passProbability)} × funded value ${formatCurrency(economics.fundedValue)} − attempt cost ${formatCurrency(economics.attemptCost)} = ${formatCurrency(economics.expectedNetPerAttempt.value)}${standardErrorSuffix(economics.expectedNetPerAttempt.standardError, formatCurrency)}`;
}

function ratioOf(numerator: number, denominator: number): null | number {
    return denominator > 0 ? numerator / denominator : null;
}

function standardErrorSuffix(
    standardError: null | number,
    format: (value: number) => string,
): string {
    return standardError === null ? '' : ` (± ${format(standardError)})`;
}

function withStandardError(
    text: string,
    standardError: null | number,
    format: (value: number) => string,
): string {
    return `${text}${standardErrorSuffix(standardError, format)}`;
}
