import { defineCommand } from 'citty';

import {
    describeStopRule,
    formatDaysToPass,
    pathGranularityComparisonArgument,
    planArguments,
    planResolver,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatOptionalPercent,
    formatPercent,
} from '~/lib/format';
import {
    type ContractCount,
    contractLimitAt,
    oneContractRisk,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    type SimOutputs,
    simulate,
    TradingPhase,
    wholeContractRisk,
} from '~/lib/prop-calculator';

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
            const label = simSpinnerLabel(plan.label, inputs.trials);
            spinner = ui.spinner(label).start();

            const out = simulate(inputs.toSimInputs(plan));
            spinner.succeed(label);

            ui.heading(plan.label);
            const [riskLine, runLine] = simHeaderLines(inputs, plan);
            ui.muted(riskLine);
            ui.muted(`${runLine}\n`);

            const table = new TablePrinter([
                { align: 'left', label: '', width: 22 },
                { label: '', width: 0 },
            ]);
            for (const row of simSummaryRows(out)) {
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
        `  eval risk ${evalRisk} stop ${describeStopRule(inputs.dayStop)} | funded flat $${fundedRisk}${placedFundedRisk(inputs, fundedRisk, plan)} x${fundedTpd}/day 1:${fundedRr}`,
        `  ${(inputs.winrate * 100).toFixed(0)}% WR | eval 1:${inputs.rrRatio} | max attempts ${inputs.maxAttempts} | seed ${inputs.seed} | ${inputs.fundedHorizonDays} funded days`,
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

function formatPlacedDollars(amount: number): string {
    const cents = Math.round(amount * 100);
    return formatCurrency(cents / 100, cents % 100 === 0 ? 0 : 2);
}

function fundedStartContractLimit(
    plan: Plan,
    positionSizing: PositionSizingConfig,
): ContractCount | null {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return contractLimitAt(
        plan.contractLimits,
        TradingPhase.Funded,
        positionSizing.instrument.isMicro,
        plan.tierProfitContext(state),
    );
}

function placedCapNote(
    plan: Plan | undefined,
    placed: number,
    uncapped: number,
): string {
    if (plan === undefined) return ', before any contract limit';
    return placed < uncapped
        ? ', capped at the funded contract limit at the start tier'
        : '';
}

function placedFundedRisk(
    inputs: TradingInputs,
    fundedRisk: number,
    plan: Plan | undefined,
): string {
    const positionSizing = resolvePositionSizing(
        inputs.instrument,
        inputs.stopPoints,
    );
    if (positionSizing === null) return '';
    const uncapped = wholeContractRisk(fundedRisk, positionSizing, null);
    const placed = wholeContractRisk(
        fundedRisk,
        positionSizing,
        plan === undefined
            ? null
            : fundedStartContractLimit(plan, positionSizing),
    );
    const contractCount = Math.round(placed / oneContractRisk(positionSizing));
    return ` (placed ${formatPlacedDollars(placed)}: ${contractCount} ${positionSizing.instrument.symbol} at ${positionSizing.stopPoints} pt${placedCapNote(plan, placed, uncapped)})`;
}
