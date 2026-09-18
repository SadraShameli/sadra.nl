import { defineCommand } from 'citty';

import {
    commonSimArguments,
    readNumber,
    TablePrinter,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    findLivePlanBuilder,
    FirmId,
    fraction,
    type Fraction0to1,
    type LiveSimInputs,
    simulateLiveAccount,
} from '~/lib/prop-calculator';

const MODELED_LIVE_FIRMS = Object.values(FirmId).filter(
    (id) => findLivePlanBuilder(id) !== undefined,
);

export default defineCommand({
    args: {
        ...commonSimArguments,
        'cushion-percent-post-lock': {
            default: '10',
            description:
                'Percent of drawdown cushion risked per trade after the threshold locks (0-100)',
            type: 'string',
        },
        'cushion-percent-pre-lock': {
            default: '5',
            description:
                'Percent of drawdown cushion risked per trade before the threshold locks (0-100)',
            type: 'string',
        },
        firm: {
            default: FirmId.Apex,
            description: `Firm with a modeled live account (${MODELED_LIVE_FIRMS.join(', ')})`,
            options: Object.values(FirmId),
            type: 'enum',
        },
        'horizon-days': {
            default: '252',
            description: 'Live-account horizon in trading days',
            type: 'string',
        },
    },
    meta: {
        description:
            'Simulate a standalone live-capital account (--firm), sized by percent of drawdown cushion instead of a static risk ladder.',
        name: 'live',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const firmId = context.args.firm;
            const buildLivePlan = findLivePlanBuilder(firmId);
            if (!buildLivePlan) {
                throw new Error(
                    `--firm ${firmId} is not yet modeled for prop live (modeled: ${MODELED_LIVE_FIRMS.join(', ')}).`,
                );
            }

            const plan = buildLivePlan({
                postLock: readPercent(
                    context.args['cushion-percent-post-lock'],
                    'cushion-percent-post-lock',
                ),
                preLock: readPercent(
                    context.args['cushion-percent-pre-lock'],
                    'cushion-percent-pre-lock',
                ),
            });

            const requestSize = context.args['request-size'];
            const stopPoints = context.args['stop-points'];
            const inputs: LiveSimInputs = {
                horizonDays: readNumber(
                    context.args['horizon-days'],
                    'horizon-days',
                ),
                idleDayProbability: readNumber(
                    context.args['idle-day-probability'],
                    'idle-day-probability',
                ),
                instrument: context.args.instrument,
                payoutRequestSize:
                    requestSize === undefined
                        ? undefined
                        : readNumber(requestSize, 'request-size'),
                plan,
                rrRatio: readNumber(context.args.rr, 'rr'),
                seed: readNumber(context.args.seed, 'seed'),
                stopPoints:
                    stopPoints === undefined
                        ? undefined
                        : readNumber(stopPoints, 'stop-points'),
                tradesPerDay: readNumber(context.args.tpd, 'tpd'),
                trials: readNumber(context.args.trials, 'trials'),
                winrate: readNumber(context.args.winrate, 'winrate'),
            };

            spinner = ui
                .spinner(`${plan.label} · ${inputs.trials} trials`)
                .start();
            const out = simulateLiveAccount(inputs);
            spinner.succeed(`${plan.label} · ${inputs.trials} trials`);

            ui.heading(plan.label);
            ui.muted(
                `  cushion ${formatPercent(plan.cushionPercent.preLock)} pre-lock / ${formatPercent(plan.cushionPercent.postLock)} post-lock | x${inputs.tradesPerDay}/day 1:${inputs.rrRatio}`,
            );
            ui.muted(
                `  ${(inputs.winrate * 100).toFixed(0)}% WR | seed ${inputs.seed} | ${inputs.horizonDays} live days\n`,
            );

            const table = new TablePrinter([
                { align: 'left', label: '', width: 30 },
                { label: '', width: 0 },
            ]);
            table.printRow([
                'bust probability',
                formatPercent(out.liveBustProbability),
            ]);
            table.printRow([
                'inactivity closure probability',
                formatPercent(out.liveInactivityClosureProbability),
            ]);
            table.printRow([
                'median days to bust',
                out.medianDaysToBust.toFixed(1),
            ]);
            table.printRow([
                'median days to 1st withdrawal',
                out.medianDaysToFirstWithdrawal.toFixed(1),
            ]);
            table.printRow([
                'withdrawals at horizon (p5)',
                formatCurrency(out.cumulativeWithdrawalsP5),
            ]);
            table.printRow([
                'withdrawals at horizon (p50)',
                formatCurrency(out.cumulativeWithdrawalsP50),
            ]);
            table.printRow([
                'withdrawals at horizon (p95)',
                formatCurrency(out.cumulativeWithdrawalsP95),
            ]);
            table.printRow([
                'expected annual withdrawal rate',
                formatCurrency(out.expectedAnnualWithdrawalRate),
            ]);
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

function readPercent(raw: string, name: string): Fraction0to1 {
    const value = readNumber(raw, name);
    if (value < 0 || value > 100) {
        throw new Error(`--${name} must be between 0 and 100, got "${raw}"`);
    }
    return fraction(value / 100);
}
