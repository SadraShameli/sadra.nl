import type { ArgsDef } from 'citty';

import { parseArgs, renderUsage } from 'citty';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import propGroup from '~/cli/commands/prop/group';
import ladder, {
    buildLadderSearchOptions,
    describeEvalWindow,
    describeInstantFundedPlan,
    describeLadderSizing,
    describeUnscorableLadders,
    LADDER_RANKINGS,
    LADDER_TABLE_LABELS,
    ladderArguments,
    ladderRankingsFor,
    ladderTableRow,
    ladderWorkWarning,
    readLadderGrid,
} from '~/cli/commands/prop/ladder/command';
import {
    ObjectiveFlag,
    ObjectiveNotApplicable,
    planArguments,
    planResolver,
    singlePathGranularityArgument,
    tradingArguments,
    type TradingArguments,
} from '~/cli/commands/prop/shared';
import {
    unpricedTriggerLine,
    UnpricedTriggerSurface,
} from '~/cli/commands/prop/unpricedTrigger';
import { findUnknownFlag } from '~/cli/unknownFlagGuard';
import { formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    ApexVariant,
    CumulativeAmountTrigger,
    defaultLadderGridMax,
    dollars,
    DrawdownKind,
    findFirm,
    FirmId,
    INSTRUMENTS,
    LADDER_EVAL_PASS_FLOOR,
    LADDER_IGNORED_INPUT_REASONS,
    LadderIgnoredInput,
    type LadderScore,
    type LadderSearchResult,
    ladderTrialStreams,
    MffuVariant,
    type Plan,
    points,
    PolicySourceKind,
    PolicyVerification,
    scoreLadder,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

import { flagsNamedButNotAccepted } from './helpFlags';

function apexEodPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function parseGrid(argv: string[]) {
    return parseArgs<typeof ladderArguments>(argv, ladderArguments);
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('readLadderGrid maps the grid flags onto the engine grid config', () => {
    it('defaults to a 100-800 step 100 x4 grid for Apex EOD 50K, max at 40% of the drawdown', () => {
        const plan = apexEodPlan();
        expect(Math.round(plan.drawdown.amount * 0.4)).toBe(800);
        expect(
            readLadderGrid(parseGrid([]), plan.drawdown.amount),
        ).toStrictEqual({
            grid: { lo: 100, max: 800, slots: 4, step: 100 },
            gridSize: 4680,
            maxGridSize: 1_000_000,
            topN: 10,
        });
    });

    it('takes the default --max from the shared engine default', () => {
        expect(readLadderGrid(parseGrid([]), 1250).grid.max).toBe(
            defaultLadderGridMax(1250),
        );
        expect(readLadderGrid(parseGrid([]), 3333).grid.max).toBe(
            defaultLadderGridMax(3333),
        );
    });

    it('maps explicit flags without swapping fields', () => {
        const expected = {
            grid: { lo: 150, max: 900, slots: 3, step: 50 },
            gridSize: 16 + 16 ** 2 + 16 ** 3,
            maxGridSize: 1_000_000,
            topN: 7,
        };
        expect(
            readLadderGrid(
                {
                    lo: '150',
                    max: '900',
                    'max-grid': '1000000',
                    rungs: '3',
                    step: '50',
                    top: '7',
                },
                2000,
            ),
        ).toStrictEqual(expected);
        expect(
            readLadderGrid(
                parseGrid([
                    '--lo',
                    '150',
                    '--max',
                    '900',
                    '--step',
                    '50',
                    '--rungs',
                    '3',
                    '--top',
                    '7',
                ]),
                2000,
            ),
        ).toStrictEqual(expected);
    });

    it.each([
        [['--step', '0'], /--step must be a number > 0, got "0"/],
        [['--step=-50'], /--step must be a number > 0, got "-50"/],
        [['--step='], /--step must be a number > 0, got ""/],
        [['--rungs', '0'], /--rungs must be a whole number >= 1, got "0"/],
        [['--rungs', '2.5'], /--rungs must be a whole number >= 1, got "2.5"/],
        [
            ['--lo', '800', '--max', '800', '--rungs', '100000'],
            /--rungs must be <= 20, got "100000"/,
        ],
        [
            ['--lo', '800', '--max', '800', '--rungs', '9007199254740991'],
            /--rungs must be <= 20, got "9007199254740991"/,
        ],
        [['--top', '0'], /--top must be a whole number >= 1, got "0"/],
        [['--lo', '0'], /--lo must be a number > 0, got "0"/],
        [['--max', '50', '--lo', '100'], /--max must be >= --lo, got "50"/],
        [['--max-grid', '0'], /--max-grid must be a whole number >= 1/],
    ])('rejects %o naming the flag', (argv, message) => {
        expect(() => readLadderGrid(parseGrid(argv), 2000)).toThrow(message);
    });

    it('rejects a grid above the size limit before any search starts', () => {
        expect(() =>
            readLadderGrid(parseGrid(['--lo', '10', '--step', '10']), 2000),
        ).toThrow(
            'ladder grid has 41,478,480 ladders, above the 1,000,000 limit: raise --step, lower --rungs, narrow --lo/--max or raise --max-grid',
        );
    });

    it('lets --max-grid raise the size limit', () => {
        const selection = readLadderGrid(
            parseGrid(['--step', '50', '--rungs', '5', '--max-grid', '900000']),
            2000,
        );
        expect(selection.gridSize).toBe(813_615);
        expect(selection.maxGridSize).toBe(900_000);
        expect(() =>
            readLadderGrid(
                parseGrid([
                    '--step',
                    '50',
                    '--rungs',
                    '5',
                    '--max-grid',
                    '800000',
                ]),
                2000,
            ),
        ).toThrow(/above the 800,000 limit/);
    });
});

describe('LADDER_RANKINGS pairs each table title with its result array', () => {
    it('lists the three rankings in display order', () => {
        expect(LADDER_RANKINGS.map((ranking) => ranking.title)).toStrictEqual([
            'FASTEST TO FUNDED',
            'CHEAPEST PER FUNDED ACCOUNT',
            'HIGHEST EVAL PASS RATE',
        ]);
    });

    it('selects bySpeed, byCost and byPassRate respectively', () => {
        const bySpeed: LadderScore[] = [];
        const byCost: LadderScore[] = [];
        const byPassRate: LadderScore[] = [];
        const result: LadderSearchResult = {
            byCost,
            byPassRate,
            bySpeed,
            droppedAliasCount: 0,
            frontier: [],
            gridSize: 0,
            laddersScored: 0,
            topN: 10,
            unscorableCount: 0,
        };
        const [speed, cost, pass] = LADDER_RANKINGS;
        expect(speed?.select(result)).toBe(bySpeed);
        expect(cost?.select(result)).toBe(byCost);
        expect(pass?.select(result)).toBe(byPassRate);
    });
});

describe('ladderWorkWarning flags searches that will take a long time', () => {
    it('stays quiet for the default grid', () => {
        expect(ladderWorkWarning(4680, 4000)).toBeNull();
    });

    it('warns with the grid size and trial count for a huge search', () => {
        const warning = ladderWorkWarning(813_615, 4000);
        expect(warning).toContain('813,615');
        expect(warning).toContain('4,000');
    });
});

describe('describeEvalWindow shows the effective eval-day window', () => {
    it('marks the Apex 21 day cap', () => {
        expect(describeEvalWindow(apexEodPlan(), 150)).toBe(
            'eval days 21 (plan cap)',
        );
    });

    it('shows the requested window when it is inside the cap', () => {
        expect(describeEvalWindow(apexEodPlan(), 15)).toBe('eval days 15');
    });

    it('shows the requested window for a plan without a cap', () => {
        expect(describeEvalWindow(rapidEodPlan(), 150)).toBe('eval days 150');
    });
});

function ladderScore(): LadderScore {
    return {
        costPerFunded: 250,
        costPerFundedStandardError: 3.4,
        expectedDaysToFunded: 8.2,
        expectedDaysToFundedStandardError: 0.12,
        ladder: [400, 600],
        meanDaysOnFail: 4,
        meanDaysOnPass: 6,
        passRate: 0.47,
        passRateStandardError: 0.0035,
    };
}

describe('buildLadderSearchOptions maps the CLI flags onto the search', () => {
    it('maps eval days, trials, seed and the grid without swapping fields', () => {
        const options = buildLadderSearchOptions(
            apexEodPlan(),
            parseGrid([
                '--eval-days',
                '30',
                '--trials',
                '1234',
                '--seed',
                '9',
                '--top',
                '3',
            ]),
        );
        expect(options.score.maxDays).toBe(30);
        expect(options.score.sims).toBe(1234);
        expect(options.seed).toBe(9);
        expect(options.topN).toBe(3);
        expect(options.grid).toStrictEqual({
            lo: 100,
            max: 800,
            slots: 4,
            step: 100,
        });
        expect(options.maxGridSize).toBe(1_000_000);
    });

    it('builds contract-limit sizing from --stop-points and --instrument', () => {
        const options = buildLadderSearchOptions(
            apexEodPlan(),
            parseGrid(['--stop-points', '1', '--instrument', 'MNQ']),
        );
        expect(options.score.positionSizing).toStrictEqual({
            instrument: INSTRUMENTS.MNQ,
            stopPoints: 1,
        });
    });

    it('leaves risk uncapped without --stop-points', () => {
        expect(
            buildLadderSearchOptions(apexEodPlan(), parseGrid([])).score
                .positionSizing,
        ).toBeNull();
    });

    it('passes the coupon discounts to the cost formula', () => {
        const options = buildLadderSearchOptions(
            apexEodPlan(),
            parseGrid(['--eval-discount', '50', '--activation-discount', '10']),
        );
        expect(options.score.discounts).toStrictEqual({
            activationPercent: 10,
            evalPercent: 50,
            monthlySubscriptionPercent: 0,
        });
        expect(options.score).not.toHaveProperty('evalPrice');
    });

    it('passes no discounts when no discount flag is set', () => {
        expect(
            buildLadderSearchOptions(apexEodPlan(), parseGrid([])).score
                .discounts,
        ).toBeUndefined();
    });

    it('rejects --path-granularity, which the ladder search cannot model', () => {
        expect(() =>
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--path-granularity', '10']),
            ),
        ).toThrow(/--path-granularity is not supported by prop ladder/);
    });

    it('does not advertise --path-granularity', () => {
        expect(ladderArguments).not.toHaveProperty('path-granularity');
    });

    it('passes --commission to the ladder score', () => {
        expect(
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--commission', '4']),
            ).score.commission,
        ).toBe(4);
        expect(
            buildLadderSearchOptions(apexEodPlan(), parseGrid([])).score
                .commission,
        ).toBe(0);
    });

    it.each([
        ['--funded-days', '100'],
        ['--funded-risk', '300'],
        ['--funded-rr', '3'],
        ['--funded-tpd', '2'],
        ['--idle-day-probability', '0.2'],
        ['--ladder', '400,400'],
        ['--max-attempts', '3'],
        ['--max-lifetime-payouts', '2'],
        ['--rebuy-lag-days', '2'],
        ['--request-size', '1000'],
        ['--retain-cushion', '500'],
        ['--risk', '300'],
        ['--tpd', '2'],
    ])('rejects %s %s, which the ladder search would ignore', (flag, value) => {
        expect(() =>
            buildLadderSearchOptions(apexEodPlan(), parseGrid([flag, value])),
        ).toThrow(new RegExp(`^${flag} is not supported by prop ladder: `));
    });

    it.each([
        ['--idle-day-probability', LadderIgnoredInput.IdleDays],
        ['--max-attempts', LadderIgnoredInput.MaxAttempts],
        ['--rebuy-lag-days', LadderIgnoredInput.RebuyLag],
        ['--path-granularity', LadderIgnoredInput.PathGranularity],
        ['--funded-risk', LadderIgnoredInput.FundedPhase],
        ['--risk', LadderIgnoredInput.OwnLadder],
    ])('explains %s with the shared %s reason', (flag, input) => {
        expect(() =>
            buildLadderSearchOptions(apexEodPlan(), parseGrid([flag, '2'])),
        ).toThrow(
            `${flag} is not supported by prop ladder: the ladder search ${LADDER_IGNORED_INPUT_REASONS[input]}, so drop the flag or use prop sim`,
        );
    });

    it.each([
        ['--risk', '250'],
        ['--tpd', '4'],
        ['--max-attempts', '1'],
        ['--idle-day-probability', '0'],
        ['--rebuy-lag-days', '0'],
    ])(
        'rejects %s even at the value sim defaults it to, since ladder no longer declares it',
        (flag, value) => {
            expect(() =>
                buildLadderSearchOptions(
                    apexEodPlan(),
                    parseGrid([flag, value]),
                ),
            ).toThrow(new RegExp(`^${flag} is not supported by prop ladder: `));
        },
    );
});

const TRADING_FLAGS = Object.keys({
    ...planArguments,
    ...tradingArguments,
    ...singlePathGranularityArgument,
});
const LADDER_FLAGS = new Set(Object.keys(ladderArguments));
const DROPPED_FLAGS = TRADING_FLAGS.filter((flag) => !LADDER_FLAGS.has(flag));
const KEPT_FLAGS = TRADING_FLAGS.filter((flag) => LADDER_FLAGS.has(flag));

function isAdvertised(usage: string, flag: string): boolean {
    return new RegExp(String.raw`(?<![\w-])--${flag}(?![\w-])`).test(usage);
}

describe('prop ladder --help agrees with the parser (WP15 handoff)', () => {
    it('drops exactly the trading flags the ladder search cannot model', () => {
        expect(
            DROPPED_FLAGS.toSorted((a, b) => a.localeCompare(b)),
        ).toStrictEqual([
            'early-withdrawal',
            'funded-days',
            'funded-reset',
            'funded-risk',
            'funded-rr',
            'funded-tpd',
            'idle-day-probability',
            'ladder',
            'max-attempts',
            'max-lifetime-payouts',
            'path-granularity',
            'rebuy-lag-days',
            'request-size',
            'retain-cushion',
            'risk',
            'tpd',
        ]);
    });

    it('types every declared trading flag, so the unsupported-flag table must name each one it drops (WP22b)', () => {
        expectTypeOf<
            Exclude<keyof typeof tradingArguments, keyof TradingArguments>
        >().toEqualTypeOf<never>();
    });

    it('rejects --early-withdrawal as a funded-phase input the ladder search never runs (WP22b)', () => {
        expect(() =>
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--early-withdrawal']),
            ),
        ).toThrow(
            `--early-withdrawal is not supported by prop ladder: the ladder search ${LADDER_IGNORED_INPUT_REASONS[LadderIgnoredInput.FundedPhase]}, so drop the flag or use prop sim`,
        );
    });

    it('rejects --funded-reset as a funded-phase input the ladder search never runs (WP18k)', () => {
        expect(() =>
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--funded-reset']),
            ),
        ).toThrow(
            `--funded-reset is not supported by prop ladder: the ladder search ${LADDER_IGNORED_INPUT_REASONS[LadderIgnoredInput.FundedPhase]}, so drop the flag or use prop sim`,
        );
    });

    it('reuses the shared definition object for every trading flag it keeps', () => {
        const shared: Record<string, unknown> = {
            ...planArguments,
            ...tradingArguments,
        };
        const own: Record<string, unknown> = ladderArguments;
        for (const flag of KEPT_FLAGS) {
            expect(own[flag], flag).toBe(shared[flag]);
        }
    });

    it('advertises every flag it declares', async () => {
        const usage = await renderUsage(ladder);
        for (const flag of LADDER_FLAGS) {
            expect(isAdvertised(usage, flag), flag).toBe(true);
        }
    });

    it.each(DROPPED_FLAGS)('rejects the undeclared --%s', (flag) => {
        expect(() =>
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid([`--${flag}`, '1']),
            ),
        ).toThrow(new RegExp(`^--${flag} is not supported by prop ladder: `));
    });

    it('accepts every trading flag it declares at its default', () => {
        const defaults: string[] = [];
        const own: ArgsDef = ladderArguments;
        for (const flag of KEPT_FLAGS) {
            const fallback = own[flag]?.default;
            if (fallback !== undefined) {
                defaults.push(`--${flag}`, String(fallback));
            }
        }
        expect(() =>
            buildLadderSearchOptions(apexEodPlan(), parseGrid(defaults)),
        ).not.toThrow();
    });
});

describe('prop ladder --help lists only what works (WP46c, N-78 follow-up)', () => {
    it('never advertises a flag it rejects as a working option', async () => {
        const usage = await renderUsage(ladder);
        for (const flag of DROPPED_FLAGS) {
            expect(isAdvertised(usage, flag), flag).toBe(false);
        }
    });

    it.each(DROPPED_FLAGS)(
        'does not declare --%s as a CLI argument, so --help never lists it',
        (flag) => {
            expect(Object.keys(ladderArguments)).not.toContain(flag);
        },
    );

    it('does not let an unsupported flag pick up a default value nobody passed', () => {
        const parsed = parseArgs<typeof ladderArguments>([], ladderArguments);
        expect(() =>
            buildLadderSearchOptions(apexEodPlan(), parsed),
        ).not.toThrow();
    });

    it('lets the shared unknown-flag guard still treat --retain-cushion as known, through the command meta instead of a declared arg', async () => {
        const issue = await findUnknownFlag(
            ['ladder', '--retain-cushion', '2000'],
            propGroup,
            'cli prop',
        );
        expect(issue).toBeNull();
    });

    it('explains --live-transfer-hazard as a funded-phase input the ladder search never runs, not as an unknown flag (PT-73)', async () => {
        const issue = await findUnknownFlag(
            ['ladder', '--live-transfer-hazard', '0.3'],
            propGroup,
            'cli prop',
        );
        expect(issue).toBeNull();
        expect(() =>
            buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--live-transfer-hazard', '0.3']),
            ),
        ).toThrow(
            `--live-transfer-hazard is not supported by prop ladder: the ladder search ${LADDER_IGNORED_INPUT_REASONS[LadderIgnoredInput.FundedPhase]}, so drop the flag or use prop sim`,
        );
    });

    it('still lets the shared unknown-flag guard reject a truly unknown flag on prop ladder', async () => {
        const issue = await findUnknownFlag(
            ['ladder', '--totally-bogus-flag'],
            propGroup,
            'cli prop',
        );
        expect(issue?.commandPath).toBe('cli prop ladder');
        expect(issue?.flag).toBe('--totally-bogus-flag');
    });
});

describe('describeUnscorableLadders explains empty ladder tables (WP15 handoff)', () => {
    it.each([
        ['0.2275', false],
        ['0.23', true],
    ])(
        'matches the floor the engine drops ladders by (winrate %s scorable: %s)',
        (winrate, isScorable) => {
            const options = buildLadderSearchOptions(
                apexEodPlan(),
                parseGrid(['--winrate', winrate, '--trials', '2000']),
            );
            const score = scoreLadder(
                [300, 300],
                options.score,
                ladderTrialStreams(options.seed),
            );
            expect(
                Math.abs(score.passRate - LADDER_EVAL_PASS_FLOOR),
            ).toBeLessThan(0.0015);
            expect(score.passRate >= LADDER_EVAL_PASS_FLOOR).toBe(isScorable);
            expect(Number.isFinite(score.costPerFunded)).toBe(isScorable);
        },
    );

    it('prints the floor it shares with the engine', () => {
        const floor = formatPercent(LADDER_EVAL_PASS_FLOOR, 0);
        for (const count of [5, 12]) {
            expect(
                describeUnscorableLadders({
                    laddersScored: 12,
                    unscorableCount: count,
                }),
            ).toContain(`under ${floor} of trials`);
        }
    });

    it('explains why nothing is ranked when no ladder cleared the floor', () => {
        expect(
            describeUnscorableLadders({
                laddersScored: 12,
                unscorableCount: 12,
            }),
        ).toBe(
            'all 12 ladders passed the eval in under 2% of trials, below the eval pass floor the search needs to rank a ladder, so there is nothing to rank: check --winrate, --rr, --stop-points and the grid bounds',
        );
    });

    it('counts the ladders left out when only some fell below the floor', () => {
        expect(
            describeUnscorableLadders({
                laddersScored: 12,
                unscorableCount: 5,
            }),
        ).toBe(
            '5 of 12 ladders passed the eval in under 2% of trials and are left out of every ranking',
        );
    });

    it('says nothing when every ladder was scored', () => {
        expect(
            describeUnscorableLadders({
                laddersScored: 12,
                unscorableCount: 0,
            }),
        ).toBeNull();
    });

    it('never contains an em dash', () => {
        for (const count of [5, 12]) {
            expect(
                describeUnscorableLadders({
                    laddersScored: 12,
                    unscorableCount: count,
                }),
            ).not.toContain('\u{2014}');
        }
    });
});

function instantFundedPlan(): Plan {
    const plan = planResolver.resolveOne({
        firm: FirmId.TopStep,
        variant: TopStepVariant.ProAccount,
    });
    expect(plan.isInstantFunded).toBe(true);
    return plan;
}

describe('describeInstantFundedPlan (WP15 handoff)', () => {
    it('always returns a warning and a hint', () => {
        expectTypeOf(describeInstantFundedPlan).returns.toEqualTypeOf<
            readonly [warning: string, hint: string]
        >();
    });

    it('names the plan and points to prop sim without an em dash', () => {
        const plan = instantFundedPlan();
        const lines = describeInstantFundedPlan(plan);
        expect(lines).toStrictEqual([
            `${plan.label} has no real evaluation phase: it funds instantly (profit target $0), so there is no eval to grid-search a ladder against.`,
            '  Use `cli prop sim` instead: it applies flat funded sizing from day one for this plan.',
        ]);
        for (const line of lines) {
            expect(line.replace(plan.label, '')).not.toContain('\u{2014}');
        }
    });
});

describe('describeLadderSizing shows the eval contract cap', () => {
    it('names the instrument, stop and cap', () => {
        expect(
            describeLadderSizing(apexEodPlan(), {
                instrument: INSTRUMENTS.MNQ,
                stopPoints: points(1),
            }),
        ).toBe('sizing MNQ @ 1pt, eval cap 60 contracts ($120 max risk)');
    });

    it('says risk is uncapped without sizing', () => {
        expect(describeLadderSizing(apexEodPlan(), null)).toBe(
            'sizing uncapped (set --stop-points to apply contract limits)',
        );
    });

    it('the plan drawdown kind is available for the header', () => {
        expect(apexEodPlan().drawdown.kind).toBe(DrawdownKind.EodTrailing);
    });
});

describe('ladderTableRow shows each estimate with its standard error', () => {
    it('labels the columns with eval pass and the +/- columns', () => {
        expect(LADDER_TABLE_LABELS).toStrictEqual([
            'ladder',
            'eval pass',
            '+/- pass',
            'days',
            '+/- days',
            '$/acct',
            '+/- $',
            'min stop',
        ]);
    });

    it('fills the cells in column order', () => {
        expect(ladderTableRow(ladderScore(), 6, 20)).toStrictEqual([
            '400 / 600',
            '47.0%',
            '0.35%',
            '8.2',
            '0.12',
            '$250',
            '$3.40',
            '5.0pt',
        ]);
    });

    it('shows no minimum stop without a contract limit', () => {
        expect(ladderTableRow(ladderScore(), null, 20).at(-1)).toBe(
            NOT_APPLICABLE,
        );
    });
});

describe('prop ladder --help names only flags prop ladder accepts (WP43d)', () => {
    it('names no flag prop ladder lacks, such as --percent or --funded-ladder', async () => {
        expect(await flagsNamedButNotAccepted(ladder)).toStrictEqual([]);
    });
});

const smallRun = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--rungs',
    '2',
    '--lo',
    '200',
    '--max',
    '600',
    '--step',
    '200',
    '--trials',
    '200',
    '--top',
    '2',
];

async function capturedLadder(argv: string[]) {
    const written: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const previous = process.exitCode;
    process.exitCode = undefined;
    let exitCode: typeof process.exitCode;
    try {
        await ladder.run?.({
            args: parseArgs<typeof ladderArguments>(argv, ladderArguments),
            cmd: ladder,
            rawArgs: argv,
        });
        exitCode = process.exitCode;
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = previous;
    }
    return { exitCode, output: written.join('') };
}

describe('prop ladder --objective (PT-63, F-V15)', () => {
    const result: LadderSearchResult = {
        byCost: [],
        byPassRate: [],
        bySpeed: [],
        droppedAliasCount: 0,
        frontier: [],
        gridSize: 0,
        laddersScored: 0,
        topN: 10,
        unscorableCount: 0,
    };

    it('offers every objective flag value', () => {
        const objective = ladderArguments.objective;
        expect(objective.type).toBe('enum');
        expect(objective.options).toStrictEqual(Object.values(ObjectiveFlag));
    });

    it('lists bySpeed first under MonthlyNet, labelled an eval-stage proxy', () => {
        const [first, second, third] = ladderRankingsFor(
            SizingObjective.MonthlyNet,
        );
        expect(first?.select(result)).toBe(result.bySpeed);
        expect(first?.title).toContain('FASTEST TO FUNDED');
        expect(first?.title).toContain('eval-stage proxy');
        expect(second?.select(result)).toBe(result.byCost);
        expect(second?.title).not.toContain('eval-stage proxy');
        expect(third?.select(result)).toBe(result.byPassRate);
    });

    it('lists byCost first under CycleCash, labelled an eval-stage proxy', () => {
        const [first, second, third] = ladderRankingsFor(
            SizingObjective.CycleCash,
        );
        expect(first?.select(result)).toBe(result.byCost);
        expect(first?.title).toContain('CHEAPEST PER FUNDED ACCOUNT');
        expect(first?.title).toContain('eval-stage proxy');
        expect(second?.select(result)).toBe(result.bySpeed);
        expect(second?.title).not.toContain('eval-stage proxy');
        expect(third?.select(result)).toBe(result.byPassRate);
    });

    it('never offers the pass rate table as an objective', () => {
        for (const objective of [
            SizingObjective.CycleCash,
            SizingObjective.MonthlyNet,
        ]) {
            const rankings = ladderRankingsFor(objective);
            const passRate = rankings.at(-1);
            expect(passRate?.select(result)).toBe(result.byPassRate);
            expect(passRate?.title).toContain('reference only');
            expect(passRate?.title).not.toContain('eval-stage proxy');
        }
    });

    it('keeps the default ranking list unchanged', () => {
        expect(LADDER_RANKINGS.map((ranking) => ranking.title)).toStrictEqual([
            'FASTEST TO FUNDED',
            'CHEAPEST PER FUNDED ACCOUNT',
            'HIGHEST EVAL PASS RATE',
        ]);
    });

    it('refuses RuinFirst, which would size eval rungs', () => {
        expect(() => ladderRankingsFor(SizingObjective.RuinFirst)).toThrow(
            ObjectiveNotApplicable,
        );
    });

    it('prints MonthlyNet and the speed table first by default', async () => {
        const { exitCode, output } = await capturedLadder(smallRun);
        expect(exitCode).toBeUndefined();
        expect(output).toContain('objective: monthly net');
        expect(output.indexOf('FASTEST TO FUNDED')).toBeGreaterThan(-1);
        expect(output.indexOf('FASTEST TO FUNDED')).toBeLessThan(
            output.indexOf('CHEAPEST PER FUNDED ACCOUNT'),
        );
    });

    it('prints cycle cash and the cost table first under --objective cycle', async () => {
        const { exitCode, output } = await capturedLadder([
            ...smallRun,
            '--objective',
            'cycle',
        ]);
        expect(exitCode).toBeUndefined();
        expect(output).toContain('objective: cycle cash');
        expect(output.indexOf('CHEAPEST PER FUNDED ACCOUNT')).toBeLessThan(
            output.indexOf('FASTEST TO FUNDED'),
        );
    });

    it('fails with ObjectiveNotApplicable text for --objective ruin-first', async () => {
        const { exitCode, output } = await capturedLadder([
            ...smallRun,
            '--objective',
            'ruin-first',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain('RuinFirst only ranks which plan to buy');
        expect(output).not.toContain('FASTEST TO FUNDED');
    });
});

describe('prop ladder plausibility note carries the pace (F-V22, PT-94b)', () => {
    it('prints the Kelly growth and the pace at one trade per rung, since the ladder length is the trades per day', async () => {
        const { exitCode, output } = await capturedLadder([
            ...smallRun,
            '--winrate',
            '0.7',
            '--rr',
            '1',
        ]);
        expect(exitCode).toBeUndefined();
        expect(output).toContain('Full Kelly would grow a bankroll');
        expect(output).toContain('at 2 trades per day over 21 trading days');
    });

    it('prints no note at a typical edge', async () => {
        const { output } = await capturedLadder(smallRun);
        expect(output).not.toContain('Full Kelly');
    });
});

function stubTrigger() {
    const firm = findFirm(FirmId.Mffu);
    if (!firm) throw new Error('MFFU not registered');
    return vi.spyOn(firm.accountPolicy, 'liveTriggersFor').mockReturnValue([
        new CumulativeAmountTrigger(dollars(1500), {
            fetchedOn: '2026-09-26',
            quote: 'quote',
            sourceKind: PolicySourceKind.LiveFetch,
            url: 'https://example.invalid/rule',
            verification: PolicyVerification.Confirmed,
        }),
    ]);
}

describe('prop ladder says it does not price a confirmed cumulative trigger (PT-36t, F-145)', () => {
    it('prints the shared not-priced line once for a plan with a confirmed trigger', async () => {
        const spy = stubTrigger();
        try {
            const { exitCode, output } = await capturedLadder(smallRun);
            const line = unpricedTriggerLine(
                rapidEodPlan(),
                UnpricedTriggerSurface.Ladder,
            );
            expect(exitCode).toBeUndefined();
            expect(line).not.toBeNull();
            expect(output.split(line ?? '').length - 1).toBe(1);
        } finally {
            spy.mockRestore();
        }
    });

    it('prints nothing about a trigger for a plan without one', async () => {
        const { output } = await capturedLadder(smallRun);
        expect(output).not.toContain('cumulative payout trigger');
    });
});
