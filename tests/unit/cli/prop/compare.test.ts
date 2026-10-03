import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import compare, {
    bankrollFiguresOf,
    compareColumns,
    compareOutputs,
    compareRankingHeadingLine,
    compareRow,
    compareRowCells,
    CompareSortKey,
    describeColumnBasis,
    describeEconomicsColumns,
    describeExcludedPlans,
    nonPositiveEvPlanLines,
    type OrderedSortKey,
    rankRows,
    readTopLimit,
    requireScreenTimeForSort,
    resolveCompareRanking,
    SORT_KEYS,
    SPLIT_COLUMNS,
    splitTableRow,
} from '~/cli/commands/prop/compare/command';
import {
    edgePlausibilityNote,
    planResolver,
    planVariant,
    RuinFirstNeedsBankroll,
    singlePathGranularityArgument,
    SortObjectiveConflict,
} from '~/cli/commands/prop/shared';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatOptionalPercent,
    formatPercent,
} from '~/lib/format';
import {
    type Dollars,
    dollars,
    FirmId,
    fraction,
    FundedNextVariant,
    LifetimeCapScope,
    LucidVariant,
    MffuVariant,
    type Plan,
    type SimOutputs,
    simulate,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import {
    COPY_SPLIT_CORRELATION_NOTE,
    type CopySplitRow,
    CopySplitRowKind,
} from '~/lib/prop-calculator/advisor/policy';
import {
    attemptsAffordable,
    bankrollRiskFigures,
    type BatchLossPricing,
    BatchLossStatus,
    cohortOutcome,
    LOSS_RISK_DRAWS,
    noPayoutProbability,
    noPayoutProbabilityFromDistribution,
    priceBatchLoss,
    RUIN_FIRST_FALLBACK_NOTE,
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_NO_POSITIVE_EV_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
    RuinFirstFallback,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';

import {
    mffProLifetimeCapFixture,
    WINNING_TRADER,
} from '../../lib/prop-calculator/fixtures/mffProLifetimeCapFixture';
import { acceptedFlags, flagsNamedButNotAccepted } from './helpFlags';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

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
    it('lists every CompareSortKey member: cost, cycle, days, hour, net, pass, ruin-first and spend', () => {
        expect(SORT_KEYS).toStrictEqual(Object.values(CompareSortKey));
        expect(SORT_KEYS).toStrictEqual([
            'cost',
            'cycle',
            'days',
            'hour',
            'net',
            'pass',
            'ruin-first',
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
        expect(labels(rankRows(rows, CompareSortKey.Net).rows)).toStrictEqual([
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
        expect(labels(rankRows(rows, CompareSortKey.Cost).rows)).toStrictEqual([
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
        expect(labels(rankRows(rows, CompareSortKey.Spend).rows)).toStrictEqual(
            ['100', '200', '300'],
        );
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
        expect(labels(rankRows(rows, CompareSortKey.Pass).rows)).toStrictEqual([
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
        expect(labels(rankRows(rows, CompareSortKey.Days).rows)).toStrictEqual([
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
        expect(labels(rankRows(rows, CompareSortKey.Net).rows)).toStrictEqual([
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

const ORDERED_SORT_KEYS = SORT_KEYS.filter(
    (sort): sort is OrderedSortKey => sort !== CompareSortKey.RuinFirst,
);

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

    it.each(ORDERED_SORT_KEYS)('%s', (sort) => {
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
            expectedNet: 1,
            expectedNetPerAttempt: 10,
            expectedTotalCost: 10,
        }),
        row('best net', {
            costPerFundedAccount: 800,
            daysToPassP50: 25,
            daysToPassValues: [25],
            evalPassProbability: 0.3,
            expectedMonthlyNet: 900,
            expectedNet: 2,
            expectedNetPerAttempt: 10,
            expectedTotalCost: 500,
        }),
        row('best pass', {
            costPerFundedAccount: 450,
            daysToPassP50: 20,
            daysToPassValues: [20],
            evalPassProbability: 0.9,
            expectedMonthlyNet: 100,
            expectedNet: 3,
            expectedNetPerAttempt: 10,
            expectedTotalCost: 400,
        }),
        row('fastest', {
            costPerFundedAccount: 700,
            daysToPassP50: 3,
            daysToPassValues: [3],
            evalPassProbability: 0.4,
            expectedMonthlyNet: 60,
            expectedNet: 999,
            expectedNetPerAttempt: 10,
            expectedTotalCost: 300,
        }),
    ];
    const expectedBest: Record<CompareSortKey, string> = {
        [CompareSortKey.Cost]: 'best pass',
        [CompareSortKey.Cycle]: 'fastest',
        [CompareSortKey.Days]: 'fastest',
        [CompareSortKey.Hour]: 'best net',
        [CompareSortKey.Net]: 'best net',
        [CompareSortKey.Pass]: 'best pass',
        [CompareSortKey.RuinFirst]: 'best net',
        [CompareSortKey.Spend]: 'lowest spend',
    };

    it.each([...SORT_KEYS])('%s', (sort: CompareSortKey) => {
        expect(rankRows(rows, sort).rows[0]?.label).toBe(expectedBest[sort]);
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
        expect(cells).toHaveLength(11);
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
            'firm',
            'plan',
            'eval pass',
            'survive',
            'days',
            '$/funded',
            'spend',
            'payout',
            'monthly',
            'cycle net',
            'ROI',
            'bustF',
            'P(no payout)',
        ]);
        expect(describeColumnBasis(1)).toBeNull();
    });

    it('marks the columns that total every copy at 5 copies and explains the per-account ones', () => {
        const columns = compareColumns(5);
        expect(columns.map((column) => column.label)).toStrictEqual([
            'firm',
            'plan',
            'eval pass',
            'survive',
            'days',
            '$/funded',
            'spend x5',
            'payout x5',
            'monthly x5',
            'cycle net x5',
            'ROI',
            'bustF',
            'P(no payout)',
        ]);
        for (const column of columns) {
            expect(column.width).toBeGreaterThanOrEqual(column.label.length);
        }
        expect(describeColumnBasis(5)).toBe(
            'spend, payout, monthly and cycle net total all 5 copies; eval pass, survive, days, $/funded, ROI, bustF and P(no payout) are per account',
        );
    });
});

describe("compare's 'payout' cell never prints above the pooled per-user cap on 3 copied MFF Pro accounts (F-110, PT-12m)", () => {
    const { cap: CAP, plan: mffPro } = mffProLifetimeCapFixture();

    it('prints a payout at or below $100,000 for a winning trader on 3 copies', () => {
        const out = simulate({ ...WINNING_TRADER, plan: mffPro });
        expect(out.expectedGrossPayout).toBeLessThanOrEqual(CAP);
        const cells = compareRowCells(out);
        expect(cells[5]).toBe(formatCurrency(out.expectedGrossPayout));
        expect(cells[5]).not.toBe(formatCurrency(CAP + 1));
    });

    it('leaves a per-account-scope plan unaffected, so this cell is not silently capped for every plan', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const out = simulate({ ...WINNING_TRADER, plan: perAccountPlan });
        expect(out.expectedGrossPayout).toBeGreaterThan(CAP);
        const cells = compareRowCells(out);
        expect(cells[5]).toBe(formatCurrency(out.expectedGrossPayout));
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

describe('discontinued plans in compare (PT-71b, FNL:003 Expired on fundednext.com/labs)', () => {
    it('excludes FNL:003 from FundedNext by default and reports it', () => {
        const { excluded, plans } = planResolver.resolveRankable(
            { firm: FirmId.FundedNext },
            false,
        );
        expect(plans.some((plan) => !plan.isPurchasable)).toBe(false);
        expect(excluded.map((plan) => planVariant(plan))).toStrictEqual([
            FundedNextVariant.Fnl003,
        ]);
    });

    it('ranks FNL:003 with --include-callup', () => {
        const { excluded, plans } = planResolver.resolveRankable(
            { firm: FirmId.FundedNext },
            true,
        );
        expect(plans.map((plan) => planVariant(plan))).toContain(
            FundedNextVariant.Fnl003,
        );
        expect(excluded).toStrictEqual([]);
    });

    it('fails loud when the selection matched only FNL:003', () => {
        expect(() =>
            planResolver.resolveRankable(
                {
                    firm: FirmId.FundedNext,
                    variant: FundedNextVariant.Fnl003,
                },
                false,
            ),
        ).toThrow(/matched only no longer sold plans/);
    });

    it('describes FNL:003 as no longer sold, distinctly from call-up-only exclusions', () => {
        const { excluded } = planResolver.resolveRankable(
            { firm: FirmId.FundedNext },
            false,
        );
        const [fnl003] = excluded;
        if (!fnl003) throw new Error('FNL:003 not excluded');
        expect(describeExcludedPlans(excluded)).toBe(
            `excluded 1 no longer sold plan(s): ${fnl003.label} (pass --include-callup to rank them)`,
        );
    });

    it('groups a mixed exclusion (call-up-only and no-longer-sold) into one line', () => {
        const { excluded } = planResolver.resolveRankable({}, false);
        const variants = excluded.map((plan) => planVariant(plan));
        expect(variants).toContain(TopStepVariant.ProAccount);
        expect(variants).toContain(FundedNextVariant.Fnl003);
        const description = describeExcludedPlans(excluded);
        expect(description).toContain('call-up only plan(s):');
        expect(description).toContain('no longer sold plan(s):');
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

const SCREEN_TIME = { accountsPerSession: 3, sessionHoursPerDay: 2 } as const;

function perScreenHour(monthlyNet: number): number {
    return (monthlyNet * 3) / (TRADING_DAYS_PER_MONTH * 2);
}

describe('compare firm, P(no payout) and $/screen hour columns (PT-54, F-V8, F-V25)', () => {
    it('leads each row with the firm, then the plan label', () => {
        const plan = rapidEodPlan();
        const cells = compareRow(plan, BASE);
        expect(cells[0]).toBe(plan.id.firm);
        expect(cells[1]).toBe(plan.label);
        expect(cells.slice(2)).toStrictEqual(compareRowCells(BASE));
    });

    it('sizes the firm column to the longest firm id', () => {
        const firm = compareColumns(1)[0];
        expect(firm?.align).toBe('left');
        for (const id of Object.values(FirmId)) {
            expect(firm?.width).toBeGreaterThanOrEqual(id.length);
        }
    });

    it('prints P(no payout) as the share of funded trials with zero payouts', () => {
        const cells = compareRowCells(
            row('x', {
                fundedPayoutCountDistribution: [
                    0.35, 0.4, 0.25, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
            }).out,
        );
        expect(cells[10]).toBe(formatPercent(0.35));
    });

    it("prints 'n/a' P(no payout) when no trial reached funded", () => {
        const cells = compareRowCells(
            row('never', { ...NEVER_PASSES, fundedPayoutCountDistribution: [] })
                .out,
        );
        expect(cells[10]).toBe('n/a');
    });

    it('adds a $/screen hour column only with the screen time', () => {
        expect(
            compareColumns(1, SCREEN_TIME).map((column) => column.label),
        ).toStrictEqual([
            ...compareColumns(1).map((column) => column.label),
            '$/screen hour',
        ]);
        const cells = compareRowCells(
            row('x', { expectedMonthlyNet: 2100 }).out,
            SCREEN_TIME,
        );
        expect(cells).toHaveLength(12);
        expect(cells[11]).toBe(formatCurrency(perScreenHour(2100)));
        expect(cells[11]).toBe('$150');
    });

    it('explains the new columns, with the trading days constant and the copy group rule', () => {
        expect(describeEconomicsColumns(null)).toStrictEqual([
            'P(no payout) = share of trials that reached funded and took no payout within the funded horizon',
        ]);
        expect(describeEconomicsColumns(SCREEN_TIME)).toStrictEqual([
            'P(no payout) = share of trials that reached funded and took no payout within the funded horizon',
            `$/screen hour = monthly net x 3 accounts per session / (${TRADING_DAYS_PER_MONTH} trading days x 2 h per day); a copy group counts as one account`,
        ]);
    });
});

describe('compare --sort hour (PT-54, F-V25)', () => {
    it('ranks by $/screen hour, highest first', () => {
        const rows = [
            row('100', { expectedMonthlyNet: 100 }),
            row('300', { expectedMonthlyNet: 300 }),
            row('200', { expectedMonthlyNet: 200 }),
        ];
        const ranked = rankRows(rows, CompareSortKey.Hour).rows;
        expect(labels(ranked)).toStrictEqual(['300', '200', '100']);
        const hourly = ranked.map((entry) =>
            perScreenHour(entry.out.expectedMonthlyNet),
        );
        expect(hourly).toStrictEqual(hourly.toSorted((a, b) => b - a));
    });

    it('keeps the existing sort keys unchanged', () => {
        expect(CompareSortKey.Net).toBe('net');
        expect(CompareSortKey.Cost).toBe('cost');
        expect(CompareSortKey.Spend).toBe('spend');
        expect(CompareSortKey.Pass).toBe('pass');
        expect(CompareSortKey.Days).toBe('days');
    });

    it('needs the screen time, naming both flags', () => {
        expect(() =>
            requireScreenTimeForSort(CompareSortKey.Hour, null),
        ).toThrow(
            /--sort hour needs --hours-per-day and --accounts-per-session/,
        );
        expect(() =>
            requireScreenTimeForSort(CompareSortKey.Hour, SCREEN_TIME),
        ).not.toThrow();
        expect(() =>
            requireScreenTimeForSort(CompareSortKey.Net, null),
        ).not.toThrow();
    });

    it('names hour in the --sort help and accepts both screen-time flags', async () => {
        const arguments_ = await compareArguments();
        expect(arguments_.sort?.description).toContain(
            'hour (monthly net per screen hour',
        );
        expect(await acceptedFlags(compare)).toEqual(
            expect.arrayContaining(['accounts-per-session', 'hours-per-day']),
        );
    });
});

interface CapturedCompare {
    exitCode: number | string | undefined;
    output: string;
}

async function capturedCompare(argv: string[]): Promise<CapturedCompare> {
    const arguments_ = await compareArguments();
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
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    let exitCode: CapturedCompare['exitCode'];
    try {
        await compare.run?.({
            args: parseArgs(argv, arguments_) as never,
            cmd: compare,
            rawArgs: argv,
        });
        exitCode = process.exitCode;
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = previousExitCode;
    }
    return { exitCode, output: written.join('') };
}

async function capturedCompareRun(argv: string[]): Promise<string> {
    const captured = await capturedCompare(argv);
    return captured.output;
}

const SMALL_COMPARE = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--trials',
    '20',
    '--eval-days',
    '10',
    '--funded-days',
    '10',
];

describe('prop compare run (PT-54)', () => {
    it('prints the firm column, P(no payout) and $/screen hour, sorted by hour', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--hours-per-day',
            '2',
            '--accounts-per-session',
            '3',
            '--sort',
            'hour',
        ]);
        expect(stdout).toContain('firm');
        expect(stdout).toContain('P(no payout)');
        expect(stdout).toContain('$/screen hour');
        expect(stdout).toContain('sorted by hour');
        expect(stdout).not.toMatch(
            /\b(?:implausible|no|strong|typical) edge\b/,
        );
    });

    it('flags an implausible edge', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--winrate',
            '0.7',
            '--rr',
            '1',
        ]);
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 1,
                tradesPerDay: 4,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
    });

    it('prints the Kelly growth and the pace at the run trades per day (F-V22, PT-94b)', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--winrate',
            '0.7',
            '--rr',
            '1',
            '--tpd',
            '4',
        ]);
        expect(stdout).toContain('Full Kelly would grow a bankroll');
        expect(stdout).toContain('at 4 trades per day over 21 trading days');
    });

    it('prints the funded note at the funded trades per day (F-V22, PT-94b)', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--funded-rr',
            '3',
            '--funded-tpd',
            '2',
        ]);
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 3,
                tradesPerDay: 2,
                winrate: fraction(0.4),
            }) ?? 'missing note',
        );
        expect(stdout).toContain('at 2 trades per day over 21 trading days');
    });
});

describe('P(no payout) is one definition, shared by the web tables (PT-61e, F-V25)', () => {
    it('prints exactly noPayoutProbabilityFromDistribution for the run, not a re-derived value', () => {
        const distribution = [0.12, 0.5, 0.38];
        const cells = compareRowCells(
            row('x', { fundedPayoutCountDistribution: distribution }).out,
        );
        const expected = noPayoutProbabilityFromDistribution(distribution);
        expect(expected).not.toBeNull();
        expect(cells[10]).toBe(formatPercent(expected ?? 0));
    });

    it('calls the shared engine helper instead of re-deriving the value from the distribution array', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, 'src/cli/commands/prop/compare/command.ts'),
            'utf8',
        );
        expect(source).toContain('noPayoutProbabilityFromDistribution');
        expect(source).not.toMatch(/distribution\[0\]/);
    });
});

function conflictingRanking(): void {
    resolveCompareRanking({ objective: 'cycle', sort: 'net' });
}

describe('compare objectives map onto the sort keys (PT-63, F-V15, A-20)', () => {
    it('defaults to MonthlyNet ranked by net (Q1)', () => {
        expect(resolveCompareRanking({})).toStrictEqual({
            objective: SizingObjective.MonthlyNet,
            sort: CompareSortKey.Net,
        });
    });

    it('maps --objective monthly to Net and cycle to the new Cycle key', () => {
        expect(resolveCompareRanking({ objective: 'monthly' })).toStrictEqual({
            objective: SizingObjective.MonthlyNet,
            sort: CompareSortKey.Net,
        });
        expect(resolveCompareRanking({ objective: 'cycle' })).toStrictEqual({
            objective: SizingObjective.CycleCash,
            sort: CompareSortKey.Cycle,
        });
    });

    it('maps --objective ruin-first to the RuinFirst key and needs a bankroll', () => {
        expect(
            resolveCompareRanking({
                bankroll: '5000',
                objective: 'ruin-first',
            }),
        ).toStrictEqual({
            objective: SizingObjective.RuinFirst,
            sort: CompareSortKey.RuinFirst,
        });
        expect(() =>
            resolveCompareRanking({ objective: 'ruin-first' }),
        ).toThrow(RuinFirstNeedsBankroll);
    });

    it('reads --sort cycle, --sort ruin-first and --sort net as their objectives', () => {
        expect(resolveCompareRanking({ sort: 'cycle' }).objective).toBe(
            SizingObjective.CycleCash,
        );
        expect(
            resolveCompareRanking({ bankroll: '5000', sort: 'ruin-first' })
                .objective,
        ).toBe(SizingObjective.RuinFirst);
        expect(() => resolveCompareRanking({ sort: 'ruin-first' })).toThrow(
            RuinFirstNeedsBankroll,
        );
        expect(resolveCompareRanking({ sort: 'net' })).toStrictEqual({
            objective: SizingObjective.MonthlyNet,
            sort: CompareSortKey.Net,
        });
    });

    it('names no objective for the sort keys that are not an objective ranking', () => {
        for (const key of ['cost', 'days', 'hour', 'pass', 'spend']) {
            expect(resolveCompareRanking({ sort: key })).toStrictEqual({
                objective: null,
                sort: key,
            });
        }
    });

    it('refuses --sort together with --objective, as a typed error', () => {
        expect(conflictingRanking).toThrow(SortObjectiveConflict);
        expect(conflictingRanking).toThrow(/mutually exclusive/);
        expect(() =>
            resolveCompareRanking({ objective: 'monthly', sort: 'net' }),
        ).toThrow(SortObjectiveConflict);
    });
});

describe('compare --sort cycle (PT-63)', () => {
    it('ranks by expected net of the whole cycle, highest first', () => {
        const rows = [
            row('100', { expectedMonthlyNet: 900, expectedNet: 100 }),
            row('300', { expectedMonthlyNet: 100, expectedNet: 300 }),
            row('200', { expectedMonthlyNet: 500, expectedNet: 200 }),
        ];
        expect(labels(rankRows(rows, CompareSortKey.Cycle).rows)).toStrictEqual(
            ['300', '200', '100'],
        );
    });
});

const RUIN_BANKROLL = dollars(5000);

const pricingOf = (batchLossProbability: null | number): BatchLossPricing =>
    batchLossProbability === null
        ? { status: BatchLossStatus.Unpriced }
        : { probability: batchLossProbability, status: BatchLossStatus.Priced };

const ruinRow = (
    label: string,
    expectedNetPerAttempt: number,
    batchLossProbability: null | number,
    expectedMonthlyNet: number,
) => ({
    batchLoss: pricingOf(batchLossProbability),
    label,
    out: { ...BASE, expectedMonthlyNet, expectedNetPerAttempt },
});

const rankedRuinLabels = (rows: readonly ReturnType<typeof ruinRow>[]) =>
    rankRows(rows, CompareSortKey.RuinFirst, null, RUIN_BANKROLL).rows.map(
        (entry) => entry.label,
    );

describe('compare --sort ruin-first (PT-63, T-4)', () => {
    it('ranks plans with EV per attempt above zero by lower P(batch net < 0), then monthly net', () => {
        const rows = [
            ruinRow('riskier', 50, 0.4, 900),
            ruinRow('safer', 10, 0.1, 100),
            ruinRow('tie low net', 20, 0.25, 200),
            ruinRow('tie high net', 20, 0.25, 500),
        ];
        expect(rankedRuinLabels(rows)).toStrictEqual([
            'safer',
            'tie high net',
            'tie low net',
            'riskier',
        ]);
    });

    it('lists non-positive EV plans last, even with a lower loss probability', () => {
        const rows = [
            ruinRow('negative', -5, 0.01, 300),
            ruinRow('positive', 10, 0.9, 100),
            ruinRow('zero', 0, 0.02, 800),
        ];
        expect(rankedRuinLabels(rows)).toStrictEqual([
            'positive',
            'zero',
            'negative',
        ]);
    });

    it('puts a positive plan with an unknown loss probability after the known ones', () => {
        const rows = [
            ruinRow('unknown', 10, null, 900),
            ruinRow('known', 10, 0.8, 100),
        ];
        expect(rankedRuinLabels(rows)).toStrictEqual(['known', 'unknown']);
    });

    it('explains why the non-positive plans were listed last', () => {
        const rows = [
            ruinRow('negative', -5, 0.01, 900),
            ruinRow('positive', 10, 0.9, 100),
        ];
        const lines = nonPositiveEvPlanLines(
            rows.map((entry) => ({
                out: entry.out,
                plan: { label: entry.label },
            })),
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('negative');
        expect(lines[0]).not.toContain('positive,');
        expect(lines[0]).toContain('EV per attempt');
        expect(lines[0]).not.toContain('\u{2014}');
        expect(
            nonPositiveEvPlanLines([
                { out: rows[1]?.out ?? BASE, plan: { label: 'positive' } },
            ]),
        ).toStrictEqual([]);
    });
});

describe('compare bankroll columns (PT-63, F-V15)', () => {
    it('adds P(no payout) and P(batch net < 0) columns at the bankroll only when one is set', () => {
        const without = compareColumns(1).map((column) => column.label);
        const withBankroll = compareColumns(1, null, true).map(
            (column) => column.label,
        );
        expect(withBankroll).toStrictEqual([
            ...without,
            'P(no payout, bankroll)',
            'P(batch < 0)',
        ]);
    });

    it('prints the two figures as the last cells, n/a when unknown', () => {
        const cells = compareRowCells(BASE, null, {
            lossProbability: 0.2,
            noPayoutProbability: null,
        });
        expect(cells.slice(-2)).toStrictEqual(['n/a', formatPercent(0.2)]);
    });

    it('prices them at the attempts the bankroll affords, on the plan seed', () => {
        const figures = bankrollRiskFigures(BASE, dollars(5000), 1);
        const attempts = attemptsAffordable(
            dollars(5000),
            dollars(BASE.costPerAttempt),
        ).value;
        expect(attempts).not.toBeNull();
        if (attempts === null) throw new Error('no attempts');
        expect(figures.lossProbability).toBe(
            cohortOutcome(BASE.netValues, attempts, LOSS_RISK_DRAWS, 1).value
                ?.lossProbability.value ?? null,
        );
        expect(figures.noPayoutProbability).toBe(
            noPayoutProbability(fraction(BASE.attemptPaysProbability), attempts)
                .value ?? null,
        );
    });

    it('has no figures when the bankroll affords no attempt', () => {
        expect(bankrollRiskFigures(BASE, dollars(1), 1)).toStrictEqual({
            lossProbability: null,
            noPayoutProbability: null,
        });
    });

    it('prints the figures the ranking priced, equal to the library figures while a batch is fully simulated', () => {
        const bankroll = dollars(5000);
        const attempts = attemptsAffordable(
            bankroll,
            dollars(BASE.costPerAttempt),
        ).value;
        expect(attempts).toBeGreaterThanOrEqual(1);
        expect(attempts).toBeLessThanOrEqual(200);
        expect(
            bankrollFiguresOf(
                BASE,
                bankroll,
                priceBatchLoss(BASE, bankroll, 1),
            ),
        ).toStrictEqual(bankrollRiskFigures(BASE, bankroll, 1));
    });

    it('prints no figures when the bankroll affords no attempt, and no loss figure when the batch is too large to price', () => {
        const small = dollars(1);
        expect(
            bankrollFiguresOf(BASE, small, priceBatchLoss(BASE, small, 1)),
        ).toStrictEqual({ lossProbability: null, noPayoutProbability: null });
        const cheap = { ...BASE, costPerAttempt: 1 };
        const huge = dollars(50_000_000);
        const figures = bankrollFiguresOf(
            cheap,
            huge,
            priceBatchLoss(cheap, huge, 1),
        );
        expect(figures.lossProbability).toBeNull();
        expect(figures.noPayoutProbability).not.toBeNull();
    });
});

describe('compare heading names the objective only when it drives the ranking (VD-6)', () => {
    it('says there is no objective for a sort key that is not an objective ranking', () => {
        for (const sort of [
            CompareSortKey.Cost,
            CompareSortKey.Days,
            CompareSortKey.Hour,
            CompareSortKey.Pass,
            CompareSortKey.Spend,
        ]) {
            const line = compareRankingHeadingLine({ objective: null, sort });
            expect(line).toContain('objective: none');
            expect(line).toContain(`sorted by ${sort}`);
            expect(line).toContain('not an objective ranking');
            expect(line).not.toContain('monthly net');
            expect(line).not.toContain('\u{2014}');
        }
    });

    it('names the objective for an objective ranking', () => {
        const line = compareRankingHeadingLine({
            objective: SizingObjective.CycleCash,
            sort: CompareSortKey.Cycle,
        });
        expect(line).toContain('objective: cycle cash');
    });

    it('does not claim monthly net in the heading of a run sorted by pass', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--sort',
            'pass',
        ]);
        expect(stdout).toContain('sorted by pass');
        expect(stdout).toContain('objective: none');
        expect(stdout).not.toContain('objective: monthly net');
    });
});

describe('compare has one RuinFirst ordering, shared with the web tables (PT-83b)', () => {
    it('is not duplicated: the command has no positive EV test, no RuinFirst comparator and no fallback note of its own', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, 'src/cli/commands/prop/compare/command.ts'),
            'utf8',
        );
        expect(source).not.toContain('expectedNetPerAttempt > 0');
        expect(source).not.toContain('function compareRuinFirst');
        expect(source).not.toContain('function ruinFirstWarning');
        expect(source).not.toContain('enum BatchLossStatus');
        for (const note of Object.values(RUIN_FIRST_FALLBACK_NOTE)) {
            expect(source).not.toContain(note);
        }
    });
});

const rankedNote = (
    rows: readonly ReturnType<typeof ruinRow>[],
    bankroll: Dollars | null = RUIN_BANKROLL,
) => rankRows(rows, CompareSortKey.RuinFirst, null, bankroll);

describe('compare ruin-first never reads as a lowest-ruin pick without a ruin figure', () => {
    it('names the no-attempt fallback when the bankroll affords no attempt of any plan with EV per attempt above zero', () => {
        const ranked = rankedNote([
            {
                ...ruinRow('a', 10, null, 900),
                batchLoss: { status: BatchLossStatus.NoAttempt },
            },
            {
                ...ruinRow('b', 20, null, 100),
                batchLoss: { status: BatchLossStatus.NoAttempt },
            },
        ]);
        expect(ranked.fallback).toBe(RuinFirstFallback.NoAttempt);
        expect(ranked.note).toBe(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(ranked.note).toContain('bankroll affords no attempt');
        expect(ranked.note).toContain('fell back to monthly net');
        expect(labels(ranked.rows)).toStrictEqual(['a', 'b']);
    });

    it('says nothing when a positive EV plan has a ruin figure', () => {
        const ranked = rankedNote([
            ruinRow('a', 10, 0.3, 900),
            ruinRow('b', 20, null, 100),
        ]);
        expect(ranked.fallback).toBeNull();
        expect(ranked.note).toBeNull();
    });

    it('keeps the no positive EV message when no plan has EV per attempt above zero', () => {
        const ranked = rankedNote([ruinRow('a', -1, null, 900)]);
        expect(ranked.fallback).toBe(RuinFirstFallback.NoPositiveEv);
        expect(ranked.note).toBe(RUIN_FIRST_NO_POSITIVE_EV_NOTE);
    });

    it('returns no rows for no rows', () => {
        expect(rankedNote([]).rows).toStrictEqual([]);
    });

    it('says the risk could not be priced, not that no attempt is affordable, when attempts are affordable but no loss figure exists', () => {
        const ranked = rankedNote([ruinRow('a', 10, null, 900)]);
        expect(ranked.fallback).toBe(RuinFirstFallback.Unpriced);
        expect(ranked.note).toBe(RUIN_FIRST_UNPRICED_NOTE);
        expect(ranked.note).toContain('could not price');
        expect(ranked.note).not.toContain('affords no attempt');
    });

    it('needs a bankroll to rank ruin first at all', () => {
        const ranked = rankedNote([ruinRow('a', 10, 0.1, 900)], null);
        expect(ranked.fallback).toBe(RuinFirstFallback.NeedsBankroll);
        expect(ranked.note).toBe(RUIN_FIRST_NEEDS_BANKROLL_NOTE);
    });

    it('prints the could-not-price warning for a bankroll far above every cost per attempt', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--objective',
            'ruin-first',
            '--bankroll',
            '5000000000',
            '--winrate',
            '0.6',
        ]);
        expect(stdout).toContain('could not price');
        expect(stdout).not.toContain('bankroll affords no attempt');
    });

    it('prints the warning and no best line for a bankroll below every cost per attempt', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--objective',
            'ruin-first',
            '--bankroll',
            '1',
            '--winrate',
            '0.6',
        ]);
        expect(stdout).toContain('bankroll affords no attempt');
        expect(stdout).not.toContain('best by ruin-first');
    });
});

const simulatedSplitRow = (
    overrides: Partial<
        Extract<CopySplitRow, { kind: CopySplitRowKind.Simulated }>
    > = {},
): CopySplitRow => ({
    cycleNet: { standardError: 10, value: 100 },
    daysToPassP50: 12,
    kind: CopySplitRowKind.Simulated,
    netPerFeeDollar: 1.5,
    passRate: 0.5,
    placement: { contracts: 2, placedRiskPerAccount: 800 },
    riskPerAccount: 1000,
    splitCount: 2,
    totalFees: 300,
    totalMonthlyNet: { standardError: 20, value: 400 },
    trials: 50,
    ...overrides,
});

describe('split table rows (PT-63, F-V24)', () => {
    it('labels the contracts as the eval placement and adds placed risk columns', () => {
        const labels = SPLIT_COLUMNS.map((column) => column.label);
        expect(labels).toContain('eval contracts');
        expect(labels).toContain('placed/account');
        expect(labels).toContain('placed group');
        expect(labels).toContain('vs best');
    });

    it('prints the requested risk, the contracts, the placed risk per account and for the group', () => {
        const cells = splitTableRow(simulatedSplitRow(), false);
        expect(cells).toHaveLength(SPLIT_COLUMNS.length);
        expect(cells.slice(0, 5)).toStrictEqual([
            '2',
            '$1,000.00',
            '2',
            '$800.00',
            '$1,600.00',
        ]);
    });

    it('marks a row within the noise of the best row', () => {
        expect(splitTableRow(simulatedSplitRow(), true).at(-1)).toBe(
            'within noise',
        );
        expect(splitTableRow(simulatedSplitRow(), false).at(-1)).toBe('');
    });

    it('prints n/a for the placement without an instrument and stop', () => {
        const cells = splitTableRow(
            simulatedSplitRow({ placement: null }),
            false,
        );
        expect(cells.slice(2, 5)).toStrictEqual(['n/a', 'n/a', 'n/a']);
    });

    it('prints a refused row with its reason', () => {
        const cells = splitTableRow(
            {
                kind: CopySplitRowKind.Refused,
                reason: 'below one contract',
                riskPerAccount: 200,
                splitCount: 10,
            },
            false,
        );
        expect(cells).toStrictEqual([
            '10',
            '$200.00',
            'refused',
            'below one contract',
        ]);
    });
});

describe('prop compare names the objective and runs split vs concentrate (PT-63, F-V15, F-V24)', () => {
    it('prints the active objective in the header, MonthlyNet by default', async () => {
        const stdout = await capturedCompareRun(SMALL_COMPARE);
        expect(stdout).toContain('objective: monthly net');
        expect(stdout).toContain('sorted by net');
    });

    it('ranks by cycle under --objective cycle and names it', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--objective',
            'cycle',
        ]);
        expect(stdout).toContain('objective: cycle cash');
        expect(stdout).toContain('sorted by cycle');
    });

    it('fails with the typed conflict when --sort and --objective are both given', async () => {
        const { exitCode, output } = await capturedCompare([
            ...SMALL_COMPARE,
            '--sort',
            'net',
            '--objective',
            'cycle',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain('mutually exclusive');
    });

    it('prints the bankroll columns with --bankroll', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--bankroll',
            '5000',
        ]);
        expect(stdout).toContain('P(batch < 0)');
        expect(stdout).toContain('P(no payout, bankroll)');
    });

    it('ranks by RuinFirst with a bankroll and names it', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--objective',
            'ruin-first',
            '--bankroll',
            '5000',
        ]);
        expect(stdout).toContain('objective: ruin first');
        expect(stdout).toContain('sorted by ruin-first');
    });

    it('says no plan is ranked instead of naming a best one when none has EV per attempt above zero', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--objective',
            'ruin-first',
            '--bankroll',
            '3000',
            '--winrate',
            '0.3',
        ]);
        expect(stdout).toContain(RUIN_FIRST_NO_POSITIVE_EV_NOTE);
        expect(stdout).not.toContain('best by ruin-first');
    });

    it('prints one row per split on the same seed for --total-risk and --splits', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--total-risk',
            '2000',
            '--splits',
            '1,2,10',
        ]);
        expect(stdout).toContain('objective: monthly net');
        expect(stdout).toContain('total risk $2,000');
        expect(stdout).toContain('seed 42');
        const lines = stdout
            .split('\n')
            .filter((line) => /^•\s+(?:1|2|10)\s+\$/.test(line));
        expect(lines).toHaveLength(3);
    });

    it('prints a refused row for a split below one contract at the stop', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--instrument',
            'NQ',
            '--stop-points',
            '20',
            '--total-risk',
            '2000',
            '--splits',
            '1,10',
        ]);
        expect(stdout).toContain('refused');
        expect(stdout).toContain('below one NQ contract');
    });

    it('prints the funded risk used, the win rate, the correlation and the assumptions under the split table', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--total-risk',
            '2000',
            '--splits',
            '1,2',
        ]);
        expect(stdout).toContain('win rate 40% at 1:2');
        expect(stdout).toContain('10 funded days');
        expect(stdout).toContain('funded risk $250 per account');
        expect(stdout).toContain('Hard Rule 5');
        expect(stdout).toContain('payout request');
        expect(stdout).toContain('rebuy lag is assumed zero');
        expect(stdout).toContain(COPY_SPLIT_CORRELATION_NOTE);
    });

    it('divides an after-target day cap in the eval and runs the funded phase on the default rulebook funded stop', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--stop',
            'after-target:1000',
            '--total-risk',
            '2000',
            '--splits',
            '1,10',
        ]);
        expect(stdout).toContain(
            'after-target day cap $1,000 is a group total, so each account gets its share of it together with the risk in the eval',
        );
        expect(stdout).toContain(
            'the funded phase uses the default rulebook funded stop (none) per account, not the divided cap',
        );
    });

    it('prints the explicit funded risk per account, not divided by the split', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--funded-risk',
            '300',
            '--total-risk',
            '2000',
            '--splits',
            '1,2',
        ]);
        expect(stdout).toContain('funded risk $300 per account as given');
    });

    it('shows the placed risk per account and for the group at the eval contract limit', async () => {
        const stdout = await capturedCompareRun([
            ...SMALL_COMPARE,
            '--instrument',
            'NQ',
            '--stop-points',
            '20',
            '--funded-risk',
            '800',
            '--total-risk',
            '2000',
            '--splits',
            '1,2',
        ]);
        expect(stdout).toContain('placed/account');
        expect(stdout).toContain('placed group');
        expect(stdout).toContain('$1,200.00');
        expect(stdout).toContain('$1,600.00');
    });

    it('needs --total-risk and --splits together', async () => {
        const { exitCode, output } = await capturedCompare([
            ...SMALL_COMPARE,
            '--total-risk',
            '2000',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain('--total-risk and --splits go together');
    });

    it('declares the new flags and names only flags it accepts', async () => {
        expect(await acceptedFlags(compare)).toEqual(
            expect.arrayContaining([
                'bankroll',
                'objective',
                'splits',
                'total-risk',
            ]),
        );
        expect(await flagsNamedButNotAccepted(compare)).toStrictEqual([]);
    });
});

function columnLabels(copies: number): string[] {
    return compareColumns(copies).map((column) => column.label);
}

function printedPlanRows(output: string): string[] {
    return output
        .split('\n')
        .filter((line) => line.includes('$50K') && line.includes('mffu '));
}

describe('compare prints cycle net and ROI for every row (PT-83, F-V15)', () => {
    it('adds cycle net and ROI right after monthly, with the copy group total on cycle net', () => {
        expect(columnLabels(1).slice(8, 11)).toStrictEqual([
            'monthly',
            'cycle net',
            'ROI',
        ]);
        expect(columnLabels(3).slice(8, 11)).toStrictEqual([
            'monthly x3',
            'cycle net x3',
            'ROI',
        ]);
    });

    it('prints the cycle net the --sort cycle key ranks by, and the ROI on cost', () => {
        const cells = compareRowCells(
            row('x', {
                expectedNet: 1234,
                roiOnCost: { ...BASE.roiOnCost, value: 0.5 },
            }).out,
        );
        expect(cells[7]).toBe(formatCurrency(1234));
        expect(cells[8]).toBe(formatOptionalPercent(0.5));
    });

    it("prints 'n/a' ROI when there is no spend to return on", () => {
        const cells = compareRowCells(
            row('free', { roiOnCost: { ...BASE.roiOnCost, value: null } }).out,
        );
        expect(cells[8]).toBe('n/a');
    });

    it('--sort cycle orders the rows by the cycle net they print', () => {
        const rows = [
            row('low', { expectedMonthlyNet: 900, expectedNet: 100 }),
            row('high', { expectedMonthlyNet: 100, expectedNet: 900 }),
            row('mid', { expectedMonthlyNet: 500, expectedNet: 500 }),
        ];
        const ranked = rankRows(rows, CompareSortKey.Cycle).rows;
        expect(labels(ranked)).toStrictEqual(['high', 'mid', 'low']);
        expect(
            ranked.map((entry) => compareRowCells(entry.out)[7]),
        ).toStrictEqual([
            formatCurrency(900),
            formatCurrency(500),
            formatCurrency(100),
        ]);
    });

    it('prints both columns in a real run', async () => {
        const stdout = await capturedCompareRun(SMALL_COMPARE);
        expect(stdout).toContain('cycle net');
        expect(stdout).toContain('ROI');
    });
});

describe('compare --sort hour ranks by the printed $/screen hour with its own comparator (PT-83, F-V25)', () => {
    it('lists a row without a value last, wherever it started', () => {
        const rows = [
            row('nan', { expectedMonthlyNet: NaN }),
            row('100', { expectedMonthlyNet: 100 }),
            row('300', { expectedMonthlyNet: 300 }),
            row('200', { expectedMonthlyNet: 200 }),
        ];
        const ranked = rankRows(rows, CompareSortKey.Hour, SCREEN_TIME).rows;
        expect(labels(ranked)).toStrictEqual(['300', '200', '100', 'nan']);
        const printed = ranked.map(
            (entry) => compareRowCells(entry.out, SCREEN_TIME).at(-1) ?? '',
        );
        expect(printed.at(-1)).toBe('n/a');
        expect(printed.slice(0, -1)).toStrictEqual([
            formatCurrency(perScreenHour(300)),
            formatCurrency(perScreenHour(200)),
            formatCurrency(perScreenHour(100)),
        ]);
    });

    it('keeps two rows without a value in their input order, after every valued row', () => {
        const rows = [
            row('nan-a', { expectedMonthlyNet: NaN }),
            row('50', { expectedMonthlyNet: 50 }),
            row('nan-b', { expectedMonthlyNet: NaN }),
        ];
        expect(
            labels(rankRows(rows, CompareSortKey.Hour, SCREEN_TIME).rows),
        ).toStrictEqual(['50', 'nan-a', 'nan-b']);
    });

    it('compareOutputs agrees with rankRows on the hour key', () => {
        const valued = row('v', { expectedMonthlyNet: 10 }).out;
        const missing = row('m', { expectedMonthlyNet: NaN }).out;
        expect(
            compareOutputs(valued, missing, CompareSortKey.Hour, SCREEN_TIME),
        ).toBeLessThan(0);
        expect(
            compareOutputs(missing, valued, CompareSortKey.Hour, SCREEN_TIME),
        ).toBeGreaterThan(0);
    });

    it('does not share the net comparator branch', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, 'src/cli/commands/prop/compare/command.ts'),
            'utf8',
        );
        expect(source).not.toMatch(
            /case CompareSortKey\.Hour:\s*case CompareSortKey\.Net:/,
        );
    });
});

describe('compare --top N keeps the best N plans for your hours (PT-83, F-V25)', () => {
    it('reads nothing when --top is absent', () => {
        expect(readTopLimit({}, null)).toBeNull();
        expect(readTopLimit({}, SCREEN_TIME)).toBeNull();
    });

    it('reads a positive whole number with the screen time set', () => {
        expect(readTopLimit({ top: '2' }, SCREEN_TIME)).toBe(2);
    });

    it.each(['0', '-1', '1.5', 'abc', ''])(
        'rejects --top %j with a typed message',
        (value) => {
            expect(() => readTopLimit({ top: value }, SCREEN_TIME)).toThrow(
                /--top must be a whole number >= 1/,
            );
        },
    );

    it('needs both screen-time flags, naming them', () => {
        expect(() => readTopLimit({ top: '3' }, null)).toThrow(
            /--top needs --hours-per-day and --accounts-per-session/,
        );
    });

    it('prints exactly N rows in a real run, in ranking order, and says how many were hidden', async () => {
        const hours = ['--hours-per-day', '2', '--accounts-per-session', '3'];
        const full = await capturedCompareRun([
            ...SMALL_COMPARE.slice(0, 2),
            ...SMALL_COMPARE.slice(4),
            ...hours,
        ]);
        const top = await capturedCompareRun([
            ...SMALL_COMPARE.slice(0, 2),
            ...SMALL_COMPARE.slice(4),
            ...hours,
            '--top',
            '2',
        ]);
        const fullRows = printedPlanRows(full);
        expect(fullRows.length).toBeGreaterThan(2);
        expect(printedPlanRows(top)).toStrictEqual(fullRows.slice(0, 2));
        expect(top).toContain(`top 2 of ${fullRows.length} plan(s)`);
    });

    it('errors without the hours flags', async () => {
        const { exitCode, output } = await capturedCompare([
            ...SMALL_COMPARE,
            '--top',
            '2',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain(
            '--top needs --hours-per-day and --accounts-per-session',
        );
    });

    it('errors on a bad value', async () => {
        const { exitCode, output } = await capturedCompare([
            ...SMALL_COMPARE,
            '--hours-per-day',
            '2',
            '--accounts-per-session',
            '3',
            '--top',
            '0',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain('--top must be a whole number >= 1');
    });

    it('is refused with --splits, which ranks splits and not plans', async () => {
        const { exitCode, output } = await capturedCompare([
            ...SMALL_COMPARE,
            '--hours-per-day',
            '2',
            '--accounts-per-session',
            '3',
            '--top',
            '1',
            '--total-risk',
            '2000',
            '--splits',
            '1,2',
        ]);
        expect(exitCode).toBe(1);
        expect(output).toContain('--top ranks plans');
    });

    it('is declared, described and accepted', async () => {
        const arguments_ = await compareArguments();
        expect(arguments_.top?.description).toContain('best N plans');
        expect(await acceptedFlags(compare)).toEqual(
            expect.arrayContaining(['top']),
        );
        expect(await flagsNamedButNotAccepted(compare)).toStrictEqual([]);
    });
});
