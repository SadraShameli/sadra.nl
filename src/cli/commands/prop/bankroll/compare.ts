import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    printEdgePlausibilityNotes,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency } from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import {
    BankrollLeverLabel,
    compareCycles,
    impliedCycleMultiple,
} from '~/lib/prop-calculator/economics';
import { simulateBankrollTimeline } from '~/lib/prop-calculator/portfolioTimeline';

import {
    bankrollCompareArguments,
    readBankrollCompareInputs,
    toBankrollTimelineInputs,
} from './bankrollFlags';

export const compareArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollCompareArguments,
};

const COMPARE_TRIALS = 500;

const command = defineCommand({
    args: compareArguments,
    meta: {
        description:
            'Compare bankroll cycles across eval risk what-ifs, or a closed-form multiple comparison',
        name: 'compare',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const compare = readBankrollCompareInputs(context.args);

            ui.heading(`${plan.label}: bankroll compare`);

            if (compare.multiples !== null) {
                ui.muted(
                    '  deterministic illustration, not a forecast (constant multiple, no caps, no variance):',
                );
                ui.muted(
                    `  assumed: ${compare.multiples.map(({ cycleDays, multiple }) => `${multiple.toFixed(2)}x every ${cycleDays} days`).join(', ')} from ${formatCurrency(compare.start)} over ${compare.horizonDays} days`,
                );
                const table = new TablePrinter([
                    { align: 'left', label: 'multiple@days', width: 16 },
                    { align: 'right', label: 'final bankroll', width: 16 },
                ]);
                table.printHeader();
                const results = compareCycles(
                    compare.start,
                    compare.multiples,
                    compare.horizonDays,
                );
                for (const [index, cycle] of compare.multiples.entries()) {
                    const value = results[index]?.value;
                    table.printRow([
                        `${cycle.multiple}@${cycle.cycleDays}`,
                        value === null || value === undefined
                            ? 'n/a'
                            : formatCurrency(value),
                    ]);
                }
                return;
            }

            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    fundedTradesPerDay: inputs.fundedTradesPerDay,
                    rrRatio: inputs.rrRatio,
                    tradesPerDay: inputs.tradesPerDay,
                    winrate: inputs.winrate,
                }),
            );

            const isWhatIf = compare.risks !== null;
            const risks = compare.risks ?? [inputs.riskPerTrade];
            const table = new TablePrinter([
                { align: 'right', label: 'risk', width: 10 },
                { align: 'right', label: 'cycle days', width: 12 },
                { align: 'right', label: 'multiple/cycle', width: 16 },
                { align: 'right', label: 'final bankroll (P50)', width: 22 },
                { align: 'right', label: 'P10 to P90 band', width: 34 },
                { align: 'left', label: 'note', width: 40 },
            ]);
            table.printHeader();
            for (const risk of risks) {
                const timelineInputs = toBankrollTimelineInputs(
                    inputs,
                    plan,
                    {
                        maxConcurrentAccounts: null,
                        monthlyBudget: null,
                        payoutLagDays: 0,
                        reinvestFraction: fraction(1),
                        roundBudget: compare.roundBudget,
                        startingBankroll: compare.start,
                    },
                    compare.horizonDays,
                    COMPARE_TRIALS,
                );
                const out = simulateBankrollTimeline({
                    ...timelineInputs,
                    riskPerTrade: risk,
                });
                const lastIndex = out.days.length - 1;
                const finalP50 = out.cashP50[lastIndex] ?? 0;
                const cycleMultiple =
                    out.measuredCycleDays === null
                        ? null
                        : impliedCycleMultiple(
                              compare.start,
                              finalP50,
                              out.measuredCycleDays,
                              compare.horizonDays,
                          );
                table.printRow([
                    String(risk),
                    out.measuredCycleDays === null
                        ? 'n/a'
                        : out.measuredCycleDays.toFixed(1),
                    cycleMultiple === null
                        ? 'n/a'
                        : `${cycleMultiple.toFixed(2)}x`,
                    formatCurrency(finalP50),
                    `${formatCurrency(out.cashP10[lastIndex] ?? 0)} to ${formatCurrency(out.cashP90[lastIndex] ?? 0)}`,
                    isWhatIf ? BankrollLeverLabel.ConflictsWithHardRule3 : '',
                ]);
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export default command;
