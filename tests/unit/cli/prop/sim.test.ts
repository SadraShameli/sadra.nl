import { parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { liveArguments } from '~/cli/commands/prop/live/command';
import optimizeFunded from '~/cli/commands/prop/optimize/funded/command';
import {
    bankrollArguments,
    type BankrollInputs,
    edgePlausibilityNote,
    pathGranularityComparisonArgument,
    planArguments,
    planResolver,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import simCommand, {
    GRANULARITY_TABLE_COLUMNS,
    granularityComparison,
    granularityTableRow,
    simArguments,
    simBankrollRows,
    simEconomicsRows,
    simHeaderLines,
    simSpinnerLabel,
    simSummaryRows,
} from '~/cli/commands/prop/sim/command';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatPercent,
} from '~/lib/format';
import {
    ALL_FIRMS,
    ApexVariant,
    buildApexLivePlan,
    DailyLossLimitBreachEffect,
    dollars,
    FirmId,
    fraction,
    InstrumentSymbol,
    oneContractRisk,
    placedFundedRisk,
    placeWholeContractTrade,
    type Plan,
    PolicySizing,
    type PositionSizingConfig,
    resolveAffordableRoomWithin,
    resolveDailyLossRoom,
    resolvePositionSizing,
    RoiBasis,
    RungSizing,
    type SimOutputs,
    simulate,
    type SizedTrade,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import { runLiveDay } from '~/lib/prop-calculator/simulator';

import { acceptedFlags, flagsNamedButNotAccepted } from './helpFlags';

function apexEodPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

const BASE: SimOutputs = simulate({
    fundedHorizonDays: 20,
    maxEvalDays: 30,
    plan: apexEodPlan(),
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 4,
    trials: 20,
    winrate: 0.5,
});

function fixture(overrides: Partial<SimOutputs>): SimOutputs {
    return { ...BASE, ...overrides };
}

function parseSimInputs(argv: string[]): TradingInputs {
    return TradingInputs.parse(
        parseArgs<typeof simArguments>(argv, simArguments),
    );
}

function riskLineFor(argv: string[]): string {
    return simHeaderLines(parseSimInputs(argv), apexEodPlan())[0];
}

function rowValue(out: SimOutputs, label: string): string | undefined {
    return simSummaryRows(out).find(([rowLabel]) => rowLabel === label)?.[1];
}

describe('sim summary rows (D2)', () => {
    const out = fixture({
        evalPassProbability: 0.8,
        fundedSurvivalProbability: 0.1,
    });
    const rows = simSummaryRows(out);

    it("leads with 'eval pass' then 'funded survive'", () => {
        expect(rows[0]).toStrictEqual(['eval pass', formatPercent(0.8)]);
        expect(rows[1]).toStrictEqual(['funded survive', formatPercent(0.1)]);
    });

    it("never prints the ambiguous 'pass rate' label", () => {
        expect(rows.map(([label]) => label)).not.toContain('pass rate');
    });
});

describe('sim ROI row (R1-29)', () => {
    it("prints 'n/a' when the ROI has no ratio", () => {
        const out = fixture({
            roiOnCost: { basis: RoiBasis.TotalOnCost, value: null },
        });
        expect(rowValue(out, 'ROI on cost')).toBe('n/a');
    });

    it('prints a present ROI as a percent', () => {
        const out = fixture({
            roiOnCost: { basis: RoiBasis.TotalOnCost, value: 0.5 },
        });
        expect(rowValue(out, 'ROI on cost')).toBe('50.0%');
    });
});

describe('sim cost / drawdown $ row (R1-24)', () => {
    it('prints the ratio as currency with 4 decimals', () => {
        expect(
            rowValue(
                fixture({ costPerDrawdownDollar: 0.0123 }),
                'cost / drawdown $',
            ),
        ).toBe('$0.0123');
    });

    it("prints an unreachable funded account as 'n/a', not 'Infinity' or '$∞'", () => {
        expect(
            rowValue(
                fixture({ costPerDrawdownDollar: Infinity }),
                'cost / drawdown $',
            ),
        ).toBe('n/a');
    });

    it('formats both cost ratios with the shared finite-currency helper', () => {
        for (const cost of [Infinity, NaN, 0, 0.0123, 1234]) {
            const out = fixture({
                costPerDrawdownDollar: cost,
                costPerFundedAccount: cost,
            });
            expect(rowValue(out, 'cost / drawdown $')).toBe(
                formatFiniteCurrency(cost, 4),
            );
            expect(rowValue(out, 'cost / funded acct')).toBe(
                formatFiniteCurrency(cost),
            );
        }
    });
});

describe('sim days to pass rows', () => {
    it("prints 'n/a' for both percentiles when no eval passed, not 0.0", () => {
        const out = fixture({
            daysToPassP50: 0,
            daysToPassP95: 0,
            daysToPassValues: [],
            evalPassProbability: 0,
        });
        expect(rowValue(out, 'days to pass (p50)')).toBe('n/a');
        expect(rowValue(out, 'days to pass (p95)')).toBe('n/a');
    });

    it('prints the percentiles with one decimal when an eval passed', () => {
        const out = fixture({
            daysToPassP50: 7,
            daysToPassP95: 12.25,
            evalPassProbability: 0.4,
        });
        expect(rowValue(out, 'days to pass (p50)')).toBe('7.0');
        expect(rowValue(out, 'days to pass (p95)')).toBe('12.3');
    });
});

describe('sim header (R1-23 and D2)', () => {
    it('always returns a risk line and a run line', () => {
        expectTypeOf(simHeaderLines).returns.toEqualTypeOf<
            readonly [risk: string, run: string]
        >();
    });

    it('prints the stop rule and attempts for a flat-risk run', () => {
        const inputs = parseSimInputs([
            '--stop',
            'after-target:500',
            '--max-attempts',
            '3',
        ]);
        const [riskLine, runLine] = simHeaderLines(inputs, apexEodPlan());
        expect(riskLine).toContain('stop after-target:$500');
        expect(runLine).toContain('max attempts 3');
    });

    it('prints the canonical stop rule for a ladder run', () => {
        const inputs = parseSimInputs([
            '--ladder',
            '400,600',
            '--stop',
            'after-k-losses:2',
        ]);
        const [riskLine] = simHeaderLines(inputs, apexEodPlan());
        expect(riskLine).toContain('ladder [400, 600]');
        expect(riskLine).toContain('stop after-k-losses:2');
    });
});

describe('sim header places funded risk through the engine placedFundedRisk (WP39d)', () => {
    it('shows a funded risk simulate refuses as 0 contracts placed, never one contract rounded up', () => {
        expect(
            riskLineFor([
                '--risk',
                '150',
                '--instrument',
                'NQ',
                '--stop-points',
                '10',
            ]),
        ).toContain('funded flat $150 (placed $0: 0 NQ at 10 pt)');
    });

    it('shows the same contracts and risk the engine helper places', () => {
        const argv = [
            '--risk',
            '450',
            '--instrument',
            'NQ',
            '--stop-points',
            '10',
        ];
        const placed = placedFundedRisk(parseSimInputs(argv), apexEodPlan());
        expect(placed).toMatchObject({ contracts: 2, risk: 400 });
        expect(riskLineFor(argv)).toContain(
            'funded flat $450 (placed $400: 2 NQ at 10 pt)',
        );
    });

    it('places $55 as one ES contract at a 1.1 point stop, printed in whole cents', () => {
        expect(
            riskLineFor([
                '--risk',
                '55',
                '--instrument',
                'ES',
                '--stop-points',
                '1.1',
            ]),
        ).toContain('funded flat $55 (placed $55: 1 ES at 1.1 pt)');
    });
});

describe('sim --ladder builds a contract-capped eval policy (T33, U18)', () => {
    it('states ContractCapped on the eval ladder policy it builds', () => {
        const policy = parseSimInputs(['--ladder', '400,600']).toDayPolicy();
        expect(policy?.sizing).toBe(PolicySizing.ContractCapped);
    });
});

describe('sim --stop-points help (T33, WP40)', () => {
    const help = simArguments['stop-points'].description;

    it('names funded flat risk, funded ladder rungs and funded or live percent of cushion as placed in whole contracts, with eval risk only capped (WP40, WP43d, WP43f)', () => {
        expect(help).toContain(
            'eval risk is capped at the eval contract limit, and funded flat risk, funded ladder rungs and funded or live percent of cushion are placed in whole contracts, at most the contract limit.',
        );
        expect(help).not.toContain(
            'funded and live risk (flat risk, ladder rungs and percent of cushion)',
        );
        expect(help).toContain(
            'a funded flat risk or ladder rung below one contract is refused',
        );
    });

    it('says only funded flat risk and funded ladder rungs are rounded down, so eval rungs read as contract-capped (WP43e)', () => {
        expect(help).toContain(
            'Funded flat risk and funded ladder rungs are rounded down, and a funded flat risk or ladder rung below one contract is refused; percent risk takes at least one contract.',
        );
        expect(help).not.toContain(
            'Flat risk and ladder rungs are rounded down',
        );
    });

    it('says percent risk takes at least one contract and drops the old whole-contract-row wording (WP39e, WP43b)', () => {
        expect(help).toContain('percent risk takes at least one contract.');
        expect(help).not.toContain('on any whole-contract row');
    });

    it('states the room rule in its general form: skip below one contract when a lockout daily loss limit is tighter, one busting contract otherwise unless skipping unaffordable funded trades, which live trading never does, no trade without room (N-74, T33, WP43c, WP43d, WP43g)', () => {
        expect(help).toContain(
            'When the room left for a whole-contract trade is below one contract, the trade is skipped and the day ends if a daily loss limit that only locks the day is the tighter limit (its room is below the drawdown cushion); otherwise one contract is still taken and its loss, capped at the room, busts the account, unless unaffordable funded trades are set to be skipped (a live trade always takes the one contract). When no room is left at all, no trade is placed and the day ends.',
        );
        expect(help).not.toContain(
            'is not placed, and the day ends, when a lockout daily loss limit leaves less room than one contract.',
        );
    });

    it('prop live has no way to skip an unaffordable trade, so the skip exception names funded trades only (WP43g)', () => {
        expect(Object.keys(liveArguments)).not.toContain('unaffordable');
        expect(Object.keys(liveArguments)).toContain('stop-points');
    });

    it('the live simulator caps to the cushion rather than skipping, so a live trade with room below one contract still takes the contract and busts, as the help says (WP43h)', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        state.balance = state.threshold + 5;
        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (positionSizing === null) throw new Error('NQ sizing missing');
        expect(oneContractRisk(positionSizing)).toBeGreaterThan(5);
        const day = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing,
            rng: () => 0.999,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });
        expect(day.traded).toBe(true);
        expect(day.busted).toBe(true);
    });

    it('names no flag prop sim lacks (WP43d)', async () => {
        expect(await flagsNamedButNotAccepted(simCommand)).toStrictEqual([]);
    });

    it('names no flag optimize funded lacks (WP43d)', async () => {
        expect(await flagsNamedButNotAccepted(optimizeFunded)).toStrictEqual(
            [],
        );
    });

    it('is the same help text on prop sim and optimize funded, so the room sentence has to hold for both (WP43b)', async () => {
        const resolvable = optimizeFunded.args;
        if (!resolvable) throw new Error('optimize funded command has no args');
        const resolved = await (typeof resolvable === 'function'
            ? resolvable()
            : resolvable);
        expect(resolved['stop-points']).toStrictEqual(
            simArguments['stop-points'],
        );
    });
});

describe('sim --unaffordable help (N-74, WP43d)', () => {
    it('says what each RungSizing value does, including the skip that ends the day', () => {
        const help = simArguments.unaffordable.description;
        expect(help).toContain(
            `${RungSizing.CapToCushion} cuts it to the room (a whole-contract trade keeps the whole contracts that fit; --stop-points says when one contract is still taken if none fits)`,
        );
        expect(help).toContain(
            `${RungSizing.SkipIfUnaffordable} skips the trade and ends the day, so a whole-contract trade whose one contract does not fit the room is skipped too`,
        );
    });

    it('names each value through the RungSizing enum, so a renamed value cannot drift out of the help (WP43c)', async () => {
        const renamedCap = 'renamedCapValue';
        const renamedSkip = 'renamedSkipValue';
        vi.resetModules();
        vi.doMock('~/lib/prop-calculator', async (importOriginal) => ({
            ...(await importOriginal<object>()),
            RungSizing: {
                CapToCushion: renamedCap,
                SkipIfUnaffordable: renamedSkip,
            },
        }));
        try {
            const shared = await import('~/cli/commands/prop/shared');
            const help = shared.tradingArguments.unaffordable.description;
            expect(help).toContain(`${renamedCap} cuts it to the room`);
            expect(help).toContain(
                `${renamedSkip} skips the trade and ends the day`,
            );
            expect(help).not.toContain(RungSizing.CapToCushion);
            expect(help).not.toContain(RungSizing.SkipIfUnaffordable);
        } finally {
            vi.doUnmock('~/lib/prop-calculator');
            vi.resetModules();
        }
    });
});

function nqTwentyPointSizing(): PositionSizingConfig {
    const sizing = resolvePositionSizing(InstrumentSymbol.NQ, 20);
    if (sizing === null) throw new Error('NQ sizing missing');
    return sizing;
}

describe('the --stop-points room sentence matches the engine (N-74, T33, WP43c)', () => {
    const positionSizing = nqTwentyPointSizing();
    const oneContract = oneContractRisk(positionSizing);
    const halfContract = oneContract / 2;

    function tradeAt(
        cushion: number,
        dailyLossLimit: null | number,
        breach: DailyLossLimitBreachEffect,
        rungSizing: RungSizing,
    ): SizedTrade {
        const { kind, room } = resolveAffordableRoomWithin(
            cushion,
            resolveDailyLossRoom(dailyLossLimit, 0, 0),
            breach,
        );
        return placeWholeContractTrade({
            intendedRisk: 3 * oneContract,
            maxContracts: null,
            positionSizing,
            room,
            roomKind: kind,
            rungSizing,
        });
    }

    it('places nothing when a lockout daily loss room below one contract is tighter than the drawdown cushion', () => {
        expect(
            tradeAt(
                5 * oneContract,
                halfContract,
                DailyLossLimitBreachEffect.Lockout,
                RungSizing.CapToCushion,
            ),
        ).toEqual({ rewardRisk: 0, risk: 0 });
    });

    it('places nothing when the drawdown cushion is a cent above a lockout daily loss room below one contract', () => {
        expect(
            tradeAt(
                halfContract + 0.01,
                halfContract,
                DailyLossLimitBreachEffect.Lockout,
                RungSizing.CapToCushion,
            ),
        ).toEqual({ rewardRisk: 0, risk: 0 });
    });

    it.each([
        [
            'a drawdown cushion below the lockout room',
            halfContract,
            5 * oneContract,
            DailyLossLimitBreachEffect.Lockout,
        ],
        [
            'a drawdown cushion equal to the lockout room',
            halfContract,
            halfContract,
            DailyLossLimitBreachEffect.Lockout,
        ],
        [
            'a drawdown cushion above the lockout room only by float rounding',
            halfContract + 1e-9,
            halfContract,
            DailyLossLimitBreachEffect.Lockout,
        ],
        [
            'no daily loss limit',
            halfContract,
            null,
            DailyLossLimitBreachEffect.Lockout,
        ],
        [
            'a tighter terminating daily loss room',
            5 * oneContract,
            halfContract,
            DailyLossLimitBreachEffect.Terminate,
        ],
    ])(
        'takes one contract with its loss capped at the room under %s',
        (_label, cushion, dailyLossLimit, breach) => {
            expect(
                tradeAt(
                    cushion,
                    dailyLossLimit,
                    breach,
                    RungSizing.CapToCushion,
                ),
            ).toEqual({ rewardRisk: oneContract, risk: halfContract });
        },
    );

    it('skips the one contract under --unaffordable skipIfUnaffordable', () => {
        expect(
            tradeAt(
                halfContract,
                5 * oneContract,
                DailyLossLimitBreachEffect.Lockout,
                RungSizing.SkipIfUnaffordable,
            ),
        ).toEqual({ rewardRisk: 0, risk: 0 });
    });

    it.each([
        DailyLossLimitBreachEffect.Lockout,
        DailyLossLimitBreachEffect.Terminate,
    ])(
        'places no trade when the %s daily loss limit has no room left at all',
        (breach) => {
            expect(
                tradeAt(5 * oneContract, 0, breach, RungSizing.CapToCushion),
            ).toEqual({ rewardRisk: 0, risk: 0 });
        },
    );
});

describe('sim granularity comparison (TG-7, R1-26)', () => {
    const tptPlan = planResolver.resolveOne({ firm: FirmId.Tpt });
    const RUN_ARGS = [
        '--trials',
        '60',
        '--eval-days',
        '30',
        '--funded-days',
        '20',
        '--seed',
        '7',
    ];

    function comparisonFor(granularity: string) {
        const inputs = parseSimInputs([
            '--path-granularity',
            granularity,
            ...RUN_ARGS,
        ]);
        const primary = simulate(inputs.toSimInputs(tptPlan));
        return {
            inputs,
            primary,
            rows: granularityComparison(inputs, tptPlan, primary),
        };
    }

    it('labels each row with the granularity it simulated', () => {
        const { inputs, primary, rows } = comparisonFor('2,10');
        expect(rows.map((row) => row.stepsPerR)).toStrictEqual([2, 10]);
        expect(inputs.toSimInputs(tptPlan).intradayPathStepsPerR).toBe(2);
        expect(rows[0]?.out).toBe(primary);
        expect(rows[1]?.out).toStrictEqual(
            simulate({
                ...inputs.toSimInputs(tptPlan),
                intradayPathStepsPerR: 10,
            }),
        );
        expect([
            rows[0]?.out.fundedBustProbability,
            rows[0]?.out.expectedMonthlyNet,
        ]).not.toStrictEqual([
            rows[1]?.out.fundedBustProbability,
            rows[1]?.out.expectedMonthlyNet,
        ]);
    });

    it('keeps label and value aligned when the list is reversed', () => {
        const { inputs, primary, rows } = comparisonFor('10,2');
        expect(rows.map((row) => row.stepsPerR)).toStrictEqual([10, 2]);
        expect(rows[0]?.out).toBe(primary);
        expect(rows[1]?.out).toStrictEqual(
            simulate({
                ...inputs.toSimInputs(tptPlan),
                intradayPathStepsPerR: 2,
            }),
        );
    });

    it('returns no rows for a single granularity or none', () => {
        const single = parseSimInputs(['--path-granularity', '4', ...RUN_ARGS]);
        const none = parseSimInputs(RUN_ARGS);
        expect(granularityComparison(single, tptPlan, BASE)).toStrictEqual([]);
        expect(granularityComparison(none, tptPlan, BASE)).toStrictEqual([]);
    });

    it('shows eval pass, funded survive, eval bust, funded bust and monthly net', () => {
        expect(
            GRANULARITY_TABLE_COLUMNS.map((column) => column.label),
        ).toStrictEqual([
            'steps/R',
            'eval pass',
            'funded survive',
            'bust in eval',
            'bust when funded',
            'monthly net',
        ]);
    });

    it('formats each cell from the matching SimOutputs field', () => {
        const out = fixture({
            bustProbability: 0.3,
            evalPassProbability: 0.2,
            expectedMonthlyNet: 1234,
            fundedBustProbability: 0.4,
            fundedSurvivalProbability: 0.05,
        });
        expect(granularityTableRow({ out, stepsPerR: 25 })).toStrictEqual([
            '25',
            formatPercent(0.2),
            formatPercent(0.05),
            formatPercent(0.3),
            formatPercent(0.4),
            formatCurrency(1234),
        ]);
    });
});

describe('sim --path-granularity help (R1-26)', () => {
    const description = simArguments['path-granularity'].description;

    it('promises the side-by-side comparison only sim renders', () => {
        expect(description).toMatch(/side-by-side comparison/);
        expect(description).toMatch(/eval/);
        expect(description).toMatch(/funded/);
        expect(description).not.toContain('\u{2014}');
    });

    it('keeps every other trading flag of the shared set', () => {
        expect(new Set(Object.keys(simArguments))).toStrictEqual(
            new Set(
                Object.keys({
                    ...planArguments,
                    ...tradingArguments,
                    ...pathGranularityComparisonArgument,
                    ...bankrollArguments,
                }),
            ),
        );
    });

    it('still parses a comma list into every granularity', () => {
        expect(
            parseSimInputs(['--path-granularity', '4,10,25'])
                .intradayPathStepsPerR,
        ).toStrictEqual([4, 10, 25]);
    });
});

describe('prop sim spinner label (WP24)', () => {
    it('separates the plan label from the trial count with a colon, so a label that already holds a middle dot does not get a second one', () => {
        expect(simSpinnerLabel('$50K · Zero', 5000)).toBe(
            '$50K · Zero: 5000 trials',
        );
        expect(simSpinnerLabel('$50K · Zero', 5000).split(' · ')).toHaveLength(
            2,
        );
    });
});

const EXISTING_SUMMARY_LABELS = [
    'eval pass',
    'funded survive',
    'bust in eval',
    'bust when funded',
    'inactivity closure',
    'timeout',
    'days to pass (p50)',
    'days to pass (p95)',
    'expected attempts',
    'total cost',
    'cost / funded acct',
    'cost / drawdown $',
    'gross payout',
    'payouts / account',
    'payout / funded acct',
    'net',
    'monthly net',
    'ROI on cost',
    'expectancy per trade',
    'max drawdown (p95)',
    'loss streak (p95)',
];

const FUNDED_VALUE_LABEL = 'funded value (engine, 20 funded days, credit-free)';
const EV_PER_ATTEMPT_LABEL =
    'EV per attempt (ignores time; not the ranking objective)';
const WALK_LABEL = 'P(pass) and expected trades (random-walk approximation)';

const ECONOMICS_LABELS = [
    'eval pass per attempt',
    'P(payout | funded)',
    'payouts per funded account',
    'P(k payouts | funded)',
    FUNDED_VALUE_LABEL,
    EV_PER_ATTEMPT_LABEL,
    'breakeven pass rate',
    'funded value / attempt cost',
    'net R to pass',
    WALK_LABEL,
    'attempt pays (any payout)',
];

const ECONOMICS_ARGV = [
    '--funded-days',
    '20',
    '--risk',
    '200',
    '--winrate',
    '0.5',
    '--rr',
    '1',
];

function economicsFixture(overrides: Partial<SimOutputs> = {}): SimOutputs {
    return fixture({
        anyPayoutGivenFundedProbability: 0.5,
        attemptPassProbability: 0.25,
        attemptPaysProbability: 0.1,
        copyAccounts: 1,
        costPerAttempt: 100,
        drawdownAmount: 2000,
        estimates: {
            ...BASE.estimates,
            anyPayoutGivenFundedProbability: {
                standardError: 0.02,
                value: 0.5,
            },
            attemptPassProbability: { standardError: 0.01, value: 0.25 },
            attemptPaysProbability: { standardError: 0.005, value: 0.1 },
            costPerAttempt: { standardError: 2, value: 100 },
            expectedNetPerAttempt: { standardError: 10, value: 150 },
            expectedPayoutPerFundedAccount: { standardError: 50, value: 1000 },
            payoutsPerFundedAccount: { standardError: 0.1, value: 1.5 },
        },
        expectedNetPerAttempt: 150,
        expectedPayoutPerFundedAccount: 1000,
        fundedPayoutCountDistribution: [
            0.5, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
        payoutsPerFundedAccount: 1.5,
        profitTarget: 3000,
        tradesPerSuccessfulAttempt: 120,
        ...overrides,
    });
}

function economicsValue(
    rows: readonly (readonly [string, string])[],
    label: string,
): string | undefined {
    return rows.find(([rowLabel]) => rowLabel === label)?.[1];
}

describe('sim attempt economics lines (PT-54, F-V8, F-V9, F-V22)', () => {
    const inputs = parseSimInputs(ECONOMICS_ARGV);
    const rows = simEconomicsRows(economicsFixture(), inputs, apexEodPlan());

    it('keeps every existing summary line, in order, so monthly net stays ahead of EV per attempt (VD-28)', () => {
        expect(simSummaryRows(BASE).map(([label]) => label)).toStrictEqual(
            EXISTING_SUMMARY_LABELS,
        );
    });

    it('adds the attempt economics lines in the documented order', () => {
        expect(rows.map(([label]) => label)).toStrictEqual(ECONOMICS_LABELS);
    });

    it('prints each per-attempt rate with its standard error', () => {
        expect(economicsValue(rows, 'eval pass per attempt')).toBe(
            '25.0% (SE 1.0%)',
        );
        expect(economicsValue(rows, 'P(payout | funded)')).toBe(
            '50.0% (SE 2.0%)',
        );
        expect(economicsValue(rows, 'payouts per funded account')).toBe(
            '1.50 (SE 0.10)',
        );
        expect(economicsValue(rows, 'attempt pays (any payout)')).toBe(
            '10.0% (SE 0.5%)',
        );
    });

    it('prints the payouts per funded account distribution with a 10+ tail', () => {
        expect(economicsValue(rows, 'P(k payouts | funded)')).toBe(
            '0: 50.0% | 1: 25.0% | 2: 25.0% | 3: 0.0% | 4: 0.0% | 5: 0.0% | 6: 0.0% | 7: 0.0% | 8: 0.0% | 9: 0.0% | 10+: 0.0%',
        );
    });

    it('says no trial reached funded when the distribution is empty', () => {
        const empty = simEconomicsRows(
            economicsFixture({ fundedPayoutCountDistribution: [] }),
            inputs,
            apexEodPlan(),
        );
        expect(economicsValue(empty, 'P(k payouts | funded)')).toBe(
            'n/a (no trial reached funded)',
        );
    });

    it('prints the funded value, EV per attempt, breakeven and funded value / attempt cost from the one EV definition', () => {
        expect(economicsValue(rows, FUNDED_VALUE_LABEL)).toBe('$1,000 (SE $50)');
        expect(economicsValue(rows, EV_PER_ATTEMPT_LABEL)).toBe(
            '$150 (SE $10)',
        );
        expect(economicsValue(rows, 'breakeven pass rate')).toBe('10.0%');
        expect(economicsValue(rows, 'funded value / attempt cost')).toBe(
            '10.00x (net 9:1)',
        );
    });

    it('totals the funded value over the copy group like the EV per attempt', () => {
        const copied = simEconomicsRows(
            economicsFixture({ copyAccounts: 3 }),
            inputs,
            apexEodPlan(),
        );
        expect(economicsValue(copied, FUNDED_VALUE_LABEL)).toBe(
            '$3,000 (SE $150)',
        );
    });

    it('explains a missing breakeven with the typed reason', () => {
        const noValue = simEconomicsRows(
            economicsFixture({
                estimates: {
                    ...economicsFixture().estimates,
                    expectedPayoutPerFundedAccount: {
                        standardError: null,
                        value: 0,
                    },
                },
                expectedNetPerAttempt: -100,
                expectedPayoutPerFundedAccount: 0,
            }),
            inputs,
            apexEodPlan(),
        );
        expect(economicsValue(noValue, 'breakeven pass rate')).toBe(
            'n/a: the funded account has no positive expected value',
        );
    });

    it('shows the funded value row as n/a with a reason when the decomposition itself is invalid, not a bare amount (PT-54 review F-V8)', () => {
        const invalid = simEconomicsRows(
            economicsFixture({ expectedNetPerAttempt: NaN }),
            inputs,
            apexEodPlan(),
        );
        const reason = economicsValue(invalid, EV_PER_ATTEMPT_LABEL);
        expect(reason).toMatch(/^n\/a: /);
        expect(economicsValue(invalid, FUNDED_VALUE_LABEL)).toBe(reason);
    });

    it('prints the net R to pass and the two-barrier walk beside the simulated trades per pass (the 50/50 fixture: 40% in 150 trades)', () => {
        expect(economicsValue(rows, 'net R to pass')).toBe('15.0R');
        expect(economicsValue(rows, WALK_LABEL)).toBe(
            '40.0% pass, 150.0 trades to pass or bust (simulated trades per pass 120.0)',
        );
    });

    it('says no positive edge instead of a walk when the expectancy is not positive', () => {
        const noEdge = simEconomicsRows(
            economicsFixture(),
            parseSimInputs([
                '--funded-days',
                '20',
                '--winrate',
                '0.3',
                '--rr',
                '2',
            ]),
            apexEodPlan(),
        );
        expect(economicsValue(noEdge, WALK_LABEL)).toBe('no positive edge');
    });

    it('does not invent a single risk for a ladder run', () => {
        const ladder = simEconomicsRows(
            economicsFixture(),
            parseSimInputs([...ECONOMICS_ARGV, '--ladder', '400,600']),
            apexEodPlan(),
        );
        expect(economicsValue(ladder, 'net R to pass')).toBe(
            'n/a (an eval ladder has no single risk per trade)',
        );
        expect(economicsValue(ladder, WALK_LABEL)).toBe(
            'n/a (an eval ladder has no single risk per trade)',
        );
    });

    it('prints no eval pace for an instant-funded plan', () => {
        const instant = ALL_FIRMS.flatMap((firm) => [...firm.plans]).find(
            (plan) => plan.isInstantFunded,
        );
        if (!instant) throw new Error('no instant-funded plan registered');
        const instantRows = simEconomicsRows(
            economicsFixture(),
            inputs,
            instant,
        );
        expect(economicsValue(instantRows, 'net R to pass')).toBe(
            'n/a (instant funded: no eval)',
        );
        expect(economicsValue(instantRows, WALK_LABEL)).toBe(
            'n/a (instant funded: no eval)',
        );
    });
});

const TWO_POINT_NETS: number[] = Array.from({ length: 1000 }, (_, index) =>
    index % 5 === 0 ? 900 : -100,
);

function bankrollInputs(
    bankroll: null | number,
    lossThreshold: null | number,
): BankrollInputs {
    return {
        bankroll: bankroll === null ? null : dollars(bankroll),
        lossThreshold: lossThreshold === null ? null : fraction(lossThreshold),
    };
}

function percentIn(text: string | undefined): number {
    const match = /^(-?\d+(?:\.\d+)?)%/.exec(text ?? '');
    if (!match?.[1]) throw new Error(`no percent in "${String(text)}"`);
    return Number(match[1]) / 100;
}

function twoPointFixture(overrides: Partial<SimOutputs> = {}): SimOutputs {
    return economicsFixture({
        attemptPaysProbability: 0.2,
        costPerAttempt: 100,
        expectedNetPerAttempt: 100,
        expectedTotalCost: 100,
        netValues: TWO_POINT_NETS,
        ...overrides,
    });
}

describe('sim bankroll lines (PT-54, F-V13)', () => {
    const inputs = parseSimInputs(['--seed', '42']);

    it('prints nothing without --bankroll or --loss-threshold', () => {
        expect(
            simBankrollRows(twoPointFixture(), inputs, bankrollInputs(null, null)),
        ).toStrictEqual([]);
    });

    it('prints attempts affordable, the batch loss headline, the no-payout row and an unset threshold, in that order', () => {
        const rows = simBankrollRows(
            twoPointFixture(),
            inputs,
            bankrollInputs(5000, null),
        );
        expect(rows.map(([label]) => label)).toStrictEqual([
            'attempts affordable',
            'P(batch net < 0) over 50 attempts',
            'P(no payout from 50 attempts)',
            'minimum budget for the loss target',
        ]);
        expect(economicsValue(rows, 'attempts affordable')).toBe(
            '50 at $100 per attempt',
        );
        expect(
            economicsValue(rows, 'minimum budget for the loss target'),
        ).toBe('threshold not set');
    });

    it('computes P(batch net < 0) from the run nets: within 3 SE of the exact 0.018502 for the p 0.2, value 1,000, cost 100 two-point case', () => {
        const rows = simBankrollRows(
            twoPointFixture(),
            inputs,
            bankrollInputs(5000, null),
        );
        const text = economicsValue(rows, 'P(batch net < 0) over 50 attempts');
        const standardError = Math.sqrt((0.018502 * (1 - 0.018502)) / 10_000);
        expect(Math.abs(percentIn(text) - 0.018502)).toBeLessThan(
            3 * standardError + 0.0005,
        );
        expect(text).toMatch(/\(SE \d+\.\d%\)$/);
    });

    it('prints the no-payout probability only as a secondary row with its meaning', () => {
        const rows = simBankrollRows(
            twoPointFixture(),
            inputs,
            bankrollInputs(5000, null),
        );
        expect(economicsValue(rows, 'P(no payout from 50 attempts)')).toBe(
            '0.001% (ignores payout size)',
        );
    });

    it('prints the minimum budget for the loss target on P(batch net < 0), near the exact 44 attempts', () => {
        const rows = simBankrollRows(
            twoPointFixture(),
            inputs,
            bankrollInputs(5000, 0.05),
        );
        const text =
            economicsValue(rows, 'minimum budget for the loss target') ?? '';
        const match =
            /^\$([\d,]+) \((\d+) attempts, P\(batch net < 0\) at or below 5\.0% from there up to 1000 attempts\)$/.exec(
                text,
            );
        expect(match).not.toBeNull();
        const attempts = Number(match?.[2]);
        expect(attempts).toBeGreaterThanOrEqual(43);
        expect(attempts).toBeLessThanOrEqual(45);
        expect(Number(match?.[1]?.replaceAll(',', ''))).toBe(attempts * 100);
    });

    it('says no positive edge when the EV per attempt is not positive', () => {
        const rows = simBankrollRows(
            twoPointFixture({
                expectedNetPerAttempt: -100,
                netValues: [-100],
            }),
            inputs,
            bankrollInputs(5000, 0.05),
        );
        expect(
            economicsValue(rows, 'minimum budget for the loss target'),
        ).toBe('no positive edge');
        expect(
            percentIn(
                economicsValue(rows, 'P(batch net < 0) over 50 attempts'),
            ),
        ).toBe(1);
    });

    it('prints only the minimum budget when a threshold is given without a bankroll', () => {
        const rows = simBankrollRows(
            twoPointFixture({ netValues: [100] }),
            inputs,
            bankrollInputs(null, 0.05),
        );
        expect(rows).toStrictEqual([
            [
                'minimum budget for the loss target',
                '$100 (1 attempt, P(batch net < 0) at or below 5.0% from there up to 1000 attempts)',
            ],
        ]);
    });

    it('samples whole trials, priced at the spend per trial, when a trial can hold several attempts', () => {
        const rows = simBankrollRows(
            twoPointFixture({ expectedTotalCost: 250 }),
            parseSimInputs(['--seed', '42', '--max-attempts', '3']),
            bankrollInputs(5000, null),
        );
        expect(rows.map(([label]) => label)).toStrictEqual([
            'attempts affordable',
            'P(batch net < 0) over 20 trials of up to 3 attempts',
            'P(no payout from 50 attempts)',
            'minimum budget for the loss target',
        ]);
    });
});

async function capturedSimRun(argv: string[]): Promise<string> {
    const written: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
    const exitCode = process.exitCode;
    try {
        await simCommand.run?.({
            args: parseArgs<typeof simArguments>(argv, simArguments),
            cmd: simCommand,
            rawArgs: argv,
        });
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return written.join('');
}

const SMALL_SIM = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--trials',
    '40',
    '--eval-days',
    '20',
    '--funded-days',
    '20',
];

describe('prop sim prints the economics after the existing lines (PT-54)', () => {
    it('accepts --bankroll and --loss-threshold and names them in its help', async () => {
        expect(await acceptedFlags(simCommand)).toEqual(
            expect.arrayContaining(['bankroll', 'loss-threshold']),
        );
        expect(await flagsNamedButNotAccepted(simCommand)).toStrictEqual([]);
    });

    it('prints monthly net first, then the attempt economics and the bankroll lines', async () => {
        const stdout = await capturedSimRun([
            ...SMALL_SIM,
            '--bankroll',
            '5000',
            '--loss-threshold',
            '0.05',
        ]);
        const monthly = stdout.indexOf('monthly net');
        const evPerAttempt = stdout.indexOf(EV_PER_ATTEMPT_LABEL);
        expect(monthly).toBeGreaterThanOrEqual(0);
        expect(evPerAttempt).toBeGreaterThan(monthly);
        expect(stdout).toContain('attempts affordable');
        expect(stdout).toContain('P(no payout from');
        expect(stdout).toContain('minimum budget for the loss target');
        expect(stdout).not.toMatch(/\b(?:implausible|no|strong|typical) edge\b/);
    });

    it('prints the plausibility note for 70% at 1:1', async () => {
        const stdout = await capturedSimRun([
            ...SMALL_SIM,
            '--winrate',
            '0.7',
            '--rr',
            '1',
        ]);
        expect(stdout).toContain(
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }) ??
                'missing note',
        );
    });
});
