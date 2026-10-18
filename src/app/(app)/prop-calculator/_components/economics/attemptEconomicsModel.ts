import { kpiDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    attemptEconomicsOfRun,
    ECONOMICS_REASON_TEXT,
    type EconomicsReason,
    filledEvFormulaText,
    paidFundedPayoutStatsOf,
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
    infoText?: string;
    label: string;
    valueText: string;
}

export type AttemptEconomicsRunOutputs = RunAttemptOutputs & {
    anyPayoutGivenFundedProbability: number;
    estimates: RunAttemptOutputs['estimates'] & {
        anyPayoutGivenFundedProbability: UncertainValue;
        expectedPayoutPerFundedAccount: UncertainValue;
        payoutsPerFundedAccount: UncertainValue;
    };
    fundedPayoutValues: readonly number[];
    netValues: readonly number[];
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
    const { averagePayout, payoutsPerPaidFunded } =
        paidFundedPayoutStatsOf(outputs);
    const trialCount = outputs.netValues.length;
    const fundedCount = outputs.fundedPayoutValues.length;
    const fundedTrials = nCountText(fundedCount, 'funded trials');
    const allTrials = nCountText(trialCount, 'trials');
    const fundedValueStandardError =
        outputs.estimates.expectedPayoutPerFundedAccount.standardError === null
            ? null
            : outputs.estimates.expectedPayoutPerFundedAccount.standardError *
              economics.copyAccounts;
    const { breakevenPassRate, fundedValueToAttemptCost } = economics;
    const liveTransferSuffix =
        economics.liveTransferCashPerAttempt === 0
            ? ''
            : ' (incl. live transfer cash)';
    return {
        decomposition: [
            {
                label: 'Attempt price',
                valueText: withStandardError(
                    formatCurrency(economics.attemptCost),
                    economics.attemptCostStandardError,
                    formatCurrency,
                ),
            },
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
                valueText: withUncertainty(
                    formatPercent(outputs.anyPayoutGivenFundedProbability),
                    outputs.estimates.anyPayoutGivenFundedProbability
                        .standardError,
                    formatPercent,
                    fundedTrials,
                ),
            },
            {
                label: 'Payouts per paid funded',
                valueText:
                    payoutsPerPaidFunded === null
                        ? NOT_APPLICABLE
                        : `${payoutsPerPaidFunded.toFixed(2)} ${fundedTrials}`,
            },
            {
                label: 'Average payout',
                valueText:
                    averagePayout === null
                        ? NOT_APPLICABLE
                        : `${formatCurrency(averagePayout)} ${fundedTrials}`,
            },
            {
                label: `Funded value (${String(economics.fundedHorizonDays)}-day horizon, ${economics.basis} net)`,
                valueText: withUncertainty(
                    formatCurrency(economics.fundedValue),
                    fundedValueStandardError,
                    formatCurrency,
                    fundedTrials,
                ),
            },
            {
                infoText: kpiDescriptions.breakevenPassRate,
                label: `Breakeven pass rate${liveTransferSuffix}`,
                valueText:
                    breakevenPassRate.value === null
                        ? NOT_APPLICABLE
                        : `${formatPercent(breakevenPassRate.value)} ${allTrials}`,
            },
            {
                label: `Funded value / attempt cost${liveTransferSuffix}`,
                valueText:
                    fundedValueToAttemptCost.value === null
                        ? NOT_APPLICABLE
                        : `${fundedValueToAttemptCost.value.ratioText}, net ${fundedValueToAttemptCost.value.netText} ${allTrials}`,
            },
        ],
        economics,
        formula: `EV per attempt = ${filledEvFormulaText(
            economics,
            withStandardError(
                formatCurrency(economics.expectedNetPerAttempt.value),
                economics.expectedNetPerAttempt.standardError,
                formatCurrency,
            ),
        )}`,
        reason: null,
        reasonCode: null,
    };
}

function nCountText(count: number, noun: string): string {
    return `(n = ${String(count)} ${noun})`;
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

function withUncertainty(
    text: string,
    standardError: null | number,
    format: (value: number) => string,
    nText: string,
): string {
    return standardError === null
        ? `${text} ${nText}`
        : withStandardError(text, standardError, format);
}
