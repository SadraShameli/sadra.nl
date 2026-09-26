import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import compare, {
    compareColumns,
    compareOutputs,
    compareRowCells,
    CompareSortKey,
    describeColumnBasis,
    describeExcludedPlans,
    rankRows,
    SORT_KEYS,
} from '~/cli/commands/prop/compare/command';
import {
    planResolver,
    planVariant,
    singlePathGranularityArgument,
} from '~/cli/commands/prop/shared';
import { formatCurrency, formatFiniteCurrency } from '~/lib/format';
import {
    FirmId,
    LucidVariant,
    MffuVariant,
    type Plan,
    type SimOutputs,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

import { flagsNamedButNotAccepted } from './helpFlags';

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

const BASE: SimOutputs = simulate({
    fundedHorizonDays: 20,
    maxEvalDays: 30,
    plan: rapidEodPlan(),
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 4,
    trials: 30,
    winrate: 0.5,
});

interface Row {
    label: string;
    out: SimOutputs;
}

function labels(rows: readonly Row[]): string[] {
    return rows.map((entry) => entry.label);
}

function row(label: string, overrides: Partial<SimOutputs>): Row {
    return { label, out: { ...BASE, ...overrides } };
}

const NEVER_PASSES: Partial<SimOutputs> = {
    daysToPassP50: 0,
    daysToPassValues: [],
    evalPassProbability: 0,
    fundedSurvivalProbability: 0,
};

describe('compare --sort keys', () => {
    it('lists every CompareSortKey member: cost, days, net, pass and spend', () => {
        expect(SORT_KEYS).toStrictEqual(Object.values(CompareSortKey));
        expect(SORT_KEYS).toStrictEqual([
            'cost',
            'days',
            'net',
            'pass',
            'spend',
        ]);
    });

    it('offers exactly SORT_KEYS on the command', async () => {
        const resolvable = compare.args;
        if (!resolvable) throw new Error('compare command has no args');
        const resolved =
            typeof resolvable === 'function' ? resolvable() : resolvable;
        const arguments_: ArgsDef =
            resolved instanceof Promise ? await resolved : resolved;
        const sort = arguments_.sort;
        if (sort?.type !== 'enum') throw new Error('sort is not an enum');
        expect(sort.options).toStrictEqual([...SORT_KEYS]);
    });
});

describe('rankRows direction per sort key (TG-2)', () => {
    it('net ranks by monthly net, highest first', () => {
        const rows = [
            row('100', { expectedMonthlyNet: 100 }),
            row('300', { expectedMonthlyNet: 300 }),
            row('200', { expectedMonthlyNet: 200 }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Net))).toStrictEqual([
            '300',
            '200',
            '100',
        ]);
    });

    it('cost ranks by cost per funded account (D1), cheapest first and never-funded last', () => {
        const rows = [
            row('500', { costPerFundedAccount: 500, expectedTotalCost: 100 }),
            row('never', {
                costPerFundedAccount: Infinity,
                expectedTotalCost: 50,
            }),
            row('300', { costPerFundedAccount: 300, expectedTotalCost: 900 }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Cost))).toStrictEqual([
            '300',
            '500',
            'never',
        ]);
    });

    it('treats two never-funded plans as equal on cost', () => {
        const a = row('a', { costPerFundedAccount: Infinity }).out;
        const b = row('b', { costPerFundedAccount: Infinity }).out;
        expect(compareOutputs(a, b, CompareSortKey.Cost)).toBe(0);
    });

    it('spend ranks by expected spend per trial, cheapest first', () => {
        const rows = [
            row('300', { costPerFundedAccount: 1, expectedTotalCost: 300 }),
            row('100', {
                costPerFundedAccount: Infinity,
                expectedTotalCost: 100,
            }),
            row('200', { costPerFundedAccount: 50, expectedTotalCost: 200 }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Spend))).toStrictEqual([
            '100',
            '200',
            '300',
        ]);
    });

    it('pass ranks by eval pass, not funded survival', () => {
        const rows = [
            row('survives more', {
                evalPassProbability: 0.5,
                fundedSurvivalProbability: 0.45,
            }),
            row('passes more', {
                evalPassProbability: 0.8,
                fundedSurvivalProbability: 0.05,
            }),
            row('middle', {
                evalPassProbability: 0.6,
                fundedSurvivalProbability: 0.3,
            }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Pass))).toStrictEqual([
            'passes more',
            'middle',
            'survives more',
        ]);
    });

    it('days ranks the fastest eval pass first and a never-passing plan last', () => {
        const rows = [
            row('A', {
                daysToPassP50: 20,
                daysToPassValues: [20],
                evalPassProbability: 0.5,
            }),
            row('C', NEVER_PASSES),
            row('B', {
                daysToPassP50: 10,
                daysToPassValues: [10],
                evalPassProbability: 0.5,
            }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Days))).toStrictEqual([
            'B',
            'A',
            'C',
        ]);
    });

    it('keeps input order for ties', () => {
        const rows = [
            row('first', { expectedMonthlyNet: 100 }),
            row('second', { expectedMonthlyNet: 100 }),
            row('third', { expectedMonthlyNet: 100 }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Net))).toStrictEqual([
            'first',
            'second',
            'third',
        ]);
    });

    it('does not reorder its input', () => {
        const rows = [
            row('low', { expectedMonthlyNet: 1 }),
            row('high', { expectedMonthlyNet: 2 }),
        ];
        rankRows(rows, CompareSortKey.Net);
        expect(labels(rows)).toStrictEqual(['low', 'high']);
    });
});

describe('compareOutputs never returns NaN (TG-2)', () => {
    const outputs = [
        row('never', NEVER_PASSES).out,
        row('never twin', NEVER_PASSES).out,
        row('passes', {
            daysToPassP50: 8,
            daysToPassValues: [8],
            evalPassProbability: 0.4,
        }).out,
    ];

    it.each([...SORT_KEYS])('%s', (sort: CompareSortKey) => {
        for (const a of outputs) {
            for (const b of outputs) {
                expect(Number.isNaN(compareOutputs(a, b, sort))).toBe(false);
            }
        }
    });

    it('treats two never-passing plans as equal on days', () => {
        const [never, twin] = outputs;
        if (!never || !twin) throw new Error('fixture missing');
        expect(compareOutputs(never, twin, CompareSortKey.Days)).toBe(0);
    });
});

describe("the 'best by' plan is the first ranked row for every key (TG-2)", () => {
    const rows = [
        row('lowest spend', {
            costPerFundedAccount: 900,
            daysToPassP50: 30,
            daysToPassValues: [30],
            evalPassProbability: 0.2,
            expectedMonthlyNet: 50,
            expectedTotalCost: 10,
        }),
        row('best net', {
            costPerFundedAccount: 800,
            daysToPassP50: 25,
            daysToPassValues: [25],
            evalPassProbability: 0.3,
            expectedMonthlyNet: 900,
            expectedTotalCost: 500,
        }),
        row('best pass', {
            costPerFundedAccount: 450,
            daysToPassP50: 20,
            daysToPassValues: [20],
            evalPassProbability: 0.9,
            expectedMonthlyNet: 100,
            expectedTotalCost: 400,
        }),
        row('fastest', {
            costPerFundedAccount: 700,
            daysToPassP50: 3,
            daysToPassValues: [3],
            evalPassProbability: 0.4,
            expectedMonthlyNet: 60,
            expectedTotalCost: 300,
        }),
    ];
    const expectedBest: Record<CompareSortKey, string> = {
        [CompareSortKey.Cost]: 'best pass',
        [CompareSortKey.Days]: 'fastest',
        [CompareSortKey.Net]: 'best net',
        [CompareSortKey.Pass]: 'best pass',
        [CompareSortKey.Spend]: 'lowest spend',
    };

    it.each([...SORT_KEYS])('%s', (sort: CompareSortKey) => {
        expect(rankRows(rows, sort)[0]?.label).toBe(expectedBest[sort]);
    });
});

describe('compare table cells (D2 and TG-2)', () => {
    it('prints eval pass and funded survive as separate columns', () => {
        const cells = compareRowCells(
            row('x', {
                evalPassProbability: 0.8,
                fundedSurvivalProbability: 0.1,
            }).out,
        );
        expect(cells[0]).toBe('80.0%');
        expect(cells[1]).toBe('10.0%');
    });

    it('prints cost per funded account and expected spend per trial as separate columns', () => {
        const cells = compareRowCells(
            row('x', { costPerFundedAccount: 1234, expectedTotalCost: 420 })
                .out,
        );
        expect(cells[3]).toBe(formatCurrency(1234));
        expect(cells[4]).toBe(formatCurrency(420));
        expect(cells).toHaveLength(8);
    });

    it("prints 'n/a' cost per funded account when no eval ever passed", () => {
        const cells = compareRowCells(
            row('never', { ...NEVER_PASSES, costPerFundedAccount: Infinity })
                .out,
        );
        expect(cells[3]).toBe('n/a');
    });

    it.each([Infinity, NaN, 0, 1234])(
        'prints a %s cost per funded account through the shared finite-currency helper',
        (cost) => {
            const cells = compareRowCells(
                row('x', { costPerFundedAccount: cost }).out,
            );
            expect(cells[3]).toBe(formatFiniteCurrency(cost));
        },
    );

    it("prints 'n/a' days when the plan never passed the eval, not 0", () => {
        const cells = compareRowCells(row('never', NEVER_PASSES).out);
        expect(cells[2]).toBe('n/a');
    });

    it('prints the median days to pass when the plan passed', () => {
        const cells = compareRowCells(
            row('passes', {
                daysToPassP50: 7,
                daysToPassValues: [7],
                evalPassProbability: 0.5,
            }).out,
        );
        expect(cells[2]).toBe('7');
    });
});

describe('compare column basis at --copy-accounts (R1-2 review)', () => {
    it('keeps the plain headers for a single account and prints no legend', () => {
        expect(compareColumns(1).map((column) => column.label)).toStrictEqual([
            'plan',
            'eval pass',
            'survive',
            'days',
            '$/funded',
            'spend',
            'payout',
            'monthly',
            'bustF',
        ]);
        expect(describeColumnBasis(1)).toBeNull();
    });

    it('marks the columns that total every copy at 5 copies and explains the per-account ones', () => {
        const columns = compareColumns(5);
        expect(columns.map((column) => column.label)).toStrictEqual([
            'plan',
            'eval pass',
            'survive',
            'days',
            '$/funded',
            'spend x5',
            'payout x5',
            'monthly x5',
            'bustF',
        ]);
        for (const column of columns) {
            expect(column.width).toBeGreaterThanOrEqual(column.label.length);
        }
        expect(describeColumnBasis(5)).toBe(
            'spend, payout and monthly total all 5 copies; eval pass, survive, days, $/funded and bustF are per account',
        );
    });
});

describe('call-up-only plans in compare (R1-34, D3)', () => {
    it('excludes the TopStep Pro Account by default and reports it', () => {
        const { excluded, plans } = planResolver.resolveRankable(
            { firm: FirmId.TopStep },
            false,
        );
        expect(plans).toHaveLength(8);
        expect(plans.some((plan) => !plan.isPurchasable)).toBe(false);
        expect(excluded.map((plan) => planVariant(plan))).toStrictEqual([
            TopStepVariant.ProAccount,
        ]);
    });

    it('ranks every TopStep plan with --include-callup', () => {
        const { excluded, plans } = planResolver.resolveRankable(
            { firm: FirmId.TopStep },
            true,
        );
        expect(plans).toHaveLength(9);
        expect(excluded).toStrictEqual([]);
    });

    it('fails loud when the selection matched only call-up-only plans', () => {
        expect(() =>
            planResolver.resolveRankable(
                { firm: FirmId.TopStep, variant: TopStepVariant.ProAccount },
                false,
            ),
        ).toThrow(/--include-callup/);
        expect(() =>
            planResolver.resolveRankable(
                { firm: FirmId.TopStep, variant: TopStepVariant.ProAccount },
                false,
            ),
        ).toThrow(/matched only call-up only plans/);
    });

    it('excludes the invite-only LucidMaxx by default (N-11)', () => {
        const { excluded } = planResolver.resolveRankable(
            { firm: FirmId.Lucid },
            false,
        );
        expect(excluded.map((plan) => planVariant(plan))).toStrictEqual([
            LucidVariant.Maxx,
        ]);
    });

    it('declares --include-callup as a boolean that defaults to false', async () => {
        const arguments_ = await compareArguments();
        const flag = arguments_['include-callup'];
        expect(flag?.type).toBe('boolean');
        expect(flag?.default).toBe(false);
        expect(
            parseArgs(['--include-callup'], arguments_)['include-callup'],
        ).toBe(true);
        expect(parseArgs([], arguments_)['include-callup']).toBe(false);
    });

    it('describes the excluded plans in one muted line', () => {
        const { excluded } = planResolver.resolveRankable(
            { firm: FirmId.TopStep },
            false,
        );
        const [proAccount] = excluded;
        if (!proAccount) throw new Error('Pro Account not excluded');
        expect(describeExcludedPlans(excluded)).toBe(
            `excluded 1 call-up only plan(s): ${proAccount.label} (pass --include-callup to rank them)`,
        );
        expect(describeExcludedPlans([])).toBeNull();
    });
});

describe('compare --path-granularity (WP11 handoff)', () => {
    it('declares the single-granularity flag explicitly', async () => {
        const arguments_ = await compareArguments();
        expect(arguments_['path-granularity']).toStrictEqual(
            singlePathGranularityArgument['path-granularity'],
        );
    });
});

async function compareArguments(): Promise<ArgsDef> {
    const resolvable = compare.args;
    if (!resolvable) throw new Error('compare command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? await resolved : resolved;
}

describe('prop compare --help names only flags prop compare accepts (WP43d)', () => {
    it('names no flag prop compare lacks, such as --percent or --funded-ladder', async () => {
        expect(await flagsNamedButNotAccepted(compare)).toStrictEqual([]);
    });
});
