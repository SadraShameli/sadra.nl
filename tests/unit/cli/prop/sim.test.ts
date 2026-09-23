import { parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    pathGranularityComparisonArgument,
    planArguments,
    planResolver,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import {
    GRANULARITY_TABLE_COLUMNS,
    granularityComparison,
    granularityTableRow,
    simArguments,
    simHeaderLines,
    simSummaryRows,
} from '~/cli/commands/prop/sim/command';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatPercent,
} from '~/lib/format';
import {
    ApexVariant,
    FirmId,
    type Plan,
    RoiBasis,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

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
        const [riskLine, runLine] = simHeaderLines(inputs);
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
        const [riskLine] = simHeaderLines(inputs);
        expect(riskLine).toContain('ladder [400, 600]');
        expect(riskLine).toContain('stop after-k-losses:2');
    });
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
