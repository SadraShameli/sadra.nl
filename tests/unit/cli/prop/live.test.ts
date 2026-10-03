import type { ArgsDef } from 'citty';

import { parseArgs, renderUsage } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';

import liveCommand, {
    describeAnnualWithdrawalRate,
    describeLiveWithdrawal,
    describeLucidDailyTransitionProfit,
    describeSeedReserve,
    liveArguments,
    liveSummaryRows,
    parseLiveSimInputs,
    readLiveWithdrawal,
    resolveLivePlanBuilder,
} from '~/cli/commands/prop/live/command';
import { tradingArguments } from '~/cli/commands/prop/shared';
import { formatCurrency } from '~/lib/format';
import {
    buildApexLivePlan,
    DailyLossLimitKind,
    dollars,
    findLivePlanBuilder,
    findLiveTransitionPlanBuilder,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    LIVE_TRANSITION_PLAN_BUILDERS,
    LivePlan,
    type LivePlanBuilder,
    type LiveSimInputs,
    type LiveTransitionPlanBuilder,
    LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
    simulateLiveAccount,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';
import * as firms from '~/lib/prop-calculator/firms';
import {
    buildLucidDailyLivePlan,
    LiveApplicabilityNote,
} from '~/lib/prop-calculator/firms';
import { LIVE_TRANSFER_NOTE_TEXT } from '~/lib/prop-calculator/simulator';

import { flagsNamedButNotAccepted } from './helpFlags';

const TOPSTEP_CUSHION = {
    postLock: fraction(0.05),
    preLock: fraction(0.05),
};

const HAND_COMPUTED_APEX_RUN = [
    '--trials',
    '1',
    '--winrate',
    '1',
    '--rr',
    '1',
    '--tpd',
    '1',
];

const LIVE_STOP = ['--stop-points', '10'];
const APEX_ONE_NQ_AT_150 = ['--stop-points', '7.5'];
const ONE_NQ_AT_100 = ['--stop-points', '5'];
const TOPSTEP_ONE_NQ_AT_450 = ['--stop-points', '22.5'];

function apexBuilder(): LivePlanBuilder {
    const builder = findLivePlanBuilder(FirmId.Apex);
    if (!builder) throw new Error('Apex has no live plan builder');
    return builder;
}

function mffuBuilder(): LivePlanBuilder {
    const builder = findLivePlanBuilder(FirmId.Mffu);
    if (!builder) throw new Error('MFFU has no live plan builder');
    return builder;
}

function parseLive(
    argv: string[],
    builder: LivePlanBuilder = apexBuilder(),
): LiveSimInputs {
    return parseLiveSimInputs(
        parseArgs<typeof liveArguments>(argv, liveArguments),
        builder,
    );
}

function parseSizedLive(
    argv: string[],
    builder: LivePlanBuilder = apexBuilder(),
): LiveSimInputs {
    return parseLive([...argv, ...LIVE_STOP], builder);
}

async function resolveCommandArguments(): Promise<ArgsDef> {
    const resolvable = liveCommand.args;
    if (!resolvable) throw new Error('live command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

function topStepBuilder(): LivePlanBuilder {
    const builder = findLivePlanBuilder(FirmId.TopStep);
    if (!builder) throw new Error('TopStep has no live plan builder');
    return builder;
}

describe('prop live declared arguments', () => {
    it('runs the command on the exported liveArguments', async () => {
        expect(await resolveCommandArguments()).toBe(liveArguments);
    });

    it('declares --idle-day-probability on the command with default 0', async () => {
        const parsed = parseArgs([], await resolveCommandArguments());
        expect(parsed['idle-day-probability']).toBe('0');
    });

    it('keeps a space-separated --idle-day-probability 0 as the string 0, not the boolean true', async () => {
        const parsed = parseArgs(
            ['--idle-day-probability', '0'],
            await resolveCommandArguments(),
        );
        expect(parsed['idle-day-probability']).toBe('0');
    });

    it('declares --commission on the command with default 0', async () => {
        const parsed = parseArgs([], await resolveCommandArguments());
        expect(parsed.commission).toBe('0');
    });

    it('shares the idle-day-probability and commission definitions with the trading commands', () => {
        expect(liveArguments['idle-day-probability']).toBe(
            tradingArguments['idle-day-probability'],
        );
        expect(liveArguments.commission).toBe(tradingArguments.commission);
    });
});

describe('parseLiveSimInputs --idle-day-probability', () => {
    it('defaults to 0 when the flag is omitted', () => {
        expect(parseSizedLive([]).idleDayProbability).toBe(0);
    });

    it('parses a space-separated 0 as 0, not 1', () => {
        expect(
            parseSizedLive(['--idle-day-probability', '0']).idleDayProbability,
        ).toBe(0);
    });

    it('parses 0.25', () => {
        expect(
            parseSizedLive(['--idle-day-probability', '0.25'])
                .idleDayProbability,
        ).toBe(0.25);
    });

    it.each(['1.5', '-0.1'])('rejects %s', (value) => {
        expect(() =>
            parseSizedLive([`--idle-day-probability=${value}`]),
        ).toThrow(/--idle-day-probability must be a fraction in \[0, 1\]/);
    });
});

describe('parseLiveSimInputs --commission', () => {
    it('defaults to 0 per round trip', () => {
        expect(parseSizedLive([]).commissionPerRoundTrip).toBe(0);
    });

    it('reaches commissionPerRoundTrip', () => {
        expect(
            parseSizedLive(['--commission', '10']).commissionPerRoundTrip,
        ).toBe(10);
    });

    it('rejects a negative commission', () => {
        expect(() => parseSizedLive(['--commission=-1'])).toThrow(
            /--commission must be a number >= 0/,
        );
    });
});

describe('parseLiveSimInputs cushion percents', () => {
    it('converts 5 and 10 percent to fractions, not raw percents', () => {
        const inputs = parseSizedLive([
            '--cushion-percent-pre-lock',
            '5',
            '--cushion-percent-post-lock',
            '10',
            '--trials',
            '10',
        ]);
        expect(inputs.plan.cushionPercent).toStrictEqual({
            postLock: 0.1,
            preLock: 0.05,
        });
    });

    it('converts 50 and 100 percent to 0.5 and 1', () => {
        const inputs = parseSizedLive([
            '--cushion-percent-pre-lock',
            '50',
            '--cushion-percent-post-lock',
            '100',
        ]);
        expect(inputs.plan.cushionPercent).toStrictEqual({
            postLock: 1,
            preLock: 0.5,
        });
    });

    it('defaults to 5 percent pre-lock and 10 percent post-lock', () => {
        expect(parseSizedLive([]).plan.cushionPercent).toStrictEqual({
            postLock: 0.1,
            preLock: 0.05,
        });
    });

    it('rejects a post-lock percent above 100', () => {
        expect(() =>
            parseSizedLive(['--cushion-percent-post-lock', '150']),
        ).toThrow(
            /--cushion-percent-post-lock must be a percent in \[0, 100\]/,
        );
    });

    it('rejects a negative pre-lock percent', () => {
        expect(() => parseSizedLive(['--cushion-percent-pre-lock=-1'])).toThrow(
            /--cushion-percent-pre-lock must be a percent in \[0, 100\]/,
        );
    });
});

describe('parseLiveSimInputs bounded readers', () => {
    it.each([
        ['trials', '0', /--trials must be a whole number >= 1/],
        ['trials', '1.5', /--trials must be a whole number >= 1/],
        ['horizon-days', '0', /--horizon-days must be a whole number >= 1/],
        ['tpd', '0', /--tpd must be a whole number >= 1/],
        ['rr', '0', /--rr must be a number > 0/],
        ['winrate', '40', /--winrate must be a fraction in \[0, 1\]/],
        ['seed', '1.5', /--seed must be a whole number/],
        [
            'request-size',
            '0',
            /--request-size must be a positive amount or 'all'/,
        ],
    ])('rejects --%s %s', (flag, value, message) => {
        expect(() => parseSizedLive([`--${flag}=${value}`])).toThrow(message);
    });

    it('rejects --stop-points -2', () => {
        expect(() => parseLive(['--stop-points=-2'])).toThrow(
            /--stop-points must be a number > 0/,
        );
    });

    it('maps every declared flag onto LiveSimInputs', () => {
        const inputs = parseLive([
            '--horizon-days',
            '30',
            '--rr',
            '1.5',
            '--seed',
            '7',
            '--tpd',
            '3',
            '--trials',
            '20',
            '--winrate',
            '0.55',
            '--request-size',
            '500',
            '--stop-points',
            '12',
            '--instrument',
            InstrumentSymbol.MNQ,
        ]);
        expect(inputs).toMatchObject({
            horizonDays: 30,
            instrument: InstrumentSymbol.MNQ,
            payoutRequestSize: 500,
            rrRatio: 1.5,
            seed: 7,
            stopPoints: 12,
            tradesPerDay: 3,
            trials: 20,
            winrate: 0.55,
        });
        expect(inputs.plan.label).toBe(buildApexLivePlan().label);
    });

    it('leaves the optional request size unset when omitted', () => {
        expect(parseSizedLive([]).payoutRequestSize).toBeUndefined();
    });
});

describe('readLiveWithdrawal (D4: keep one drawdown of cushion unless --request-size all)', () => {
    it('leaves both fields unset when omitted, so the engine keeps its default cushion', () => {
        expect(readLiveWithdrawal(undefined)).toStrictEqual({
            payoutRequestSize: undefined,
            retainedCushion: undefined,
        });
    });

    it.each(['all', 'ALL', ' All '])(
        'maps %j to a drain-to-floor withdrawal with no retained cushion',
        (raw) => {
            expect(readLiveWithdrawal(raw)).toStrictEqual({
                payoutRequestSize: undefined,
                retainedCushion: 0,
            });
        },
    );

    it('maps a dollar amount to a per-request size drawn from the excess above the default cushion', () => {
        expect(readLiveWithdrawal('500')).toStrictEqual({
            payoutRequestSize: 500,
            retainedCushion: undefined,
        });
    });

    it.each(['0', '-5', 'abc', '', 'allx'])('rejects %j', (raw) => {
        expect(() => readLiveWithdrawal(raw)).toThrow(
            /--request-size must be a positive amount or 'all'/,
        );
    });

    it("routes '--request-size all' through parseLiveSimInputs as retainedCushion 0", () => {
        const inputs = parseSizedLive(['--request-size', 'all']);
        expect(inputs.retainedCushion).toBe(0);
        expect(inputs.payoutRequestSize).toBeUndefined();
    });

    it('keeps retainedCushion unset for a numeric --request-size', () => {
        const inputs = parseSizedLive(['--request-size', '500']);
        expect(inputs.payoutRequestSize).toBe(500);
        expect(inputs.retainedCushion).toBeUndefined();
    });

    it("documents the default policy and the 'all' option in the --request-size help text, without em dashes", () => {
        const description = liveArguments['request-size'].description;
        expect(description).toContain("'all'");
        expect(description).toContain(
            'everything down to the lowest balance that stays alive',
        );
        expect(description).toContain(
            'exactly the floor on a strictly-below floor such as the Topstep LFA, one cent above it on the others',
        );
        expect(description).not.toContain('one cent above the drawdown floor');
        expect(description).toContain('one full drawdown of cushion');
        expect(description).not.toContain('\u{2014}');
    });

    it('says in the --request-size help text that released seed Reserve is held back until every increment is out, and that seed and Reserve withdrawals are capital, not annualized', () => {
        const description = liveArguments['request-size'].description;
        expect(description).toContain(
            'released seed Reserve is held back until every increment is released',
        );
        expect(description).toContain(
            'reported as capital returned, never annualized',
        );
        expect(description).not.toContain('never withdrawn');
        expect(description).not.toContain('counts that seed as income');
    });
});

describe('describeLiveWithdrawal', () => {
    it.each([
        { argv: [], expected: 'withdraw: excess above $2,000 cushion' },
        {
            argv: ['--request-size', '500'],
            expected: 'withdraw: $500/request above $2,000 cushion',
        },
        {
            argv: ['--request-size', 'all'],
            expected:
                'withdraw: everything down to the lowest balance that stays alive (--request-size all)',
        },
    ])('describes $argv as "$expected"', ({ argv, expected }) => {
        const inputs = parseSizedLive(argv, mffuBuilder());
        expect(describeLiveWithdrawal(inputs)).toBe(expected);
    });
});

describe('describeLiveWithdrawal on a live plan with a seed Reserve (TopStep LFA)', () => {
    it.each([
        {
            argv: [],
            expected:
                'withdraw: excess above $9,000 cushion; released seed Reserve is held back until all 4 increments are out',
        },
        {
            argv: ['--request-size', '500'],
            expected:
                'withdraw: $500/request above $9,000 cushion; released seed Reserve is held back until all 4 increments are out',
        },
        {
            argv: ['--request-size', 'all'],
            expected:
                'withdraw: everything down to the lowest balance that stays alive (--request-size all), seed included as capital returned; released seed Reserve is held back until all 4 increments are out',
        },
    ])('describes $argv as "$expected"', ({ argv, expected }) => {
        const inputs = parseSizedLive(argv, topStepBuilder());
        expect(describeLiveWithdrawal(inputs)).toBe(expected);
    });
});

describe('describeSeedReserve', () => {
    it('discloses the assumed TopStep Reserve and the transferred balance it implies', () => {
        expect(describeSeedReserve(topStepBuilder()(TOPSTEP_CUSHION))).toBe(
            'seed Reserve: $40,000 in 4 releases of $10,000, one per review every 5 sessions after $3,000 of net profit, landing 2 sessions later (assumes a $50,000 transferred balance, not an input)',
        );
    });

    it('is null for a live plan with no seed Reserve', () => {
        expect(describeSeedReserve(apexBuilder()(TOPSTEP_CUSHION))).toBeNull();
    });
});

describe('prop live --firm apex Live levels and minimum payout request', () => {
    it('sizes up to 100 micros and 10 minis at Level 1', () => {
        const inputs = parseLive(['--instrument', 'MNQ', '--stop-points', '4']);
        const state = inputs.plan.initialState();

        expect(
            inputs.plan.maxContractsFor(
                state,
                INSTRUMENTS[InstrumentSymbol.MNQ],
            ),
        ).toBe(100);
        expect(
            inputs.plan.maxContractsFor(
                state,
                INSTRUMENTS[InstrumentSymbol.NQ],
            ),
        ).toBe(10);
    });

    it('fails loud on --request-size 400 while parsing, naming the flag, since $400 is below the $500 Apex Live minimum and could never be paid', () => {
        expect(() =>
            parseSizedLive([
                ...HAND_COMPUTED_APEX_RUN,
                '--request-size',
                '400',
            ]),
        ).toThrow(
            '--request-size 400: Apex Live: a payout request of $400 is below the $500 minimum payout request, so it could never be paid',
        );
    });

    it('accepts --request-size 500, exactly the Apex Live minimum', () => {
        expect(
            parseLive([
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--request-size',
                '500',
            ]).payoutRequestSize,
        ).toBe(500);
    });

    it('accepts --request-size 400 on MFFU Rapid Live, above its $250 live minimum', () => {
        expect(
            parseLive(
                [
                    ...HAND_COMPUTED_APEX_RUN,
                    ...ONE_NQ_AT_100,
                    '--request-size',
                    '400',
                ],
                mffuBuilder(),
            ).payoutRequestSize,
        ).toBe(400);
    });

    it('fails loud on --request-size 200 on MFFU Rapid Live, below the firm-wide $250 minimum live withdrawal (N-41)', () => {
        expect(() =>
            parseSizedLive(
                [...HAND_COMPUTED_APEX_RUN, '--request-size', '200'],
                mffuBuilder(),
            ),
        ).toThrow(
            '--request-size 200: MyFundedFutures Rapid Live: a payout request of $200 is below the $250 minimum payout request, so it could never be paid',
        );
    });
});

describe('prop live end to end on the hand-computed Apex run in whole $150 NQ contracts (--stop-points 7.5)', () => {
    it('withdraws nothing by day 22, since the $50 and $350 excess over the $3,100 safety net are under the $500 minimum request', () => {
        const out = simulateLiveAccount(
            parseLive([
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '22',
            ]),
        );
        expect(out.cumulativeWithdrawalsP50).toBe(0);
        expect(out.liveBustProbability).toBe(0);
    });

    it('withdraws $650 on day 23, paying $585, with no idle flag', () => {
        const out = simulateLiveAccount(
            parseLive([
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '23',
            ]),
        );
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(585, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(23);
        expect(out.liveBustProbability).toBe(0);
    });

    it('withdraws the same $585 with a space-separated --idle-day-probability 0', () => {
        const out = simulateLiveAccount(
            parseLive([
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '23',
                '--idle-day-probability',
                '0',
            ]),
        );
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(585, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(23);
    });

    it('charges --commission 10 per round trip: $630 by day 25 instead of $1,125', () => {
        const out = simulateLiveAccount(
            parseLive([
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '25',
                '--commission',
                '10',
            ]),
        );
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(630, 8);
        expect(out.medianDaysToFirstWithdrawal).toBe(25);
        expect(out.liveBustProbability).toBe(0);
    });
});

describe('prop live end to end on the hand-computed MFFU Rapid Live run in whole $100 NQ contracts (--stop-points 5)', () => {
    it('keeps one $2,000 drawdown of cushion by default: 0% bust and $3,600 over 40 days, first withdrawal on day 22 under the $250 live minimum', () => {
        const out = simulateLiveAccount(
            parseLive(
                [
                    ...HAND_COMPUTED_APEX_RUN,
                    ...ONE_NQ_AT_100,
                    '--horizon-days',
                    '40',
                ],
                mffuBuilder(),
            ),
        );
        expect(out.liveBustProbability).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3600, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(22);
    });

    it("drains to the $0 floor with '--request-size all': $3,510 from day 3, the first day the excess reaches the $250 live minimum, with no bust", () => {
        const out = simulateLiveAccount(
            parseLive(
                [
                    ...HAND_COMPUTED_APEX_RUN,
                    ...ONE_NQ_AT_100,
                    '--horizon-days',
                    '40',
                    '--request-size',
                    'all',
                ],
                mffuBuilder(),
            ),
        );
        expect(out.liveBustProbability).toBe(0);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(3510, 6);
        expect(out.medianDaysToFirstWithdrawal).toBe(3);
    });
});

describe('describeAnnualWithdrawalRate (N-24)', () => {
    it('labels a 252-day horizon as the expected annual withdrawal rate', () => {
        expect(describeAnnualWithdrawalRate(252)).toBe(
            'expected annual withdrawal rate',
        );
    });

    it('says when the annual figure is scaled up from a shorter horizon', () => {
        expect(describeAnnualWithdrawalRate(25)).toBe(
            'annual rate (scaled from 25d)',
        );
    });
});

function rowsFor(argv: string[], builder: LivePlanBuilder) {
    const inputs = parseLive(argv, builder);
    const out = simulateLiveAccount(inputs);
    return { out, rows: new Map(liveSummaryRows(inputs, out)) };
}

describe('prop live summary rows (N-46)', () => {
    it('shows the LucidDaily transition credit on its own line and annualizes only the recurring withdrawals', () => {
        const argv = [
            ...HAND_COMPUTED_APEX_RUN,
            ...ONE_NQ_AT_100,
            '--horizon-days',
            '25',
            '--request-size',
            'all',
        ];
        const { out, rows } = rowsFor(argv, buildLucidDailyLivePlan);
        const recurring = out.cumulativeWithdrawalsP50 - 13_500;

        expect(rows.get('one-off transition credit (not annualized)')).toBe(
            '$13,500',
        );
        expect(rows.get('annual rate (scaled from 25d)')).toBe(
            formatCurrency((recurring / 25) * TRADING_DAYS_PER_YEAR),
        );
    });

    it('leaves the credit line out for a live plan without one', () => {
        const { rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '25',
            ],
            apexBuilder(),
        );

        expect(rows.has('one-off transition credit (not annualized)')).toBe(
            false,
        );
        expect(rows.get('annual rate (scaled from 25d)')).toBe(
            formatCurrency((1125 / 25) * TRADING_DAYS_PER_YEAR),
        );
    });

    it('defaults --horizon-days to one trading year', () => {
        expect(parseSizedLive([]).horizonDays).toBe(TRADING_DAYS_PER_YEAR);
    });
});

describe('prop live capital and liquidation rows (WP18f R-5, R-12)', () => {
    const topStepFiveDayProfit = 5 * 450;
    const topStepFiveDayDrain = (10_000 + topStepFiveDayProfit) / 2;

    it('shows seed withdrawn in drain mode on its own not-annualized line and annualizes only the trading profit: one $450 NQ contract a day wins $2,250 in 5 days and the day-5 drain of $6,125 holds $3,875 of seed', () => {
        const { rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...TOPSTEP_ONE_NQ_AT_450,
                '--horizon-days',
                '5',
                '--request-size',
                'all',
            ],
            topStepBuilder(),
        );

        expect(rows.get('expected capital returned (not annualized)')).toBe(
            formatCurrency(0.9 * (topStepFiveDayDrain - topStepFiveDayProfit)),
        );
        expect(rows.get('annual rate (scaled from 5d)')).toBe(
            formatCurrency(
                ((0.9 * topStepFiveDayProfit) / 5) * TRADING_DAYS_PER_YEAR,
            ),
        );
    });

    it('shows the final payout at an auto-liquidation on its own not-annualized line', () => {
        const { out, rows } = rowsFor(
            [
                '--trials',
                '1',
                '--winrate',
                '0',
                '--rr',
                '2',
                '--tpd',
                '1',
                '--commission',
                '10',
                '--horizon-days',
                '100',
                '--request-size',
                'all',
                ...TOPSTEP_ONE_NQ_AT_450,
            ],
            topStepBuilder(),
        );

        expect(out.expectedLiquidationPayout).toBeGreaterThan(0);
        expect(rows.get('expected liquidation payout (not annualized)')).toBe(
            formatCurrency(out.expectedLiquidationPayout),
        );
        expect(rows.get('annual rate (scaled from 100d)')).toBe('$0');
    });

    it('leaves both lines out for a live plan that only ever pays profit', () => {
        const { rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '25',
            ],
            apexBuilder(),
        );

        expect(rows.has('expected capital returned (not annualized)')).toBe(
            false,
        );
        expect(rows.has('expected liquidation payout (not annualized)')).toBe(
            false,
        );
    });
});

function percentileLabels(inclusion: string): [string, string, string] {
    return [
        `withdrawals at horizon${inclusion} (p5)`,
        `withdrawals at horizon${inclusion} (p50)`,
        `withdrawals at horizon${inclusion} (p95)`,
    ];
}

describe('prop live percentile rows name the one-off money they include (WP18f review)', () => {
    const liquidationRun = [
        '--trials',
        '1',
        '--winrate',
        '0',
        '--rr',
        '2',
        '--tpd',
        '1',
        '--commission',
        '10',
        '--horizon-days',
        '100',
        ...TOPSTEP_ONE_NQ_AT_450,
    ];

    it('keeps the plain label for a live plan that only ever pays profit', () => {
        const { out, rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '25',
            ],
            apexBuilder(),
        );

        const [p5, p50, p95] = percentileLabels('');
        expect(rows.get(p5)).toBe(formatCurrency(out.cumulativeWithdrawalsP5));
        expect(rows.get(p50)).toBe(
            formatCurrency(out.cumulativeWithdrawalsP50),
        );
        expect(rows.get(p95)).toBe(
            formatCurrency(out.cumulativeWithdrawalsP95),
        );
    });

    it('says the totals include the LucidDaily transition credit', () => {
        const { out, rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...ONE_NQ_AT_100,
                '--horizon-days',
                '25',
                '--request-size',
                'all',
            ],
            buildLucidDailyLivePlan,
        );

        const [, p50] = percentileLabels(', incl. transition credit');
        expect(rows.get(p50)).toBe(
            formatCurrency(out.cumulativeWithdrawalsP50),
        );
        expect(rows.has('withdrawals at horizon (p50)')).toBe(false);
    });

    it('says the totals include capital returned when TopStep drain mode takes the seed', () => {
        const { out, rows } = rowsFor(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...TOPSTEP_ONE_NQ_AT_450,
                '--horizon-days',
                '5',
                '--request-size',
                'all',
            ],
            topStepBuilder(),
        );

        expect(out.expectedCapitalReturned).toBeGreaterThan(0);
        expect(out.expectedLiquidationPayout).toBe(0);
        for (const label of percentileLabels(', incl. capital returned')) {
            expect(rows.has(label)).toBe(true);
        }
        expect(
            rows.get('withdrawals at horizon, incl. capital returned (p50)'),
        ).toBe(formatCurrency(out.cumulativeWithdrawalsP50));
        expect(rows.has('withdrawals at horizon (p50)')).toBe(false);
    });

    it('says the totals include the liquidation payout after a TopStep floor bust', () => {
        const { out, rows } = rowsFor(liquidationRun, topStepBuilder());

        expect(out.expectedCapitalReturned).toBe(0);
        expect(out.expectedLiquidationPayout).toBeGreaterThan(0);
        expect(
            rows.get('withdrawals at horizon, incl. liquidation payout (p50)'),
        ).toBe(formatCurrency(out.cumulativeWithdrawalsP50));
        expect(rows.has('withdrawals at horizon (p50)')).toBe(false);
    });

    it('lists every one-off kind a run pays in one label', () => {
        const inputs = parseLive(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...ONE_NQ_AT_100,
                '--horizon-days',
                '25',
                '--request-size',
                'all',
            ],
            buildLucidDailyLivePlan,
        );
        const out = simulateLiveAccount(inputs);
        const rows = new Map(
            liveSummaryRows(inputs, {
                ...out,
                expectedCapitalReturned: 100,
                expectedLiquidationPayout: 50,
            }),
        );

        expect(
            rows.get(
                'withdrawals at horizon, incl. transition credit, capital returned and liquidation payout (p95)',
            ),
        ).toBe(formatCurrency(out.cumulativeWithdrawalsP95));
    });

    it('names capital returned and the liquidation payout together', () => {
        const inputs = parseLive(
            [
                ...HAND_COMPUTED_APEX_RUN,
                ...APEX_ONE_NQ_AT_150,
                '--horizon-days',
                '25',
            ],
            apexBuilder(),
        );
        const out = simulateLiveAccount(inputs);
        const rows = new Map(
            liveSummaryRows(inputs, {
                ...out,
                expectedCapitalReturned: 100,
                expectedLiquidationPayout: 50,
            }),
        );

        expect(
            rows.get(
                'withdrawals at horizon, incl. capital returned and liquidation payout (p5)',
            ),
        ).toBe(formatCurrency(out.cumulativeWithdrawalsP5));
    });
});

describe('the root prop-calculator barrel re-exports the live transition builder surface (R-7)', () => {
    it('matches the firms barrel', () => {
        const lucidBuilder: LiveTransitionPlanBuilder | undefined =
            findLiveTransitionPlanBuilder(FirmId.Lucid);

        expect(lucidBuilder).toBe(
            firms.findLiveTransitionPlanBuilder(FirmId.Lucid),
        );
        expect(LIVE_TRANSITION_PLAN_BUILDERS).toBe(
            firms.LIVE_TRANSITION_PLAN_BUILDERS,
        );
        expect(LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP).toBe(15_000);
    });
});

describe('prop live --transition-profit maps the Lucid Daily live variant (N-54)', () => {
    const argv = [
        ...HAND_COMPUTED_APEX_RUN,
        ...ONE_NQ_AT_100,
        '--horizon-days',
        '25',
    ];

    it('builds the Lucid live plan with the Daily transition credit: $14,000 of sim profit above the buffer pays $12,600 once', () => {
        const { rows } = rowsFor(
            argv,
            resolveLivePlanBuilder(FirmId.Lucid, '14000'),
        );

        expect(rows.get('one-off transition credit (not annualized)')).toBe(
            '$12,600',
        );
    });

    it('caps the Daily transition credit at $15,000 of sim profit, paying $13,500', () => {
        const { rows } = rowsFor(
            argv,
            resolveLivePlanBuilder(FirmId.Lucid, '40000'),
        );

        expect(rows.get('one-off transition credit (not annualized)')).toBe(
            '$13,500',
        );
    });

    it('keeps the standard Lucid live plan, with no credit line, when --transition-profit is omitted', () => {
        const { rows } = rowsFor(
            argv,
            resolveLivePlanBuilder(FirmId.Lucid, undefined),
        );

        expect(rows.has('one-off transition credit (not annualized)')).toBe(
            false,
        );
    });

    it('fails loud on --transition-profit for a firm with no modeled live transition credit, naming the flag', () => {
        expect(() => resolveLivePlanBuilder(FirmId.Apex, '1000')).toThrow(
            '--transition-profit applies only to a firm with a modeled one-off live transition credit (lucid), not --firm apex',
        );
    });

    it.each(['-1', 'abc', ''])('rejects --transition-profit %j', (raw) => {
        expect(() => resolveLivePlanBuilder(FirmId.Lucid, raw)).toThrow(
            /--transition-profit must be a number >= 0/,
        );
    });

    it('fails loud for a firm with no modeled live account', () => {
        expect(() =>
            resolveLivePlanBuilder(FirmId.E8Futures, undefined),
        ).toThrow(/--firm e8futures is not yet modeled for prop live/);
    });

    it('declares --transition-profit with help text naming Lucid Daily and its $15,000 cap, without em dashes', () => {
        const description = liveArguments['transition-profit'].description;

        expect(description).toContain('Lucid Daily');
        expect(description).toContain('$15,000');
        expect(description).not.toContain('\u{2014}');
    });
});

function planMessageFor(plan: LivePlan, requestSize: number): string {
    try {
        plan.resolvePayoutRequestSize(requestSize);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error(`${plan.label} accepted a $${requestSize} request`);
}

describe('prop live --request-size minimum has one source of truth, the plan (WP18g)', () => {
    it('fails with the plan own minimum-request message, prefixed with the flag', () => {
        const plan = buildApexLivePlan(TOPSTEP_CUSHION);

        expect(() =>
            parseSizedLive([
                ...HAND_COMPUTED_APEX_RUN,
                '--request-size',
                '400',
            ]),
        ).toThrow(`--request-size 400: ${planMessageFor(plan, 400)}`);
    });

    it('fails the same way on the TopStep LFA $125 minimum', () => {
        const plan = topStepBuilder()(TOPSTEP_CUSHION);

        expect(() =>
            parseSizedLive(
                [...HAND_COMPUTED_APEX_RUN, '--request-size', '100'],
                topStepBuilder(),
            ),
        ).toThrow(`--request-size 100: ${planMessageFor(plan, 100)}`);
    });

    it('accepts --request-size 125 on the TopStep LFA, exactly its minimum', () => {
        expect(
            parseLive(
                [
                    ...HAND_COMPUTED_APEX_RUN,
                    ...TOPSTEP_ONE_NQ_AT_450,
                    '--request-size',
                    '125',
                ],
                topStepBuilder(),
            ).payoutRequestSize,
        ).toBe(125);
    });
});

function livePlanPaying(traderShares: readonly number[]): LivePlan {
    return new LivePlan({
        cushionPercent: TOPSTEP_CUSHION,
        label: 'Split probe',
        liveDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: null,
        payoutTiers: traderShares.map((share, index) => ({
            thresholdProfit: dollars(index * 10_000),
            traderShare: fraction(share),
        })),
    });
}

describe('prop live --transition-profit help text takes the split from the plan (WP18g)', () => {
    it('names the trader share of the plan it describes, not a literal', () => {
        expect(
            describeLucidDailyTransitionProfit(livePlanPaying([0.8])),
        ).toContain('at the 80% split');
    });

    it('names every step of a tiered split in order', () => {
        expect(
            describeLucidDailyTransitionProfit(livePlanPaying([0.8, 0.9])),
        ).toContain('at the 80% then 90% split');
    });

    it('keeps a split that steps back down: 80% then 90% then 80% is not collapsed to 80% then 90%', () => {
        expect(
            describeLucidDailyTransitionProfit(livePlanPaying([0.8, 0.9, 0.8])),
        ).toContain('at the 80% then 90% then 80% split');
    });

    it('still merges neighbouring tiers that pay the same share', () => {
        expect(
            describeLucidDailyTransitionProfit(livePlanPaying([0.9, 0.9, 0.8])),
        ).toContain('at the 90% then 80% split');
    });

    it('declares the help text from the Lucid Daily live plan payout tiers', () => {
        const builder = findLiveTransitionPlanBuilder(FirmId.Lucid);
        if (!builder) throw new Error('Lucid has no live transition builder');
        const plan = builder(TOPSTEP_CUSHION, dollars(0));

        expect(liveArguments['transition-profit'].description).toBe(
            describeLucidDailyTransitionProfit(plan),
        );
        expect(liveArguments['transition-profit'].description).toContain(
            'at the 90% split',
        );
    });
});

describe('prop live --transition-profit help is built when the arguments are resolved, not when the module loads (WP18h)', () => {
    afterEach(() => {
        vi.doUnmock('~/lib/prop-calculator');
        vi.resetModules();
    });

    it('loads the live command with no Lucid transition plan builder and fails loud when the command arguments are resolved, for any firm', async () => {
        vi.resetModules();
        vi.doMock('~/lib/prop-calculator', async (importOriginal) => ({
            ...(await importOriginal<object>()),
            findLiveTransitionPlanBuilder: vi.fn(),
        }));

        const { liveArguments: lazyArguments } =
            await import('~/cli/commands/prop/live/command');

        expect(() => lazyArguments['transition-profit'].description).toThrow(
            '--transition-profit help: Lucid has no live transition plan builder',
        );
        expect(() =>
            parseArgs(['--firm', FirmId.TopStep], lazyArguments),
        ).toThrow(
            '--transition-profit help: Lucid has no live transition plan builder',
        );
    });
});

describe('prop live --help names only flags prop live accepts (WP43d)', () => {
    it('names no flag prop live lacks, such as --unaffordable, --percent or --funded-ladder', async () => {
        expect(await flagsNamedButNotAccepted(liveCommand)).toStrictEqual([]);
    });
});

const LIVE_STOP_POINTS_REFUSAL =
    'prop live needs --stop-points: live risk is a percent of the drawdown cushion placed in whole contracts at that stop (with --instrument, default NQ), at least one contract and at most the live contract limit. Add --stop-points.';

async function capturedLiveRun(argv: string[]): Promise<{
    exitCode: typeof process.exitCode;
    stderr: string;
    stdout: string;
}> {
    const written: string[] = [];
    const writtenError: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            writtenError.push(String(chunk));
            return true;
        });
    const exitCode = process.exitCode;
    let runExitCode: typeof process.exitCode;
    process.exitCode = undefined;
    try {
        await liveCommand.run?.({
            args: parseArgs<typeof liveArguments>(argv, liveArguments),
            cmd: liveCommand,
            rawArgs: argv,
        });
    } finally {
        runExitCode = process.exitCode;
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return {
        exitCode: runExitCode,
        stderr: writtenError.join(''),
        stdout: written.join(''),
    };
}

describe('prop live needs --stop-points: live percent-of-cushion risk is placed in whole contracts (N-76, T33)', () => {
    it('refuses to parse without --stop-points, naming --stop-points and --instrument', () => {
        expect(() => parseLive([])).toThrow(LIVE_STOP_POINTS_REFUSAL);
    });

    it('refuses even when --instrument is given without --stop-points', () => {
        expect(() => parseLive(['--instrument', InstrumentSymbol.MNQ])).toThrow(
            LIVE_STOP_POINTS_REFUSAL,
        );
    });

    it('checks --stop-points before building the live plan, so the plan builder never runs without it (WP44b)', () => {
        const builder = vi.fn(apexBuilder());

        expect(() => parseLive([], builder)).toThrow(LIVE_STOP_POINTS_REFUSAL);
        expect(builder).not.toHaveBeenCalled();
    });

    it('names the missing --stop-points before a --request-size below the plan minimum (WP44b)', () => {
        expect(() => parseLive(['--request-size', '400'])).toThrow(
            LIVE_STOP_POINTS_REFUSAL,
        );
    });

    it('names the missing --stop-points before an out-of-range cushion percent (WP44b)', () => {
        expect(() => parseLive(['--cushion-percent-post-lock', '150'])).toThrow(
            LIVE_STOP_POINTS_REFUSAL,
        );
    });

    it('rejects a non-positive --stop-points before reading the cushion percents (WP44b)', () => {
        expect(() =>
            parseLive([
                '--stop-points',
                '-2',
                '--cushion-percent-post-lock',
                '150',
            ]),
        ).toThrow(/--stop-points must be a number > 0/);
    });

    it('exits 1 without --stop-points, prints why and never starts the simulation', async () => {
        const run = await capturedLiveRun(['--trials', '1']);

        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(LIVE_STOP_POINTS_REFUSAL);
        expect(run.stdout).not.toContain('bust probability');
    });

    it('runs with --stop-points and --instrument, and Apex Live at 5% / 10% of the cushion busts in some trials at a 10 point MNQ stop, where fractional sizing printed 0.0%', () => {
        const out = simulateLiveAccount(
            parseLive([
                '--trials',
                '300',
                '--stop-points',
                '10',
                '--instrument',
                InstrumentSymbol.MNQ,
            ]),
        );

        expect(out.liveBustProbability).toBeGreaterThan(0);
    });

    it('says in --help that live sizing is a percent of the cushion placed in whole contracts and needs --stop-points', async () => {
        const usage = await renderUsage(liveCommand);

        expect(usage).toContain('whole contracts');
        expect(usage).toContain('needs --stop-points');
        expect(usage).not.toContain('\u{2014}');
    });

    it('describes --stop-points as required for prop live, never as optional or uncapped', async () => {
        const description = liveArguments['stop-points'].description;
        const usage = await renderUsage(liveCommand);

        expect(description).toContain('Required');
        expect(description).toContain('whole contracts');
        expect(description).toContain('--instrument');
        expect(description).not.toContain('\u{2014}');
        expect(usage).not.toContain('Omit to leave risk uncapped');
    });
});

const LUCID_DAILY_CREDIT_NOTE =
    LIVE_TRANSFER_NOTE_TEXT[
        LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash
    ];

describe('prop live states the Lucid Daily credit caveats where it shows the credit (N-92)', () => {
    const LUCID_RUN = [
        '--firm',
        'lucid',
        ...HAND_COMPUTED_APEX_RUN,
        ...ONE_NQ_AT_100,
        '--horizon-days',
        '25',
    ];

    it('prints the shared engine note beside the credit when --transition-profit is given', async () => {
        const { stdout } = await capturedLiveRun([
            ...LUCID_RUN,
            '--transition-profit',
            '14000',
        ]);

        expect(stdout).toContain('one-off transition credit (not annualized)');
        expect(stdout).toContain(LUCID_DAILY_CREDIT_NOTE);
    });

    it('prints no credit note without --transition-profit', async () => {
        const { stdout } = await capturedLiveRun(LUCID_RUN);

        expect(stdout).not.toContain('one-off transition credit');
        expect(stdout).not.toContain(LUCID_DAILY_CREDIT_NOTE);
    });

    it('says in the --transition-profit help that the split is the tool own reading and the credit may wait on KYC, through the same shared text', () => {
        const description = liveArguments['transition-profit'].description;

        expect(description).toContain(LUCID_DAILY_CREDIT_NOTE);
        expect(description).toContain('at the 90% split');
        expect(description).not.toContain('\u{2014}');
    });
});
