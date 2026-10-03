import { defineCommand } from 'citty';

import {
    bankrollArguments,
    type BankrollInputs,
    describeStopRule,
    formatCurrencyWithSe,
    formatDaysToPass,
    formatNumberWithSe,
    formatPercentWithSe,
    liveTransferHazardArgument,
    liveTransferRunLines,
    pathGranularityComparisonArgument,
    placedFundedRiskNote,
    planArguments,
    planResolver,
    pricedTriggerLines,
    printEdgePlausibilityNotes,
    readBankrollInputs,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
    unrestatedLines,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatOptionalPercent,
    formatPercent,
} from '~/lib/format';
import {
    dollars,
    type Dollars,
    type Fraction0to1,
    type Plan,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    attemptEconomicsOfRun,
    bankrollAttempts,
    bankrollNoPayout,
    type BankrollRisk,
    bankrollRisk,
    batchLossClosedForm,
    ECONOMICS_REASON_TEXT,
    EconomicsReason,
    empiricalPayingStatsOf,
    evalPace,
    expectancyPerTradeR,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumAttemptsForLossTarget,
    type Quantity,
    requiredR,
} from '~/lib/prop-calculator/economics';
import { liveTransferContinuationNotes } from '~/lib/prop-calculator/simulator';
import { mean } from '~/lib/prop-calculator/stats';

export interface GranularityRow {
    out: SimOutputs;
    stepsPerR: number;
}

type SummaryRow = readonly [label: string, value: string];

export const GRANULARITY_TABLE_COLUMNS: readonly TableColumn[] = [
    { label: 'steps/R', width: 8 },
    { label: 'eval pass', width: 10 },
    { label: 'funded survive', width: 15 },
    { label: 'bust in eval', width: 13 },
    { label: 'bust when funded', width: 17 },
    { label: 'monthly net', width: 12 },
];

export const simArguments = {
    ...planArguments,
    ...tradingArguments,
    ...pathGranularityComparisonArgument,
    ...bankrollArguments,
    ...liveTransferHazardArgument,
};

export default defineCommand({
    args: simArguments,
    meta: {
        description:
            'Simulate one plan end to end (--firm, --variant). The ladder applies to the evaluation only; the funded phase uses flat risk.',
        name: 'sim',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const bankroll = readBankrollInputs(context.args);
            const label = simSpinnerLabel(plan.label, inputs.trials);
            spinner = ui.spinner(label).start();

            const simInputs = inputs.toSimInputs(plan);
            const out = simulate(simInputs);
            spinner.succeed(label);

            ui.heading(plan.label);
            const [riskLine, runLine] = simHeaderLines(inputs, plan);
            ui.muted(riskLine);
            ui.muted(`${runLine}\n`);
            const pricedLines = pricedTriggerLines(simInputs);
            for (const line of [
                ...pricedLines,
                ...unrestatedLines(
                    liveTransferRunLines(
                        inputs.liveTransferHazard,
                        out,
                        liveTransferContinuationNotes(
                            plan,
                            out.liveTransferContinuation,
                        ),
                    ),
                    pricedLines,
                ),
            ]) {
                ui.muted(line);
            }
            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    rrRatio: inputs.rrRatio,
                    winrate: inputs.winrate,
                }),
            );

            const table = new TablePrinter([
                { align: 'left', label: '', width: 22 },
                { label: '', width: 0 },
            ]);
            for (const row of simSummaryRows(out)) {
                table.printRow(row);
            }
            for (const row of simEconomicsRows(out, inputs, plan)) {
                table.printRow(row);
            }
            for (const row of simBankrollRows(out, inputs, bankroll)) {
                table.printRow(row);
            }

            const granularityRows = granularityComparison(inputs, plan, out);
            if (granularityRows.length > 0) {
                ui.heading('intraday path-walk granularity comparison');
                ui.muted(
                    '  applies to every IntradayTrailingDrawdown trade, eval and funded',
                );
                const granularityTable = new TablePrinter(
                    GRANULARITY_TABLE_COLUMNS,
                );
                granularityTable.printHeader();
                for (const row of granularityRows) {
                    granularityTable.printRow(granularityTableRow(row));
                }
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function granularityComparison(
    inputs: TradingInputs,
    plan: Plan,
    primary: SimOutputs,
): GranularityRow[] {
    const granularities = inputs.intradayPathStepsPerR;
    if (granularities === undefined || granularities.length <= 1) return [];
    return granularities.map((stepsPerR, index) => ({
        out:
            index === 0
                ? primary
                : simulate({
                      ...inputs.toSimInputs(plan),
                      intradayPathStepsPerR: stepsPerR,
                  }),
        stepsPerR,
    }));
}

export function granularityTableRow({
    out,
    stepsPerR,
}: GranularityRow): readonly string[] {
    return [
        String(stepsPerR),
        formatPercent(out.evalPassProbability),
        formatPercent(out.fundedSurvivalProbability),
        formatPercent(out.bustProbability),
        formatPercent(out.fundedBustProbability),
        formatCurrency(out.expectedMonthlyNet),
    ];
}

export function simHeaderLines(
    inputs: TradingInputs,
    plan?: Plan,
): readonly [risk: string, run: string] {
    const fundedRisk = inputs.fundedRiskPerTrade ?? inputs.riskPerTrade;
    const fundedRr = inputs.fundedRrRatio ?? inputs.rrRatio;
    const fundedTpd = inputs.fundedTradesPerDay ?? inputs.tradesPerDay;
    const evalRisk = inputs.ladder
        ? `ladder [${inputs.ladder.join(', ')}]`
        : `flat $${inputs.riskPerTrade} x${inputs.tradesPerDay}/day`;
    return [
        `  eval risk ${evalRisk} stop ${describeStopRule(inputs.dayStop)} | funded flat $${fundedRisk}${placedFundedRiskNote(inputs, plan)} x${fundedTpd}/day 1:${fundedRr}`,
        `  ${(inputs.winrate * 100).toFixed(0)}% WR | eval 1:${inputs.rrRatio} | max attempts ${inputs.maxAttempts} | seed ${inputs.seed} | ${inputs.fundedHorizonDays} funded days`,
    ];
}

const NO_SINGLE_RISK_LADDER =
    'n/a (an eval ladder has no single risk per trade)';
const NO_EVAL_INSTANT_FUNDED = 'n/a (instant funded: no eval)';
const WALK_LABEL = 'P(pass) and expected trades (random-walk approximation)';
const EV_PER_ATTEMPT_LABEL =
    'EV per attempt (ignores time; not the ranking objective)';

export function simBankrollRows(
    out: SimOutputs,
    inputs: TradingInputs,
    bankroll: BankrollInputs,
): readonly SummaryRow[] {
    if (bankroll.bankroll === null && bankroll.lossThreshold === null) {
        return [];
    }
    const rows: SummaryRow[] =
        bankroll.bankroll === null
            ? []
            : [...bankrollAffordabilityRows(out, inputs, bankroll.bankroll)];
    rows.push(minimumBudgetRow(out, inputs, bankroll.lossThreshold));
    return rows;
}

export function simEconomicsRows(
    out: SimOutputs,
    inputs: TradingInputs,
    plan: Plan,
): readonly SummaryRow[] {
    const decomposition = attemptEconomicsOfRun(out, inputs.fundedHorizonDays);
    const fundedValueSe =
        out.estimates.expectedPayoutPerFundedAccount.standardError === null
            ? null
            : out.estimates.expectedPayoutPerFundedAccount.standardError *
              out.copyAccounts;
    const fundedValueText =
        decomposition.value === null
            ? formatQuantityReason(decomposition.reason)
            : formatCurrencyWithSe(
                  decomposition.value.fundedValue,
                  fundedValueSe,
              );
    const breakevenText =
        decomposition.value === null
            ? formatQuantityReason(decomposition.reason)
            : decomposition.value.breakevenPassRate.value === null
              ? formatQuantityReason(
                    decomposition.value.breakevenPassRate.reason,
                )
              : formatPercent(decomposition.value.breakevenPassRate.value);
    const fundedValueToAttemptCostText =
        decomposition.value === null
            ? formatQuantityReason(decomposition.reason)
            : decomposition.value.fundedValueToAttemptCost.value === null
              ? formatQuantityReason(
                    decomposition.value.fundedValueToAttemptCost.reason,
                )
              : `${decomposition.value.fundedValueToAttemptCost.value.ratio.toFixed(2)}x (net ${decomposition.value.fundedValueToAttemptCost.value.netToOne.toLocaleString(
                    'en-US',
                    { maximumFractionDigits: 2 },
                )}:1)`;
    const evText =
        decomposition.value === null
            ? formatQuantityReason(decomposition.reason)
            : formatCurrencyWithSe(
                  decomposition.value.expectedNetPerAttempt.value,
                  decomposition.value.expectedNetPerAttempt.standardError,
              );
    return [
        [
            'eval pass per attempt',
            formatPercentWithSe(
                out.attemptPassProbability,
                out.estimates.attemptPassProbability.standardError,
            ),
        ],
        [
            'P(payout | funded)',
            formatPercentWithSe(
                out.anyPayoutGivenFundedProbability,
                out.estimates.anyPayoutGivenFundedProbability.standardError,
            ),
        ],
        [
            'payouts per funded account',
            formatNumberWithSe(
                out.payoutsPerFundedAccount,
                out.estimates.payoutsPerFundedAccount.standardError,
            ),
        ],
        [
            'P(k payouts | funded)',
            payoutDistributionLine(out.fundedPayoutCountDistribution),
        ],
        [fundedValueLabel(inputs.fundedHorizonDays), fundedValueText],
        [EV_PER_ATTEMPT_LABEL, evText],
        ['breakeven pass rate', breakevenText],
        ['funded value / attempt cost', fundedValueToAttemptCostText],
        ...evalPaceRows(out, inputs, plan),
        [
            'attempt pays (any payout)',
            formatPercentWithSe(
                out.attemptPaysProbability,
                out.estimates.attemptPaysProbability.standardError,
            ),
        ],
    ];
}

export function simSpinnerLabel(planLabel: string, trials: number): string {
    return `${planLabel}: ${trials} trials`;
}

export function simSummaryRows(out: SimOutputs): readonly SummaryRow[] {
    const fundedResetRows: SummaryRow[] =
        out.expectedFundedResets > 0
            ? [
                  ['funded resets / acct', out.expectedFundedResets.toFixed(2)],
                  [
                      'funded reset fees',
                      formatCurrency(out.costBreakdown.fundedResetFeesTotal),
                  ],
              ]
            : [];
    return [
        ['eval pass', formatPercent(out.evalPassProbability)],
        ['funded survive', formatPercent(out.fundedSurvivalProbability)],
        ['bust in eval', formatPercent(out.bustProbability)],
        ['bust when funded', formatPercent(out.fundedBustProbability)],
        ['inactivity closure', formatPercent(out.inactivityClosureProbability)],
        ['timeout', formatPercent(out.timeoutProbability)],
        ['days to pass (p50)', formatDaysToPass(out, out.daysToPassP50, 1)],
        ['days to pass (p95)', formatDaysToPass(out, out.daysToPassP95, 1)],
        ['expected attempts', out.expectedAttempts.toFixed(2)],
        ['total cost', formatCurrency(out.expectedTotalCost)],
        ...fundedResetRows,
        ['cost / funded acct', formatFiniteCurrency(out.costPerFundedAccount)],
        [
            'cost / drawdown $',
            formatFiniteCurrency(out.costPerDrawdownDollar, 4),
        ],
        ['gross payout', formatCurrency(out.expectedGrossPayout)],
        ['payouts / account', out.expectedPayoutCount.toFixed(2)],
        [
            'payout / funded acct',
            formatCurrency(out.expectedPayoutPerFundedAccount),
        ],
        ['net', formatCurrency(out.expectedNet)],
        ['monthly net', formatCurrency(out.expectedMonthlyNet)],
        ['ROI on cost', formatOptionalPercent(out.roiOnCost.value)],
        ['expectancy per trade', formatCurrency(out.expectancyDollars)],
        ['max drawdown (p95)', formatCurrency(out.maxDrawdownP95)],
        ['loss streak (p95)', out.maxLosingStreakP95.toFixed(0)],
    ];
}

function bankrollAffordabilityRows(
    out: SimOutputs,
    inputs: TradingInputs,
    bankroll: Dollars,
): readonly SummaryRow[] {
    const attemptsAffordableCount = bankrollAttempts(out, bankroll);
    const isTrialUnit = inputs.maxAttempts > 1;
    const sampleRisk = bankrollRisk(
        isTrialUnit
            ? {
                  attemptPaysProbability: out.attemptPaysProbability,
                  costPerAttempt: out.expectedTotalCost,
                  netValues: out.netValues,
              }
            : out,
        bankroll,
        inputs.seed,
    );
    const sampleCount = sampleRisk.attempts;
    const batchLabel = isTrialUnit
        ? `P(batch net < 0) over ${sampleCount ?? 0} trials of up to ${inputs.maxAttempts} attempts`
        : `P(batch net < 0) over ${sampleCount ?? 0} attempts`;
    const invalidInput = formatQuantityReason(EconomicsReason.InvalidInput);

    return [
        [
            'attempts affordable',
            attemptsAffordableCount === null
                ? invalidInput
                : `${attemptsAffordableCount} at ${formatCurrency(out.costPerAttempt)} per attempt`,
        ],
        [batchLabel, formatBatchLoss(sampleRisk)],
        [
            `P(no payout from ${attemptsAffordableCount ?? 0} attempts)`,
            attemptsAffordableCount === null
                ? invalidInput
                : formatNoPayout(bankrollNoPayout(out, attemptsAffordableCount)),
        ],
    ];
}

function evalPaceRows(
    out: SimOutputs,
    inputs: TradingInputs,
    plan: Plan,
): readonly SummaryRow[] {
    if (plan.isInstantFunded) {
        return [
            ['net R to pass', NO_EVAL_INSTANT_FUNDED],
            [WALK_LABEL, NO_EVAL_INSTANT_FUNDED],
        ];
    }
    if (inputs.ladder) {
        return [
            ['net R to pass', NO_SINGLE_RISK_LADDER],
            [WALK_LABEL, NO_SINGLE_RISK_LADDER],
        ];
    }
    const requiredRQuantity = requiredR(
        dollars(out.profitTarget),
        dollars(inputs.riskPerTrade),
    );
    const netRLine =
        requiredRQuantity.value === null
            ? formatQuantityReason(requiredRQuantity.reason)
            : `${requiredRQuantity.value.toFixed(1)}R`;
    const expectancy = expectancyPerTradeR(inputs.winrate, inputs.rrRatio);
    let walkLine: string;
    if (expectancy.value === null || expectancy.value < 0) {
        walkLine = 'no positive edge';
    } else {
        const pace = evalPace({
            drawdown: dollars(out.drawdownAmount),
            riskPerTrade: dollars(inputs.riskPerTrade),
            rrRatio: inputs.rrRatio,
            target: dollars(out.profitTarget),
            winrate: inputs.winrate,
        });
        walkLine =
            pace.value === null
                ? formatQuantityReason(pace.reason)
                : `${formatPercent(pace.value.passProbability)} pass, ${pace.value.expectedTradesUntilPassOrBust.toFixed(1)} trades to pass or bust (simulated trades per pass ${out.tradesPerSuccessfulAttempt.toFixed(1)})`;
    }
    return [
        ['net R to pass', netRLine],
        [WALK_LABEL, walkLine],
    ];
}

function formatBatchLoss(risk: BankrollRisk): string {
    if (risk.lossProbability === null) {
        return formatQuantityReason(EconomicsReason.InvalidInput);
    }
    const { standardError, value } = risk.lossProbability;
    return formatPercentWithSe(value, standardError);
}

function formatMinimumBudget(
    quantity: Quantity<number>,
    costPerSample: Dollars,
    threshold: Fraction0to1 | null,
    unit: LossSampleUnit,
): string {
    if (threshold !== null && quantity.value !== null) {
        const samples = quantity.value;
        const budget = dollars(samples * costPerSample);
        return `${formatCurrency(budget)} (${samples} ${unitWord(unit, samples)}, P(batch net < 0) at or below ${formatPercent(threshold)} from there up to ${MAX_LOSS_TARGET_CAP} ${unitWord(unit, MAX_LOSS_TARGET_CAP)})`;
    }
    if (quantity.value !== null) {
        return formatQuantityReason(EconomicsReason.InvalidInput);
    }
    if (quantity.reason === EconomicsReason.NoPositiveEdge) {
        return 'no positive edge';
    }
    return quantity.reason === EconomicsReason.ThresholdNotSet
        ? 'threshold not set'
        : formatQuantityReason(quantity.reason);
}

function formatNoPayout(probability: null | number): string {
    return probability === null
        ? formatQuantityReason(EconomicsReason.InvalidInput)
        : `${formatPercent(probability, 3)} (ignores payout size)`;
}

function formatQuantityReason(reason: EconomicsReason): string {
    return `n/a: ${ECONOMICS_REASON_TEXT[reason]}`;
}

function fundedValueLabel(fundedHorizonDays: number): string {
    return `funded value (engine, ${fundedHorizonDays} funded days, credit-free)`;
}

function minimumBudgetRow(
    out: SimOutputs,
    inputs: TradingInputs,
    threshold: Fraction0to1 | null,
): SummaryRow {
    const isTrialUnit = inputs.maxAttempts > 1;
    const unit = isTrialUnit ? LossSampleUnit.Trial : LossSampleUnit.Attempt;
    const costPerSample = dollars(
        isTrialUnit ? out.expectedTotalCost : out.costPerAttempt,
    );
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        out.netValues,
        costPerSample,
    );
    const quantity = minimumAttemptsForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        lossProbability: (samples) => {
            const result = batchLossClosedForm({
                attemptCost: costPerSample,
                attempts: samples,
                pAttemptPays,
                valuePerPayingAttempt,
            });
            return result.value ?? 1;
        },
        meanNetPerSample: dollars(mean(out.netValues)),
        sampleUnit: unit,
        threshold,
    });
    return [
        'minimum budget for the loss target',
        formatMinimumBudget(quantity, costPerSample, threshold, unit),
    ];
}

function payoutDistributionLine(distribution: readonly number[]): string {
    return distribution.length === 0
        ? 'n/a (no trial reached funded)'
        : distribution
              .map(
                  (probability, index) =>
                      `${index === distribution.length - 1 ? '10+' : String(index)}: ${formatPercent(probability)}`,
              )
              .join(' | ');
}

function unitWord(unit: LossSampleUnit, count: number): string {
    switch (unit) {
        case LossSampleUnit.Attempt: {
            return count === 1 ? 'attempt' : 'attempts';
        }
        case LossSampleUnit.Trial: {
            return count === 1 ? 'trial' : 'trials';
        }
    }
}
