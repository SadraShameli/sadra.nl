import type { ArgsDef } from 'citty';

import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    commissionArgument,
    commonSimArguments,
    idleDayProbabilityArgument,
    readFraction,
    readInteger,
    readNonNegativeNumber,
    readPercentAsFraction,
    readPositiveInteger,
    readPositiveNumber,
    TablePrinter,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatConjunctionList,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    dollars,
    findLivePlanBuilder,
    findLiveTransitionPlanBuilder,
    FirmId,
    type InstrumentSymbol,
    type LiveCushionPercent,
    type LiveOutputs,
    type LivePlan,
    type LivePlanBuilder,
    type LiveSimInputs,
    LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
    oneOffLiveCredit,
    type PayoutTier,
    simulateLiveAccount,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';

export interface LiveArguments {
    commission: string;
    'cushion-percent-post-lock': string;
    'cushion-percent-pre-lock': string;
    'horizon-days': string;
    'idle-day-probability': string;
    instrument: InstrumentSymbol;
    'request-size'?: string;
    rr: string;
    seed: string;
    'stop-points'?: string;
    tpd: string;
    'transition-profit'?: string;
    trials: string;
    winrate: string;
}

const MODELED_LIVE_FIRMS = Object.values(FirmId).filter(
    (id) => findLivePlanBuilder(id) !== undefined,
);

const TRANSITION_CREDIT_FIRMS = Object.values(FirmId).filter(
    (id) => findLiveTransitionPlanBuilder(id) !== undefined,
);

const DEFAULT_CUSHION_PERCENT = { postLock: '10', preLock: '5' } as const;

export function describeLucidDailyTransitionProfit(plan: LivePlan): string {
    return `Lucid Daily live only: sim profit above the buffer at the live transition, paid out once at the ${describeTraderShare(plan.payoutTiers)} split and capped at ${formatCurrency(LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP)} (shown as a one-off credit, never annualized). Omit for a live account with no transition credit`;
}

const LIVE_SIZING = `live risk is a percent of the drawdown cushion placed in whole contracts at that stop (with --instrument, default ${commonSimArguments.instrument.default}), at least one contract and at most the live contract limit`;

const LIVE_STOP_POINTS_REFUSAL = `prop live needs --stop-points: ${LIVE_SIZING}. Add --stop-points.`;

export const liveArguments = {
    ...commonSimArguments,
    ...commissionArgument,
    ...idleDayProbabilityArgument,
    'cushion-percent-post-lock': {
        default: DEFAULT_CUSHION_PERCENT.postLock,
        description:
            'Percent of drawdown cushion risked per trade after the threshold locks (0-100)',
        type: 'string',
    },
    'cushion-percent-pre-lock': {
        default: DEFAULT_CUSHION_PERCENT.preLock,
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
        default: String(TRADING_DAYS_PER_YEAR),
        description: 'Live-account horizon in trading days',
        type: 'string',
    },
    'request-size': {
        description:
            "Per payout request: a dollar amount, or 'all' to withdraw everything down to one cent above the drawdown floor. Default: withdraw only the excess above one full drawdown of cushion. On a live plan with a seed Reserve, released seed Reserve is held back until every increment is released, and 'all' also withdraws the starting seed above the floor; any withdrawal of seed or Reserve is reported as capital returned, never annualized",
        type: 'string',
    },
    'stop-points': {
        description: `Required stop distance in points: ${LIVE_SIZING}`,
        type: 'string',
    },
    'transition-profit': {
        get description(): string {
            return describeLucidDailyTransitionProfit(
                buildLucidTransitionPlan(),
            );
        },
        type: 'string',
    },
} satisfies ArgsDef;

const DRAIN_TO_FLOOR = 'all';

const liveWithdrawalSchema = z.union([
    z.string().trim().toLowerCase().pipe(z.literal(DRAIN_TO_FLOOR)),
    z
        .string()
        .trim()
        .min(1)
        .pipe(z.coerce.number())
        .pipe(z.number().positive()),
]);

export function describeAnnualWithdrawalRate(horizonDays: number): string {
    return horizonDays === TRADING_DAYS_PER_YEAR
        ? 'expected annual withdrawal rate'
        : `annual rate (scaled from ${horizonDays}d)`;
}

export function describeLiveWithdrawal(inputs: LiveSimInputs): string {
    const seedReserve = inputs.plan.seedReserveTerms();
    const reserveNote =
        seedReserve === null
            ? ''
            : `; released seed Reserve is held back until all ${seedReserve.increments} increments are out`;
    if (inputs.retainedCushion === 0) {
        const seedNote =
            seedReserve === null ? '' : ', seed included as capital returned';
        return `withdraw: everything down to one cent above the floor (--request-size ${DRAIN_TO_FLOOR})${seedNote}${reserveNote}`;
    }
    const cushion = formatCurrency(
        inputs.plan.resolveRetainedCushion(inputs.retainedCushion),
    );
    return inputs.payoutRequestSize === undefined
        ? `withdraw: excess above ${cushion} cushion${reserveNote}`
        : `withdraw: ${formatCurrency(inputs.payoutRequestSize)}/request above ${cushion} cushion${reserveNote}`;
}

export function describeSeedReserve(plan: LivePlan): null | string {
    const reserve = plan.seedReserveTerms();
    if (reserve === null) return null;
    const increment = reserve.amount / reserve.increments;
    return `seed Reserve: ${formatCurrency(reserve.amount)} in ${reserve.increments} releases of ${formatCurrency(increment)}, one per review every ${reserve.reviewIntervalSessions} sessions after ${formatCurrency(reserve.profitTargetPerIncrement)} of net profit, landing ${reserve.depositLagSessions} sessions later (assumes a ${formatCurrency(plan.startingBalance + reserve.amount)} transferred balance, not an input)`;
}

export function liveSummaryRows(
    inputs: LiveSimInputs,
    out: LiveOutputs,
): [string, string][] {
    const rows: [string, string][] = [
        ['bust probability', formatPercent(out.liveBustProbability)],
        [
            'inactivity closure probability',
            formatPercent(out.liveInactivityClosureProbability),
        ],
        ['median days to bust', out.medianDaysToBust.toFixed(1)],
        [
            'median days to 1st withdrawal',
            out.medianDaysToFirstWithdrawal.toFixed(1),
        ],
    ];
    const credit = oneOffLiveCredit(inputs.plan);
    const withdrawalsLabel = describeWithdrawalsAtHorizon([
        [credit, 'transition credit'],
        [out.expectedCapitalReturned, 'capital returned'],
        [out.expectedLiquidationPayout, 'liquidation payout'],
    ]);
    rows.push(
        [
            `${withdrawalsLabel} (p5)`,
            formatCurrency(out.cumulativeWithdrawalsP5),
        ],
        [
            `${withdrawalsLabel} (p50)`,
            formatCurrency(out.cumulativeWithdrawalsP50),
        ],
        [
            `${withdrawalsLabel} (p95)`,
            formatCurrency(out.cumulativeWithdrawalsP95),
        ],
    );
    if (credit > 0) {
        rows.push([
            'one-off transition credit (not annualized)',
            formatCurrency(credit),
        ]);
    }
    if (out.expectedCapitalReturned > 0) {
        rows.push([
            'expected capital returned (not annualized)',
            formatCurrency(out.expectedCapitalReturned),
        ]);
    }
    if (out.expectedLiquidationPayout > 0) {
        rows.push([
            'expected liquidation payout (not annualized)',
            formatCurrency(out.expectedLiquidationPayout),
        ]);
    }
    rows.push([
        describeAnnualWithdrawalRate(inputs.horizonDays),
        formatCurrency(out.expectedAnnualWithdrawalRate),
    ]);
    return rows;
}

export function parseLiveSimInputs(
    arguments_: LiveArguments,
    buildLivePlan: LivePlanBuilder,
): LiveSimInputs {
    const stopPoints = readLiveStopPoints(arguments_['stop-points']);
    const plan = buildLivePlan(
        readCushionPercent(
            arguments_['cushion-percent-pre-lock'],
            arguments_['cushion-percent-post-lock'],
        ),
    );
    const withdrawal = readLiveWithdrawal(arguments_['request-size']);
    return {
        ...withdrawal,
        commissionPerRoundTrip: readNonNegativeNumber(
            arguments_.commission,
            'commission',
        ),
        horizonDays: readPositiveInteger(
            arguments_['horizon-days'],
            'horizon-days',
        ),
        idleDayProbability: readFraction(
            arguments_['idle-day-probability'],
            'idle-day-probability',
        ),
        instrument: arguments_.instrument,
        payoutRequestSize: resolveRequestSize(
            plan,
            withdrawal.payoutRequestSize,
        ),
        plan,
        rrRatio: readPositiveNumber(arguments_.rr, 'rr'),
        seed: readInteger(arguments_.seed, 'seed'),
        stopPoints,
        tradesPerDay: readPositiveInteger(arguments_.tpd, 'tpd'),
        trials: readPositiveInteger(arguments_.trials, 'trials'),
        winrate: readFraction(arguments_.winrate, 'winrate'),
    };
}

export function readLiveWithdrawal(
    raw: string | undefined,
): Pick<LiveSimInputs, 'payoutRequestSize' | 'retainedCushion'> {
    if (raw === undefined) {
        return { payoutRequestSize: undefined, retainedCushion: undefined };
    }
    const parsed = liveWithdrawalSchema.safeParse(raw);
    if (!parsed.success) {
        throw new TypeError(
            `--request-size must be a positive amount or '${DRAIN_TO_FLOOR}', got "${raw}"`,
        );
    }
    return parsed.data === DRAIN_TO_FLOOR
        ? { payoutRequestSize: undefined, retainedCushion: 0 }
        : { payoutRequestSize: parsed.data, retainedCushion: undefined };
}

export function resolveLivePlanBuilder(
    firmId: FirmId,
    rawTransitionProfit: string | undefined,
): LivePlanBuilder {
    if (rawTransitionProfit === undefined) {
        const buildLivePlan = findLivePlanBuilder(firmId);
        if (!buildLivePlan) {
            throw new Error(
                `--firm ${firmId} is not yet modeled for prop live (modeled: ${MODELED_LIVE_FIRMS.join(', ')}).`,
            );
        }
        return buildLivePlan;
    }
    const buildWithCredit = findLiveTransitionPlanBuilder(firmId);
    if (!buildWithCredit) {
        throw new TypeError(
            `--transition-profit applies only to a firm with a modeled one-off live transition credit (${TRANSITION_CREDIT_FIRMS.join(', ')}), not --firm ${firmId}`,
        );
    }
    const transitionProfit = dollars(
        readNonNegativeNumber(rawTransitionProfit, 'transition-profit'),
    );
    return (cushionPercent) =>
        buildWithCredit(cushionPercent, transitionProfit);
}

function buildLucidTransitionPlan(): LivePlan {
    const buildWithCredit = findLiveTransitionPlanBuilder(FirmId.Lucid);
    if (!buildWithCredit) {
        throw new Error(
            '--transition-profit help: Lucid has no live transition plan builder',
        );
    }
    return buildWithCredit(
        readCushionPercent(
            DEFAULT_CUSHION_PERCENT.preLock,
            DEFAULT_CUSHION_PERCENT.postLock,
        ),
        LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
    );
}

function describeTraderShare(tiers: readonly PayoutTier[]): string {
    return tiers
        .map((tier) => tier.traderShare)
        .filter((share, index, shares) => share !== shares[index - 1])
        .map((share) => formatPercent(share, 0))
        .join(' then ');
}

function describeWithdrawalsAtHorizon(
    oneOffs: readonly (readonly [number, string])[],
): string {
    const included = oneOffs
        .filter(([amount]) => amount > 0)
        .map(([, name]) => name);
    return included.length === 0
        ? 'withdrawals at horizon'
        : `withdrawals at horizon, incl. ${formatConjunctionList(included)}`;
}

export default defineCommand({
    args: liveArguments,
    meta: {
        description: `Simulate a standalone live-capital account (--firm), sized by percent of drawdown cushion instead of a static risk ladder. Live sizing needs --stop-points: ${LIVE_SIZING}.`,
        name: 'live',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const buildLivePlan = resolveLivePlanBuilder(
                context.args.firm,
                context.args['transition-profit'],
            );

            const inputs = parseLiveSimInputs(context.args, buildLivePlan);
            const plan = inputs.plan;

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
                `  ${(inputs.winrate * 100).toFixed(0)}% WR | idle ${formatPercent(inputs.idleDayProbability ?? 0)} | commission ${formatCurrency(inputs.commissionPerRoundTrip ?? 0, 2)}/rt | seed ${inputs.seed} | ${inputs.horizonDays} live days`,
            );
            const seedReserve = describeSeedReserve(plan);
            if (seedReserve !== null) ui.muted(`  ${seedReserve}`);
            ui.muted(`  ${describeLiveWithdrawal(inputs)}\n`);

            const table = new TablePrinter([
                { align: 'left', label: '', width: 30 },
                { label: '', width: 0 },
            ]);
            for (const row of liveSummaryRows(inputs, out)) {
                table.printRow(row);
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

function readCushionPercent(
    rawPreLock: string,
    rawPostLock: string,
): LiveCushionPercent {
    return {
        postLock: readPercentAsFraction(
            rawPostLock,
            'cushion-percent-post-lock',
        ),
        preLock: readPercentAsFraction(rawPreLock, 'cushion-percent-pre-lock'),
    };
}

function readLiveStopPoints(raw: string | undefined): number {
    if (raw === undefined) throw new TypeError(LIVE_STOP_POINTS_REFUSAL);
    return readPositiveNumber(raw, 'stop-points');
}

function resolveRequestSize(
    plan: LivePlan,
    requestSize: number | undefined,
): number | undefined {
    try {
        return plan.resolvePayoutRequestSize(requestSize);
    } catch (error) {
        throw new TypeError(
            `--request-size ${requestSize}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
}
