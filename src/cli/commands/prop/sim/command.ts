import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import { simulate } from '~/lib/prop-calculator';

export default defineCommand({
    args: { ...planArguments, ...tradingArguments },
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
            const granularities = inputs.intradayPathStepsPerR;
            spinner = ui
                .spinner(`${plan.label} · ${inputs.trials} trials`)
                .start();

            const out = simulate(inputs.toSimInputs(plan));
            spinner.succeed(`${plan.label} · ${inputs.trials} trials`);

            const fundedRisk = inputs.fundedRiskPerTrade ?? inputs.riskPerTrade;
            const fundedRr = inputs.fundedRrRatio ?? inputs.rrRatio;
            const fundedTpd = inputs.fundedTradesPerDay ?? inputs.tradesPerDay;

            ui.heading(plan.label);
            ui.muted(
                `  eval risk ${inputs.ladder ? `ladder [${inputs.ladder.join(', ')}] stop ${inputs.dayStop.kind}` : `flat $${inputs.riskPerTrade} x${inputs.tradesPerDay}/day`} | funded flat $${fundedRisk} x${fundedTpd}/day 1:${fundedRr}`,
            );
            ui.muted(
                `  ${(inputs.winrate * 100).toFixed(0)}% WR | eval 1:${inputs.rrRatio} | seed ${inputs.seed} | ${inputs.fundedHorizonDays} funded days\n`,
            );

            const table = new TablePrinter([
                { align: 'left', label: '', width: 22 },
                { label: '', width: 0 },
            ]);
            table.printRow(['pass rate', formatPercent(out.passProbability)]);
            table.printRow([
                'bust in eval',
                formatPercent(out.bustProbability),
            ]);
            table.printRow([
                'bust when funded',
                formatPercent(out.fundedBustProbability),
            ]);
            table.printRow([
                'inactivity closure',
                formatPercent(out.inactivityClosureProbability),
            ]);
            table.printRow(['timeout', formatPercent(out.timeoutProbability)]);
            table.printRow([
                'days to pass (p50)',
                out.daysToPassP50.toFixed(1),
            ]);
            table.printRow([
                'days to pass (p95)',
                out.daysToPassP95.toFixed(1),
            ]);
            table.printRow([
                'expected attempts',
                out.expectedAttempts.toFixed(2),
            ]);
            table.printRow([
                'total cost',
                formatCurrency(out.expectedTotalCost),
            ]);
            table.printRow([
                'cost / funded acct',
                formatCurrency(out.costPerFundedAccount),
            ]);
            table.printRow([
                'cost / drawdown $',
                out.costPerDrawdownDollar.toFixed(4),
            ]);
            table.printRow([
                'gross payout',
                formatCurrency(out.expectedGrossPayout),
            ]);
            table.printRow([
                'payouts / account',
                out.expectedPayoutCount.toFixed(2),
            ]);
            table.printRow([
                'payout / funded acct',
                formatCurrency(out.expectedPayoutPerFundedAccount),
            ]);
            table.printRow(['net', formatCurrency(out.expectedNet)]);
            table.printRow([
                'monthly net',
                formatCurrency(out.expectedMonthlyNet),
            ]);
            table.printRow(['ROI on cost', formatPercent(out.roiOnCost.value)]);
            table.printRow([
                'expectancy per trade',
                formatCurrency(out.expectancyDollars),
            ]);
            table.printRow([
                'max drawdown (p95)',
                formatCurrency(out.maxDrawdownP95),
            ]);
            table.printRow([
                'loss streak (p95)',
                out.maxLosingStreakP95.toFixed(0),
            ]);

            if (granularities !== undefined && granularities.length > 1) {
                ui.heading('intraday path-walk granularity comparison');
                const granularityTable = new TablePrinter([
                    { label: 'steps/R', width: 8 },
                    { label: 'bust when funded', width: 18 },
                    { label: 'monthly net', width: 12 },
                ]);
                granularityTable.printHeader();
                for (const [index, stepsPerR] of granularities.entries()) {
                    const granularityOut =
                        index === 0
                            ? out
                            : simulate({
                                  ...inputs.toSimInputs(plan),
                                  intradayPathStepsPerR: stepsPerR,
                              });
                    granularityTable.printRow([
                        String(stepsPerR),
                        formatPercent(granularityOut.fundedBustProbability),
                        formatCurrency(granularityOut.expectedMonthlyNet),
                    ]);
                }
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
