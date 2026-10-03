import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
    type BatchLossPricing,
    BatchLossStatus,
    ladderObjectiveStar,
    ladderRungPlacements,
    OBJECTIVE_OPTIONS,
    priceBatchLoss,
    rankComparison,
    riskRowFigures,
    riskTableObjective,
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_NO_POSITIVE_EV_NOTE,
    RUIN_FIRST_RISK_TABLE_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
    starredRows,
} from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import { ladderRankingsFor } from '~/cli/commands/prop/ladder/command';
import { dpObjectiveSolverConfig } from '~/cli/commands/prop/optimize/dp/command';
import { resolveFundedSort } from '~/cli/commands/prop/optimize/funded/command';
import {
    ObjectiveFlag,
    ObjectiveNotApplicable,
    readObjective,
} from '~/cli/commands/prop/shared';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    fraction,
    InstrumentSymbol,
    type LadderScore,
    type LadderSearchResult,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    resolvePositionSizing,
    serializePlanId,
    type SimOutputs,
    simulate,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    SizingObjective,
    SpeedObjective,
} from '~/lib/prop-calculator/advisor';
import {
    objectiveApplicability,
    RankingSurface,
} from '~/lib/prop-calculator/advisor/actions';
import {
    type CopySplitRow,
    CopySplitRowKind,
    rankCopySplitRows,
} from '~/lib/prop-calculator/advisor/policy';
import {
    attemptsAffordable,
    bankrollRiskFigures,
    cohortOutcome,
    LOSS_RISK_DRAWS,
    noPayoutProbability,
} from '~/lib/prop-calculator/economics';

const ADVISOR_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
);

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

const ROOT = process.cwd();

function accountState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
        ...overrides,
    };
}

function advice() {
    const evalAdvisor = new EvalSizingAdvisor({
        account: reconstructed(TradingPhase.Eval, {
            balance: 50_800,
            qualifyingDays: 0,
            threshold: 48_000,
            tradingDays: 3,
        }),
        maxEvalDays: 60,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
    const fundedAdvisor = new FundedSizingAdvisor({
        account: reconstructed(TradingPhase.Funded),
        fundedHorizonDays: 60,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
    return {
        eval: {
            assembled: evalAdvisor.assemble([]),
            caps: evalAdvisor.caps(),
            documented: evalAdvisor.documented(),
        },
        funded: {
            assembled: fundedAdvisor.assemble([]),
            caps: fundedAdvisor.caps(),
            documented: fundedAdvisor.documented(),
        },
    };
}

function isNamingRuinFirst(file: string, ignoredLine?: RegExp): boolean {
    return readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !ignoredLine?.test(line))
        .some((line) => /SizingObjective\.RuinFirst|ruin-first/.test(line));
}

function ladderScore(
    ladder: number[],
    days: number,
    cost: number,
    passRate: number,
): LadderScore {
    return {
        costPerFunded: cost,
        costPerFundedStandardError: 1,
        expectedDaysToFunded: days,
        expectedDaysToFundedStandardError: 1,
        ladder,
        meanDaysOnFail: 5,
        meanDaysOnPass: 9,
        passRate,
        passRateStandardError: 0.01,
    };
}

function out(
    monthlyNet: number,
    cycleNet: number,
): Pick<SimOutputs, 'expectedMonthlyNet' | 'expectedNet'> {
    return { expectedMonthlyNet: monthlyNet, expectedNet: cycleNet };
}

function reconstructed(
    kind: TradingPhase,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    const state = accountState(overrides);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker:
            kind === TradingPhase.Funded
                ? newFundedCycleTracker({
                      ...state,
                      balance: state.startingBalance,
                  })
                : null,
        kind,
        plan: topStepPlan(),
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function sourceFiles(directory: string): string[] {
    return readdirSync(path.join(ROOT, directory), {
        recursive: true,
        withFileTypes: true,
    })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

function splitRow(
    splitCount: number,
    monthly: number,
    cycle: number,
): CopySplitRow {
    return {
        cycleNet: { standardError: 5, value: cycle },
        daysToPassP50: 10,
        kind: CopySplitRowKind.Simulated,
        netPerFeeDollar: 1,
        passRate: 0.5,
        placement: null,
        riskPerAccount: 100,
        splitCount,
        totalFees: 100,
        totalMonthlyNet: { standardError: 5, value: monthly },
        trials: 100,
    };
}

function topStepPlan(): Plan {
    const found = findFirm(TOPSTEP_ID.firm)?.findPlan(TOPSTEP_ID);
    if (!found) throw new Error(`${serializePlanId(TOPSTEP_ID)} missing`);
    return found;
}

describe('riskTableObjective', () => {
    it('keeps MonthlyNet and CycleCash as they are, with no note', () => {
        for (const objective of [
            SizingObjective.CycleCash,
            SizingObjective.MonthlyNet,
        ]) {
            const view = riskTableObjective(objective);
            expect(view.effective).toBe(objective);
            expect(view.requested).toBe(objective);
            expect(view.note).toBeNull();
        }
    });

    it('keeps the MonthlyNet star under RuinFirst and says why', () => {
        const view = riskTableObjective(SizingObjective.RuinFirst);
        expect(view.requested).toBe(SizingObjective.RuinFirst);
        expect(view.effective).toBe(SizingObjective.MonthlyNet);
        expect(view.note).toBe(
            'RuinFirst ranks plans to buy; risk sizing stays on monthly net (Hard Rule 3)',
        );
        expect(RUIN_FIRST_RISK_TABLE_NOTE).toBe(view.note);
    });

    it('names the requested objective on the chip, with no em dash', () => {
        expect(
            OBJECTIVE_OPTIONS.map((option) => option.objective).toSorted(
                (a, b) => a.localeCompare(b),
            ),
        ).toStrictEqual(
            Object.values(SizingObjective).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
        for (const option of OBJECTIVE_OPTIONS) {
            expect(option.label).not.toContain('\u{2014}');
            expect(option.label.length).toBeGreaterThan(0);
        }
        expect(riskTableObjective(SizingObjective.CycleCash).label).toBe(
            'cycle cash',
        );
    });
});

describe('riskRowFigures: both numbers show whatever the objective', () => {
    it('reads monthly net and cycle net from the same run', () => {
        expect(riskRowFigures(out(120, 45))).toStrictEqual({
            cycleNet: 45,
            monthlyNet: 120,
        });
    });
});

describe('starredRows', () => {
    const rows = [
        { id: 'a', ...out(100, 900) },
        { id: 'b', ...out(300, 100) },
        { id: 'c', ...out(200, 500) },
    ];
    const figures = (row: (typeof rows)[number]) => riskRowFigures(row);

    it('stars the highest monthly net under MonthlyNet', () => {
        expect([
            ...starredRows(rows, SizingObjective.MonthlyNet, figures),
        ]).toStrictEqual([rows[1]]);
    });

    it('stars the highest cycle net under CycleCash', () => {
        expect([
            ...starredRows(rows, SizingObjective.CycleCash, figures),
        ]).toStrictEqual([rows[0]]);
    });

    it('keeps the MonthlyNet star under RuinFirst', () => {
        expect([
            ...starredRows(rows, SizingObjective.RuinFirst, figures),
        ]).toStrictEqual([rows[1]]);
    });

    it('stars every row tied for the best, and none when there are no rows', () => {
        const tied = [
            { id: 'x', ...out(100, 1) },
            { id: 'y', ...out(100, 2) },
        ];
        expect(
            starredRows(tied, SizingObjective.MonthlyNet, figures).size,
        ).toBe(2);
        expect(starredRows([], SizingObjective.MonthlyNet, figures).size).toBe(
            0,
        );
    });
});

describe('ladderObjectiveStar', () => {
    const fast = ladderScore([100, 200], 5, 900, 0.3);
    const cheap = ladderScore([300, 300], 9, 400, 0.5);
    const sure = ladderScore([50, 50], 20, 600, 0.9);
    const result = {
        byCost: [cheap, fast, sure],
        byPassRate: [sure, cheap, fast],
        bySpeed: [fast, cheap, sure],
    } as unknown as LadderSearchResult;

    it('stars the fastest ladder under MonthlyNet and the cheapest per funded under CycleCash', () => {
        expect(ladderObjectiveStar(result, SizingObjective.MonthlyNet)).toBe(
            fast,
        );
        expect(ladderObjectiveStar(result, SizingObjective.CycleCash)).toBe(
            cheap,
        );
    });

    it('keeps the MonthlyNet star under RuinFirst and never stars the pass rate winner', () => {
        const star = ladderObjectiveStar(result, SizingObjective.RuinFirst);
        expect(star).toBe(fast);
        expect(star).not.toBe(result.byPassRate[0]);
    });

    it('stars nothing without scored ladders', () => {
        const empty = {
            byCost: [],
            byPassRate: [],
            bySpeed: [],
        } as unknown as LadderSearchResult;
        expect(
            ladderObjectiveStar(empty, SizingObjective.MonthlyNet),
        ).toBeNull();
    });
});

describe('ladderRungPlacements: whole contracts at an entered stop (F-V23, PD-25)', () => {
    const nq20 = resolvePositionSizing(InstrumentSymbol.NQ, 20);

    it('shows each rung as whole contracts and the placed risk, rounded down', () => {
        expect(
            ladderRungPlacements([400, 1000, 1600], nq20, null),
        ).toStrictEqual([
            { contracts: 1, placedRisk: 400, rung: 400 },
            { contracts: 2, placedRisk: 800, rung: 1000 },
            { contracts: 4, placedRisk: 1600, rung: 1600 },
        ]);
    });

    it('shows a rung below one contract as zero contracts and no placed risk', () => {
        expect(ladderRungPlacements([200], nq20, null)).toStrictEqual([
            { contracts: 0, placedRisk: 0, rung: 200 },
        ]);
    });

    it('caps at the eval contract limit and shows the capped contracts, never a dollar cap', () => {
        const placements = ladderRungPlacements([4000], nq20, 3);
        expect(placements).toStrictEqual([
            { contracts: 3, placedRisk: 1200, rung: 4000 },
        ]);
    });

    it('has no placements without an instrument and a stop', () => {
        expect(ladderRungPlacements([400], null, null)).toBeNull();
    });
});

describe('RuinFirst never changes sizing: every consumer that takes an objective treats it as MonthlyNet or refuses it (T-4, Hard Rule 3, Mistake 10)', () => {
    const SIZING_SURFACES = [
        RankingSurface.Advice,
        RankingSurface.DocumentedRules,
        RankingSurface.Dp,
        RankingSurface.FundedRiskSweep,
        RankingSurface.Ladder,
    ];
    it('applies the MonthlyNet ranking to every sizing surface under RuinFirst', () => {
        for (const surface of SIZING_SURFACES) {
            expect(
                objectiveApplicability(SizingObjective.RuinFirst, surface)
                    .effectiveObjective,
            ).toBe(SizingObjective.MonthlyNet);
        }
    });

    it('stars the same risk table rows under RuinFirst as under MonthlyNet, where CycleCash would star another', () => {
        const rows = [
            { cycle: 100, monthly: 900 },
            { cycle: 900, monthly: 100 },
        ];
        const figures = (row: (typeof rows)[number]) => ({
            cycleNet: row.cycle,
            monthlyNet: row.monthly,
        });
        const ruin = starredRows(rows, SizingObjective.RuinFirst, figures);
        const monthly = starredRows(rows, SizingObjective.MonthlyNet, figures);
        const cycle = starredRows(rows, SizingObjective.CycleCash, figures);
        expect([...ruin]).toStrictEqual([...monthly]);
        expect([...cycle]).not.toStrictEqual([...monthly]);
    });

    it('stars the same ladder under RuinFirst as under MonthlyNet, where CycleCash would star another', () => {
        const fast = ladderScore([100, 200], 5, 900, 0.3);
        const cheap = ladderScore([300, 300], 9, 400, 0.5);
        const result = {
            byCost: [cheap, fast],
            byPassRate: [cheap, fast],
            bySpeed: [fast, cheap],
        } as unknown as LadderSearchResult;
        expect(ladderObjectiveStar(result, SizingObjective.RuinFirst)).toBe(
            ladderObjectiveStar(result, SizingObjective.MonthlyNet),
        );
        expect(ladderObjectiveStar(result, SizingObjective.CycleCash)).not.toBe(
            ladderObjectiveStar(result, SizingObjective.MonthlyNet),
        );
    });

    it('ranks copy splits the same under RuinFirst as under MonthlyNet, where CycleCash would rank another way', () => {
        const rows = [splitRow(1, 900, 100), splitRow(2, 100, 900)];
        const ruin = rankCopySplitRows(rows, SizingObjective.RuinFirst);
        const monthly = rankCopySplitRows(rows, SizingObjective.MonthlyNet);
        const cycle = rankCopySplitRows(rows, SizingObjective.CycleCash);
        expect(ruin.rows).toStrictEqual(monthly.rows);
        expect(ruin.indistinguishableSplits).toStrictEqual(
            monthly.indistinguishableSplits,
        );
        expect(cycle.rows).not.toStrictEqual(monthly.rows);
    });

    it('leaves the DP solver configuration untouched under RuinFirst, as under MonthlyNet', () => {
        const config = { maxSolves: 12, startRatePerDay: 3 } as never;
        expect(dpObjectiveSolverConfig(config, SizingObjective.RuinFirst)).toBe(
            config,
        );
        expect(
            dpObjectiveSolverConfig(config, SizingObjective.MonthlyNet),
        ).toBe(config);
        expect(
            dpObjectiveSolverConfig(config, SizingObjective.CycleCash),
        ).not.toBe(config);
    });

    it('refuses RuinFirst on the ladder, the DP and the funded sweep instead of sizing with it', () => {
        expect(() => ladderRankingsFor(SizingObjective.RuinFirst)).toThrow(
            ObjectiveNotApplicable,
        );
        expect(() =>
            readObjective(
                { bankroll: '5000', objective: ObjectiveFlag.RuinFirst },
                RankingSurface.Dp,
            ),
        ).toThrow(ObjectiveNotApplicable);
        expect(() =>
            resolveFundedSort(
                { objective: ObjectiveFlag.RuinFirst, sort: 'monthly' },
                false,
            ),
        ).toThrow(ObjectiveNotApplicable);
    });

    it('records speed to funded for the eval ladder and MonthlyNet for the funded sweep, whatever the table objective is', () => {
        const result = advice();
        expect(result.eval.documented).not.toBeNull();
        expect(result.funded.documented).not.toBeNull();
        expect(result.eval.assembled.provenance.objective).toBe(
            SpeedObjective.SpeedToFunded,
        );
        expect(result.funded.assembled.provenance.objective).toBe(
            SizingObjective.MonthlyNet,
        );
    });

    it('lets no advisor module read RuinFirst: only the applicability, choice and copy-split ranking name it', () => {
        const allowed = new Set([
            path.join('actions', 'ChooseObjective.ts'),
            path.join('actions', 'ObjectiveApplicability.ts'),
            path.join('policy', 'CopySplit.ts'),
            'SizingObjective.ts',
        ]);
        const offenders = sourceFiles('src/lib/prop-calculator/advisor')
            .filter((file) => !allowed.has(path.relative(ADVISOR_ROOT, file)))
            .filter((file) => isNamingRuinFirst(file))
            .map((file) => path.relative(ADVISOR_ROOT, file));
        expect(offenders).toStrictEqual([]);
    });

    it('lets no other sizing module name RuinFirst: economics, optimize, simulator, core and the sizing tables', () => {
        const scanned = [
            ...sourceFiles('src/lib/prop-calculator/economics'),
            ...sourceFiles('src/lib/prop-calculator/optimize'),
            ...sourceFiles('src/lib/prop-calculator/simulator'),
            ...sourceFiles('src/lib/prop-calculator/core'),
            path.join(
                ROOT,
                'src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx',
            ),
        ];
        const offenders = scanned
            .filter((file) => isNamingRuinFirst(file))
            .map((file) => path.relative(ROOT, file));
        expect(offenders).toStrictEqual([]);
    });

    it('lets the ladder, DP and funded commands and the ladder lab name RuinFirst only in an exhaustive switch case', () => {
        const switchCase = /^\s*case SizingObjective\.RuinFirst: \{$/;
        const consumers = [
            'src/cli/commands/prop/ladder/command.ts',
            'src/cli/commands/prop/optimize/dp/command.ts',
            'src/cli/commands/prop/optimize/funded/command.ts',
            'src/app/(app)/prop-calculator/_components/LadderLabPanel.tsx',
        ].map((file) => path.join(ROOT, file));
        const offenders = consumers
            .filter((file) => isNamingRuinFirst(file, switchCase))
            .map((file) => path.relative(ROOT, file));
        expect(offenders).toStrictEqual([]);
    });
});

describe('bankrollRiskFigures: P(no payout) and the loss risk when a bankroll is set', () => {
    const run = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 20,
        plan: topStepPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 3,
        tradesPerDay: 1,
        trials: 60,
        winrate: 0.4,
    });

    it('prices both at the attempts the bankroll affords', () => {
        const attempts = attemptsAffordable(
            dollars(5000),
            dollars(run.costPerAttempt),
        ).value;
        if (attempts === null) throw new Error('no attempts');
        const figures = bankrollRiskFigures(run, dollars(5000), 3);
        expect(figures.lossProbability).toBe(
            cohortOutcome(run.netValues, attempts, LOSS_RISK_DRAWS, 3).value
                ?.lossProbability.value ?? null,
        );
        expect(figures.noPayoutProbability).toBe(
            noPayoutProbability(fraction(run.attemptPaysProbability), attempts)
                .value ?? null,
        );
    });

    it('has no figures when the bankroll affords no attempt', () => {
        expect(bankrollRiskFigures(run, dollars(1), 3)).toStrictEqual({
            lossProbability: null,
            noPayoutProbability: null,
        });
    });
});

interface ComparisonFixtureRow {
    id: string;
    loss: null | number;
    out: {
        expectedMonthlyNet: number;
        expectedNet: number;
        expectedNetPerAttempt: number;
    };
}

function comparisonRow(
    id: string,
    monthly: number,
    cycle: number,
    evPerAttempt = 1,
    loss: null | number = null,
): ComparisonFixtureRow {
    return {
        id,
        loss,
        out: {
            expectedMonthlyNet: monthly,
            expectedNet: cycle,
            expectedNetPerAttempt: evPerAttempt,
        },
    };
}

function ids(rows: readonly ComparisonFixtureRow[]): string[] {
    return rows.map((row) => row.id);
}

function pricingOf(row: ComparisonFixtureRow): BatchLossPricing {
    return row.loss === null
        ? { status: BatchLossStatus.NoAttempt }
        : { probability: row.loss, status: BatchLossStatus.Priced };
}

function rankFixture(
    rows: readonly ComparisonFixtureRow[],
    objective: SizingObjective,
    bankrollCents: null | number,
    batchLoss: (row: ComparisonFixtureRow) => BatchLossPricing = pricingOf,
) {
    return rankComparison(rows, { bankrollCents, batchLoss, objective });
}

describe('rankComparison orders the compare tables by the objective (PT-83, F-V15)', () => {
    const rows = [
        comparisonRow('a', 300, 100),
        comparisonRow('b', 100, 900),
        comparisonRow('c', 200, 500),
    ];

    it('ranks MonthlyNet by monthly net, highest first, and names it', () => {
        const ranked = rankFixture(rows, SizingObjective.MonthlyNet, null);
        expect(ids(ranked.rows)).toStrictEqual(['a', 'c', 'b']);
        expect(ranked.effective).toBe(SizingObjective.MonthlyNet);
        expect(ranked.label).toBe('monthly net');
        expect(ranked.note).toBeNull();
    });

    it('ranks CycleCash by cycle net, highest first, and names it', () => {
        const ranked = rankFixture(rows, SizingObjective.CycleCash, null);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'c', 'a']);
        expect(ranked.effective).toBe(SizingObjective.CycleCash);
        expect(ranked.label).toBe('cycle cash');
        expect(ranked.note).toBeNull();
    });

    it('does not reorder the input and keeps equal rows in input order', () => {
        const tied = [
            comparisonRow('x', 100, 100),
            comparisonRow('y', 100, 100),
        ];
        const copy = [...tied];
        expect(
            ids(rankFixture(tied, SizingObjective.MonthlyNet, null).rows),
        ).toStrictEqual(['x', 'y']);
        expect(tied).toStrictEqual(copy);
    });

    it.each([null, 0])(
        'keeps RuinFirst on monthly net with the typed note when the bankroll is %j, without pricing a loss',
        (bankrollCents) => {
            const batchLoss = vi.fn((): BatchLossPricing => ({
                probability: 0.1,
                status: BatchLossStatus.Priced,
            }));
            const ranked = rankFixture(
                rows,
                SizingObjective.RuinFirst,
                bankrollCents,
                batchLoss,
            );
            expect(ids(ranked.rows)).toStrictEqual(['a', 'c', 'b']);
            expect(ranked.effective).toBe(SizingObjective.MonthlyNet);
            expect(ranked.label).toBe('monthly net');
            expect(ranked.note).toBe(RUIN_FIRST_NEEDS_BANKROLL_NOTE);
            expect(batchLoss).not.toHaveBeenCalled();
        },
    );

    it('ranks RuinFirst with a bankroll: positive EV plans by lower batch loss (none last), then the rest by monthly net', () => {
        const withLoss = [
            comparisonRow('risky', 500, 0, 1, 0.4),
            comparisonRow('safe', 100, 0, 1, 0.1),
            comparisonRow('unpriced', 900, 0, 1, null),
            comparisonRow('negative-big', 800, 0, -1, 0.01),
            comparisonRow('negative-small', 50, 0, -1, 0.01),
        ];
        const ranked = rankFixture(
            withLoss,
            SizingObjective.RuinFirst,
            500_000,
        );
        expect(ids(ranked.rows)).toStrictEqual([
            'safe',
            'risky',
            'unpriced',
            'negative-big',
            'negative-small',
        ]);
        expect(ranked.effective).toBe(SizingObjective.RuinFirst);
        expect(ranked.label).toBe('ruin first');
        expect(ranked.note).toBeNull();
    });

    it('falls back to monthly net with a note when the bankroll affords no attempt of any plan', () => {
        const unpriced = [
            comparisonRow('a', 100, 0, 1, null),
            comparisonRow('b', 300, 0, 1, null),
        ];
        const ranked = rankFixture(unpriced, SizingObjective.RuinFirst, 100);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
        expect(ranked.effective).toBe(SizingObjective.MonthlyNet);
        expect(ranked.note).toBe(RUIN_FIRST_NO_ATTEMPT_NOTE);
    });

    it('says the risk could not be priced, not that no attempt is affordable, when a batch is too large to simulate', () => {
        const ranked = rankFixture(
            [comparisonRow('a', 100, 0, 1), comparisonRow('b', 300, 0, 1)],
            SizingObjective.RuinFirst,
            500_000_000,
            () => ({ status: BatchLossStatus.Unpriced }),
        );
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
        expect(ranked.effective).toBe(SizingObjective.MonthlyNet);
        expect(ranked.note).toBe(RUIN_FIRST_UNPRICED_NOTE);
        expect(ranked.note).not.toBe(RUIN_FIRST_NO_ATTEMPT_NOTE);
    });

    it('ranks the priced plans and puts an unpriced plan after them when only some are priced', () => {
        const ranked = rankFixture(
            [
                comparisonRow('unpriced', 900, 0, 1),
                comparisonRow('risky', 500, 0, 1, 0.4),
                comparisonRow('safe', 100, 0, 1, 0.1),
            ],
            SizingObjective.RuinFirst,
            500_000,
            (row) =>
                row.id === 'unpriced'
                    ? { status: BatchLossStatus.Unpriced }
                    : pricingOf(row),
        );
        expect(ids(ranked.rows)).toStrictEqual(['safe', 'risky', 'unpriced']);
        expect(ranked.note).toBeNull();
    });

    it('says so when no plan has EV per attempt above zero', () => {
        const negative = [
            comparisonRow('a', 100, 0, -1, 0.5),
            comparisonRow('b', 300, 0, 0, 0.5),
        ];
        const ranked = rankFixture(negative, SizingObjective.RuinFirst, 100);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
        expect(ranked.note).toBe(RUIN_FIRST_NO_POSITIVE_EV_NOTE);
    });

    it('has no em dash in any note', () => {
        for (const note of [
            RUIN_FIRST_NEEDS_BANKROLL_NOTE,
            RUIN_FIRST_NO_ATTEMPT_NOTE,
            RUIN_FIRST_NO_POSITIVE_EV_NOTE,
            RUIN_FIRST_UNPRICED_NOTE,
        ]) {
            expect(note).not.toContain('\u{2014}');
        }
    });
});

describe('priceBatchLoss separates no affordable attempt from a batch too large to price (PT-83 review)', () => {
    const NET_VALUES = [-500, 1500];
    const base = {
        attemptPaysProbability: 0.5,
        costPerAttempt: 500,
        netValues: NET_VALUES,
    };
    const SEED = 7;

    it('prices a small affordable batch', () => {
        const pricing = priceBatchLoss(base, 100_000, SEED);
        expect(pricing.status).toBe(BatchLossStatus.Priced);
        if (pricing.status !== BatchLossStatus.Priced) return;
        expect(pricing.probability).toBeGreaterThan(0.2);
        expect(pricing.probability).toBeLessThan(0.3);
    });

    it('reports no attempt when the bankroll is below one attempt cost', () => {
        expect(priceBatchLoss(base, 49_999, SEED).status).toBe(
            BatchLossStatus.NoAttempt,
        );
    });

    it('reports unpriced, not no attempt, when the bankroll affords more attempts than a batch can simulate', () => {
        const cheap = { ...base, costPerAttempt: 1 };
        expect(priceBatchLoss(cheap, 5_000_000_000, SEED).status).toBe(
            BatchLossStatus.Unpriced,
        );
    });

    it('still prices a bankroll that affords a thousand attempts', () => {
        const cheap = { ...base, costPerAttempt: 10 };
        expect(priceBatchLoss(cheap, 1_000_000, SEED).status).toBe(
            BatchLossStatus.Priced,
        );
    });
});
