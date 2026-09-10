import { defineCommand } from 'citty';

import {
    describeShare,
    planArguments,
    planResolver,
    readInstrument,
    readNumber,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type LadderScore,
    minStopPoints,
    type Plan,
    runLadderSearch,
} from '~/lib/prop-calculator';

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        lo: {
            default: '100',
            description: 'Smallest rung to search',
            type: 'string',
        },
        max: {
            description: 'Largest rung to search (default: 40% of cushion)',
            type: 'string',
        },
        rungs: {
            default: '4',
            description: 'Ladder length',
            type: 'string',
        },
        step: {
            default: '100',
            description: 'Grid step between rungs',
            type: 'string',
        },
        top: {
            default: '10',
            description: 'Rows to show per ranking',
            type: 'string',
        },
    },
    meta: {
        description:
            'Grid-search the optimal within-day risk ladder for one plan (--firm, --variant).',
        name: 'ladder',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const plan = planResolver.resolveOne(context.args);
            if (plan.isInstantFunded) {
                ui.warn(
                    `${plan.label} has no real evaluation phase — it funds instantly (profit target $0), so there's no eval to grid-search a ladder against.`,
                );
                ui.muted(
                    '  Use `cli prop sim` instead: it applies flat funded sizing from day one for this plan.',
                );
                return;
            }
            const inputs = TradingInputs.parse(context.args);
            const instrument = readInstrument(context.args.instrument);
            const cushion = plan.drawdown.amount;
            const max = readNumber(
                context.args.max ?? Math.round(cushion * 0.4),
                'max',
            );
            const topN = readNumber(context.args.top, 'top');
            const grid = {
                lo: readNumber(context.args.lo, 'lo'),
                max,
                slots: readNumber(context.args.rungs, 'rungs'),
                step: readNumber(context.args.step, 'step'),
            };

            spinner = ui.spinner(`searching ${plan.label}`).start();
            const started = performance.now();
            const result = runLadderSearch({
                grid,
                score: {
                    cushion,
                    evalPrice: plan.fees.oneTimeEval + plan.fees.activation,
                    maxDays: inputs.maxEvalDays,
                    plan,
                    rrRatio: inputs.rrRatio,
                    rungSizing: inputs.rungSizing,
                    seedOffset: 0,
                    sims: inputs.trials,
                    stopRule: inputs.dayStop,
                    winrate: inputs.winrate,
                },
                seed: inputs.seed,
                topN,
            });
            const elapsed = (performance.now() - started) / 1000;
            spinner.succeed(`searched ${plan.label} in ${elapsed.toFixed(1)}s`);

            ui.heading(plan.label);
            ui.muted(
                `  cushion ${formatCurrency(cushion)} | target ${formatCurrency(plan.profitTarget)} | consistency ${describeShare(plan.evalConsistencyRule()?.maxBestDayShare)} | min days ${plan.minTradingDays}`,
            );
            ui.muted(
                `  grid ${formatCurrency(grid.lo)}-${formatCurrency(grid.max)} step ${formatCurrency(grid.step)} x${grid.slots} | ${inputs.trials} sims | stop ${inputs.dayStop.kind}`,
            );
            ui.muted(
                `  ${result.gridSize} raw -> ${result.laddersScored} distinct (${result.droppedAliasCount} aliases removed) in ${elapsed.toFixed(1)}s\n`,
            );

            printTable(
                'FASTEST TO FUNDED',
                result.bySpeed,
                plan,
                instrument.pointValue,
            );
            printTable(
                'CHEAPEST PER FUNDED ACCOUNT',
                result.byCost,
                plan,
                instrument.pointValue,
            );
            printTable(
                'HIGHEST PASS RATE',
                result.byPassRate,
                plan,
                instrument.pointValue,
            );

            ui.heading(
                `EFFICIENT FRONTIER (${result.frontier.length} non-dominated)`,
            );
            for (const score of result.frontier) {
                ui.muted(
                    `  ${score.ladder.join(' / ').padEnd(26)} ${score.expectedDaysToFunded.toFixed(1).padStart(6)}d  ${formatCurrency(score.costPerFunded).padStart(7)}`,
                );
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

function printTable(
    title: string,
    rows: readonly LadderScore[],
    plan: Plan,
    pointValue: number,
): void {
    ui.heading(title);
    const table = new TablePrinter([
        { align: 'left', label: 'ladder', width: 26 },
        { label: 'pass', width: 6 },
        { label: 'days', width: 7 },
        { label: '$/acct', width: 8 },
        { label: 'min stop', width: 9 },
    ]);
    table.printHeader();
    for (const score of rows) {
        const cap = plan.contractLimits?.evalMinis ?? null;
        const stop =
            cap === null
                ? null
                : minStopPoints(Math.max(...score.ladder), cap, pointValue);
        table.printRow([
            score.ladder.join(' / '),
            formatPercent(score.passRate),
            score.expectedDaysToFunded.toFixed(1),
            formatCurrency(score.costPerFunded),
            stop === null ? '—' : `${stop.toFixed(1)}pt`,
        ]);
    }
}
