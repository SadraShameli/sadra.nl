import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency } from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import {
    BankrollLeverLabel,
    compareCycles,
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

export default defineCommand({
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

            const isWhatIf = compare.risks !== null;
            const risks = compare.risks ?? [inputs.riskPerTrade];
            const table = new TablePrinter([
                { align: 'right', label: 'risk', width: 10 },
                { align: 'right', label: 'cycle days', width: 12 },
                { align: 'right', label: 'final bankroll (P50)', width: 22 },
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
                        roundBudget: null,
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
                table.printRow([
                    String(risk),
                    out.measuredCycleDays === null
                        ? 'n/a'
                        : out.measuredCycleDays.toFixed(1),
                    formatCurrency(out.cashP50[lastIndex] ?? 0),
                    isWhatIf ? BankrollLeverLabel.ConflictsWithHardRule3 : '',
                ]);
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
