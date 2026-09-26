import { parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import optimizeFunded from '~/cli/commands/prop/optimize/funded/command';
import {
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
    ApexVariant,
    DailyLossLimitBreachEffect,
    FirmId,
    InstrumentSymbol,
    oneContractRisk,
    placedFundedRisk,
    placeWholeContractTrade,
    type Plan,
    PolicySizing,
    type PositionSizingConfig,
    resolveAffordableRoomWithin,
    resolvePositionSizing,
    RoiBasis,
    resolveDailyLossRoom,
    RungSizing,
    type SimOutputs,
    simulate,
    type SizedTrade,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

import { flagsNamedButNotAccepted } from './helpFlags';

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

    it('names funded and live flat risk, ladder rungs and percent of cushion as placed in whole contracts, with eval risk only capped (WP40, WP43d)', () => {
        expect(help).toContain(
            'eval risk is capped at the eval contract limit, and funded and live risk (flat risk, ladder rungs and percent of cushion) is placed in whole contracts, at most the contract limit.',
        );
        expect(help).toContain(
            'a funded flat risk or ladder rung below one contract is refused',
        );
    });

    it('says percent risk takes at least one contract and drops the old whole-contract-row wording (WP39e, WP43b)', () => {
        expect(help).toContain('percent risk takes at least one contract.');
        expect(help).not.toContain('on any whole-contract row');
    });

    it('states the room rule in its general form: skip below one contract when a lockout daily loss limit is tighter, one busting contract otherwise, no trade without room (N-74, T33, WP43c, WP43d)', () => {
        expect(help).toContain(
            'When the room left for a whole-contract trade is below one contract, the trade is skipped and the day ends if a daily loss limit that only locks the day is the tighter limit (its room is below the drawdown cushion); otherwise one contract is still taken and its loss, capped at the room, busts the account, unless unaffordable trades are set to be skipped. When no room is left at all, no trade is placed and the day ends.',
        );
        expect(help).not.toContain(
            'is not placed, and the day ends, when a lockout daily loss limit leaves less room than one contract.',
        );
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
