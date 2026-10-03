import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import * as propAccounts from '~/lib/prop-accounts';
import {
    checkEdgeRange,
    COUNTED_OUTCOMES,
    DRIFT_STANDARD_ERRORS,
    EdgeDrift,
    type EdgeSummary,
    edgeSummary,
    edgeSummarySchema,
    MIN_EXPECTED_WINS_AND_LOSSES,
} from '~/lib/prop-accounts/edge';
import * as advisor from '~/lib/prop-calculator/advisor';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    type StrategyAssumptions,
} from '~/lib/prop-calculator/advisor';
import { wilsonInterval } from '~/lib/prop-calculator/stats';
import {
    COUNTED_OUTCOMES as ANALYTICS_COUNTED_OUTCOMES,
    expectancyR,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { OUTCOME_VALUES } from '~/lib/trading/types';

import { posixPath } from '../../../posixPath';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const EDGE_MODULE = /['"]~\/lib\/prop-accounts\/edge(?:\/[\w.]+)?['"]/;
const EDGE_IMPORTERS = [
    'src/app/(app)/prop-calculator/accounts/_components/overview/FirmsTile.tsx',
    'src/app/(app)/prop-calculator/accounts/edge/EdgeView.tsx',
    'src/app/(app)/prop-calculator/accounts/edge/page.tsx',
    'src/app/(app)/prop-calculator/accounts/firms/FirmsView.tsx',
    'src/app/(app)/prop-calculator/accounts/firms/page.tsx',
    'src/app/(app)/prop-calculator/accounts/next-slot/NextSlotView.tsx',
    'src/app/(app)/prop-calculator/accounts/next-slot/page.tsx',
    'src/app/(app)/prop-calculator/accounts/rounds/RoundsView.tsx',
    'src/server/api/routers/propAccounts/edge.ts',
];

function journal(
    wins: number,
    losses: number,
    winR = DEFAULT_RULEBOOK.strategy.rr,
): LightAssessment[] {
    return [
        ...Array.from({ length: wins }, () => trade('win', winR)),
        ...Array.from({ length: losses }, () => trade('loss', -1)),
    ];
}

function sourceFiles(directory: string): string[] {
    return readdirSync(path.join(REPO_ROOT, directory), { recursive: true })
        .map(String)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => posixPath(path.join(directory, name)));
}

const SCAN_SLICES = Array.from({ length: 32 }, (_, slice) => slice);
const EDGE_SCAN_FILES = sourceFiles('src').filter(
    (file) => !file.startsWith('src/lib/prop-accounts/edge'),
);

function trade(
    outcome: null | string,
    outcomeR: null | number,
): LightAssessment {
    return {
        createdAt: new Date('2026-09-01T14:30:00Z'),
        grade: 'A',
        id: crypto.randomUUID(),
        outcome,
        outcomeR,
        planId: null,
        score: 90,
    };
}

describe('edgeSummary', () => {
    it('counts the journal exactly as the trade analytics expectancy does', () => {
        const rows = [
            ...journal(3, 4),
            trade('breakeven', 0),
            trade(null, null),
            trade('win', null),
            trade('loss', NaN),
            trade('open', 2),
        ];
        const reference = expectancyR(rows);
        const summary = edgeSummary(rows, DEFAULT_RULEBOOK.strategy);
        expect(reference.sample).toBe(8);
        expect(summary.sampleSize).toBe(reference.sample);
        expect(summary.winRate.observed).toBe(reference.winRate);
        expect(summary.expectancyR.observed).toBe(reference.avgR);
    });

    it("compares against the rulebook's 40% and 1:2 by default", () => {
        const summary = edgeSummary(journal(4, 6), DEFAULT_RULEBOOK.strategy);
        expect(summary.winRate.assumed).toBe(0.4);
        expect(summary.rewardToRisk).toBe(2);
        expect(summary.expectancyR.assumed).toBeCloseTo(0.2, 12);
    });

    it('takes the assumptions from a custom rulebook', () => {
        const summary = edgeSummary(journal(5, 5, 1.5), {
            ...DEFAULT_RULEBOOK.strategy,
            rr: 1.5,
            winrate: 0.5,
        });
        expect(summary.winRate.assumed).toBe(0.5);
        expect(summary.rewardToRisk).toBe(1.5);
        expect(summary.expectancyR.assumed).toBeCloseTo(0.25, 12);
        expect(summary.winRate.standardError).toBeCloseTo(
            Math.sqrt(0.25 / 10),
            12,
        );
        expect(summary.expectancyR.standardError).toBeCloseTo(
            2.5 * Math.sqrt(0.25 / 10),
            12,
        );
    });

    it('measures the standard error at the assumed edge, so a short streak is not called drift', () => {
        const summary = edgeSummary(journal(40, 60), DEFAULT_RULEBOOK.strategy);
        const winRateError = Math.sqrt((0.4 * 0.6) / 100);
        expect(summary.sampleSize).toBe(100);
        expect(summary.winRate.standardError).toBeCloseTo(winRateError, 12);
        expect(summary.expectancyR.standardError).toBeCloseTo(
            3 * winRateError,
            12,
        );
        expect(summary.winRate.drift).toBe(EdgeDrift.WithinNoise);
        expect(summary.expectancyR.drift).toBe(EdgeDrift.WithinNoise);

        const streak = edgeSummary(journal(0, 5), DEFAULT_RULEBOOK.strategy);
        expect(streak.winRate.observed).toBe(0);
        expect(streak.winRate.standardError).toBeGreaterThan(0);
        expect(streak.winRate.drift).toBe(EdgeDrift.TooFewTrades);
    });

    it.each([
        [3, EdgeDrift.TooFewTrades],
        [12, EdgeDrift.TooFewTrades],
        [13, EdgeDrift.Above],
    ] as const)(
        'calls no drift before the sample expects 5 wins and 5 losses at the default win rate: %i straight wins',
        (wins, drift) => {
            const summary = edgeSummary(
                journal(wins, 0),
                DEFAULT_RULEBOOK.strategy,
            );
            expect(summary.winRate.drift).toBe(drift);
            expect(summary.expectancyR.drift).toBe(drift);
            expect(summary.sampleSize).toBe(wins);
            expect(summary.winRate.observed).toBe(1);
            expect(summary.winRate.standardError).toBeCloseTo(
                Math.sqrt(0.24 / wins),
                12,
            );
            expect(MIN_EXPECTED_WINS_AND_LOSSES).toBe(5);
        },
    );

    it('needs the expected count on the rarer side of the assumed win rate', () => {
        const assumptions = {
            ...DEFAULT_RULEBOOK.strategy,
            winrate: 0.8,
        };
        expect(edgeSummary(journal(0, 24), assumptions).winRate.drift).toBe(
            EdgeDrift.TooFewTrades,
        );
        expect(edgeSummary(journal(0, 25), assumptions).winRate.drift).toBe(
            EdgeDrift.Below,
        );
    });

    it.each([
        [50, 50, EdgeDrift.Above, EdgeDrift.Above],
        [49, 51, EdgeDrift.WithinNoise, EdgeDrift.WithinNoise],
        [31, 69, EdgeDrift.WithinNoise, EdgeDrift.WithinNoise],
        [30, 70, EdgeDrift.Below, EdgeDrift.Below],
    ] as const)(
        'flags drift only beyond 2 standard errors: %i wins and %i losses',
        (wins, losses, winRateDrift, expectancyDrift) => {
            const summary = edgeSummary(
                journal(wins, losses),
                DEFAULT_RULEBOOK.strategy,
            );
            expect(DRIFT_STANDARD_ERRORS).toBe(2);
            expect(summary.winRate.drift).toBe(winRateDrift);
            expect(summary.expectancyR.drift).toBe(expectancyDrift);
        },
    );

    it('flags the expectancy on its own when wins come in short of 2R at the assumed win rate', () => {
        const summary = edgeSummary(
            journal(40, 60, 1),
            DEFAULT_RULEBOOK.strategy,
        );
        expect(summary.winRate.observed).toBe(0.4);
        expect(summary.winRate.drift).toBe(EdgeDrift.WithinNoise);
        expect(summary.expectancyR.observed).toBeCloseTo(-0.2, 12);
        expect(summary.expectancyR.drift).toBe(EdgeDrift.Below);
    });

    it('reports no trades, not a zero edge, when nothing in the journal has a result', () => {
        for (const rows of [[], [trade(null, null), trade('win', null)]]) {
            const summary = edgeSummary(rows, DEFAULT_RULEBOOK.strategy);
            expect(summary.sampleSize).toBe(0);
            for (const metric of [summary.winRate, summary.expectancyR]) {
                expect(metric.drift).toBe(EdgeDrift.NoTrades);
                expect(metric.observed).toBeNull();
                expect(metric.standardError).toBeNull();
            }
            expect(summary.winRate.assumed).toBe(0.4);
        }
    });

    it('counts in the database exactly the outcomes the trade analytics expectancy counts', () => {
        const counted = OUTCOME_VALUES.filter(
            (outcome) => expectancyR([trade(outcome, 1)]).sample === 1,
        );
        expect(counted.length).toBeGreaterThan(0);
        expect(counted.length).toBeLessThan(OUTCOME_VALUES.length);
        expect(new Set(COUNTED_OUTCOMES)).toEqual(new Set(counted));
    });

    it('reuses the one counted-outcomes list the trade analytics exports', () => {
        expect(ANALYTICS_COUNTED_OUTCOMES).toBeDefined();
        expect(COUNTED_OUTCOMES).toBe(ANALYTICS_COUNTED_OUTCOMES);
    });

    it('round-trips through its output schema', () => {
        const summary = edgeSummary(journal(7, 9), DEFAULT_RULEBOOK.strategy);
        expect(edgeSummarySchema.parse(summary)).toEqual(summary);
        const empty = edgeSummary([], DEFAULT_RULEBOOK.strategy);
        expect(edgeSummarySchema.parse(empty)).toEqual(empty);
    });
});

describe('measuredRewardToRisk (PT-61d, F-V22)', () => {
    it('is null before 5 wins and 5 losses each', () => {
        expect(
            edgeSummary(journal(4, 10), DEFAULT_RULEBOOK.strategy)
                .measuredRewardToRisk,
        ).toBeNull();
        expect(
            edgeSummary(journal(10, 4), DEFAULT_RULEBOOK.strategy)
                .measuredRewardToRisk,
        ).toBeNull();
    });

    it('is null when the journal has no losses or no wins at all', () => {
        expect(
            edgeSummary(journal(20, 0), DEFAULT_RULEBOOK.strategy)
                .measuredRewardToRisk,
        ).toBeNull();
        expect(
            edgeSummary(journal(0, 20), DEFAULT_RULEBOOK.strategy)
                .measuredRewardToRisk,
        ).toBeNull();
    });

    it('measures the average win over the average loss once both sides have at least 5', () => {
        const summary = edgeSummary(
            journal(40, 60, 2),
            DEFAULT_RULEBOOK.strategy,
        );
        expect(summary.measuredRewardToRisk).toStrictEqual({
            sampleSize: 100,
            value: 2,
        });
    });

    it('is unaffected by the rulebook assumption, unlike rewardToRisk', () => {
        const rows = journal(10, 10, 3);
        const summary = edgeSummary(rows, {
            ...DEFAULT_RULEBOOK.strategy,
            rr: 1.5,
        });
        expect(summary.rewardToRisk).toBe(1.5);
        expect(summary.measuredRewardToRisk).toStrictEqual({
            sampleSize: 20,
            value: 3,
        });
    });

    it('ignores breakeven and unresolved rows on both sides', () => {
        const rows = [
            ...journal(5, 5, 2),
            trade('breakeven', 0),
            trade(null, null),
            trade('open', 5),
        ];
        const summary = edgeSummary(rows, DEFAULT_RULEBOOK.strategy);
        expect(summary.measuredRewardToRisk).toStrictEqual({
            sampleSize: 10,
            value: 2,
        });
    });

    it('round-trips through the output schema alongside a null value', () => {
        const withValue = edgeSummary(journal(5, 5), DEFAULT_RULEBOOK.strategy);
        expect(edgeSummarySchema.parse(withValue)).toEqual(withValue);
        const withoutValue = edgeSummary(
            journal(2, 2),
            DEFAULT_RULEBOOK.strategy,
        );
        expect(withoutValue.measuredRewardToRisk).toBeNull();
        expect(edgeSummarySchema.parse(withoutValue)).toEqual(withoutValue);
    });
});

describe('checkEdgeRange', () => {
    it('accepts an open, a one-sided and an ordered range', () => {
        for (const range of [
            {},
            { from: '2026-09-01' },
            { to: '2026-09-30' },
            { from: '2026-09-01', to: '2026-09-01' },
        ]) {
            const check = checkEdgeRange(range);
            expect(check.isValid).toBe(true);
            expect(check.issues.size).toBe(0);
        }
    });

    it.each([
        ['from', '0002-09-01'],
        ['from', '0202-09-01'],
        ['from', '1999-12-31'],
        ['to', '2101-01-01'],
        ['to', '0020-09-01'],
    ] as const)(
        'holds the query back on a year the server rejects, as a date input passes through while typing: %s %s',
        (field, date) => {
            const check = checkEdgeRange({ [field]: date });
            expect(check.isValid).toBe(false);
            expect([...check.issues]).toEqual([
                [field, 'must be a date from 2000 through 2100'],
            ]);
        },
    );

    it('puts the ordering problem on the To field', () => {
        const check = checkEdgeRange({ from: '2026-09-30', to: '2026-09-01' });
        expect(check.isValid).toBe(false);
        expect([...check.issues]).toEqual([
            ['to', 'the range ends before it starts'],
        ]);
    });
});

describe('the edge summary is display only', () => {
    it('cannot stand in for the rulebook or its strategy assumptions', () => {
        expectTypeOf<EdgeSummary>().not.toExtend<
            Partial<StrategyAssumptions>
        >();
        expectTypeOf<EdgeSummary>().not.toExtend<Partial<RulebookParameters>>();
    });

    it('is not re-exported by the prop-accounts root barrel or the advisor', () => {
        for (const barrel of [propAccounts, advisor]) {
            expect(Object.keys(barrel)).not.toContain('edgeSummary');
            expect(Object.keys(barrel)).not.toContain('EdgeDrift');
        }
    });

    it.each(SCAN_SLICES)(
        'is imported by no file outside the edge router, the edge page, the rounds view and the trade count behind the scale gate on the firms tile and the firms and next slot pages, in slice %d of src',
        (slice) => {
            const unexpected = EDGE_SCAN_FILES.filter(
                (_, position) => position % SCAN_SLICES.length === slice,
            )
                .filter((file) => !EDGE_IMPORTERS.includes(file))
                .filter((file) =>
                    EDGE_MODULE.test(
                        readFileSync(path.join(REPO_ROOT, file), 'utf8'),
                    ),
                );
            expect(unexpected).toEqual([]);
        },
    );

    it('is still imported by every one of those files', () => {
        const importers = EDGE_IMPORTERS.filter((file) =>
            EDGE_MODULE.test(readFileSync(path.join(REPO_ROOT, file), 'utf8')),
        );
        expect(importers).toEqual(EDGE_IMPORTERS);
    });
});

describe('winRateInterval (F-V10, PT-86)', () => {
    it('pins the 95% Wilson interval of 6 wins in 10 trades', () => {
        const summary = edgeSummary(journal(6, 4), DEFAULT_RULEBOOK.strategy);
        expect(summary.winRateInterval).not.toBeNull();
        expect(summary.winRateInterval?.lower).toBeCloseTo(0.3127, 4);
        expect(summary.winRateInterval?.upper).toBeCloseTo(0.8318, 4);
        expect(summary.winRateInterval).toEqual(wilsonInterval(6, 10));
    });

    it('counts only the trades the win rate counts', () => {
        const rows = [
            ...journal(3, 4),
            trade('breakeven', 0),
            trade(null, null),
            trade('win', null),
            trade('open', 2),
        ];
        const summary = edgeSummary(rows, DEFAULT_RULEBOOK.strategy);
        expect(summary.sampleSize).toBe(8);
        expect(summary.winRateInterval).toEqual(wilsonInterval(3, 8));
    });

    it('stays inside 0 to 1 for a streak of wins and for a streak of losses', () => {
        const wins = edgeSummary(journal(5, 0), DEFAULT_RULEBOOK.strategy);
        expect(wins.winRateInterval?.upper).toBe(1);
        expect(wins.winRateInterval?.lower).toBeGreaterThan(0);
        const losses = edgeSummary(journal(0, 5), DEFAULT_RULEBOOK.strategy);
        expect(losses.winRateInterval?.lower).toBe(0);
        expect(losses.winRateInterval?.upper).toBeLessThan(1);
    });

    it('is null with no counted trade, not a zero-width interval', () => {
        expect(
            edgeSummary([], DEFAULT_RULEBOOK.strategy).winRateInterval,
        ).toBeNull();
    });

    it('contains the observed win rate and round-trips through the output schema', () => {
        const summary = edgeSummary(journal(6, 4), DEFAULT_RULEBOOK.strategy);
        const observed = summary.winRate.observed ?? NaN;
        expect(summary.winRateInterval?.lower).toBeLessThan(observed);
        expect(summary.winRateInterval?.upper).toBeGreaterThan(observed);
        expect(edgeSummarySchema.parse(summary)).toEqual(summary);
        const empty = edgeSummary([], DEFAULT_RULEBOOK.strategy);
        expect(edgeSummarySchema.parse(empty)).toEqual(empty);
    });
});
