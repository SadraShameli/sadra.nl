import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { dollars, FundedDpModelGapKind } from '~/lib/prop-calculator';
import { DpGateFailure } from '~/lib/prop-calculator/advisor/dp';
import {
    DpAdviceGap,
    type DpAdviceGapEntry,
    DpGateFailureCode,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import {
    DP_GATE_FAILURE_TEXT,
    DP_SAMPLES_UNAVAILABLE_TEXT,
    dpAdviceGapText,
    dpGateFailureText,
    dpMoney,
    dpOwnGapText,
    fundedDpModelGapClause,
    isFundedDpModelGap,
} from '~/lib/prop-calculator/advisor/DpAdviceText';

import { moduleGraphFrom } from '../../../importSpecifiers';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const TEXT_MODULE = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-calculator',
    'advisor',
    'DpAdviceText.ts',
);
const DP_PREFIX = `${path.join(SOURCE_ROOT, 'lib', 'prop-calculator', 'advisor', 'dp')}${path.sep}`;
const FORBIDDEN_FILES = new Set(
    [
        'AverageRewardSolver.ts',
        'FundedDpModelGaps.ts',
        'FundedStateValue.ts',
    ].map((file) =>
        path.join(SOURCE_ROOT, 'lib', 'prop-calculator', 'core', file),
    ),
);

const FUNDED_GAPS = [
    {
        kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored,
        message: 'closes its funded phase for an empty calendar week',
    },
    {
        kind: FundedDpModelGapKind.FundedGridSaturationHigh,
        shareAtOrAboveTop: 0.025,
    },
    {
        kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
        maxLifetimePayoutDollars: dollars(100_000),
    },
    {
        fromPayoutIndex: 4,
        kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
        payoutRegimeCap: 3,
    },
    { kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated },
    { kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates },
] as const;

const OWN_GAPS = [
    { kind: DpAdviceGap.ConsistencyGridTruncates, lockedTopCents: 450_000 },
    { kind: DpAdviceGap.ContinuousRiskAssumed },
    { kind: DpAdviceGap.DayStopRuleNotModeled },
    {
        drawdownCents: 250_050,
        kind: DpAdviceGap.EvalGridMisaligned,
        stepCents: 10_000,
    },
    { kind: DpAdviceGap.StateAtGridTop },
] as const;

function filesContaining(fragment: string): string[] {
    return sourceFiles(SOURCE_ROOT).filter((file) =>
        readFileSync(file, 'utf8').includes(fragment),
    );
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('the DP text module is browser-safe (F-147)', () => {
    const graph = moduleGraphFrom(TEXT_MODULE, SOURCE_ROOT);

    it('never reaches the DP solver files', () => {
        expect(graph.files.filter((file) => FORBIDDEN_FILES.has(file))).toEqual(
            [],
        );
    });

    it('never reaches advisor/dp or a node: module', () => {
        expect(graph.files.some((file) => file.startsWith(DP_PREFIX))).toBe(
            false,
        );
        expect(graph.externalSpecifiers).toEqual([]);
    });
});

describe('the stored gate failure code', () => {
    it('has exactly the members of the gate verdict failure enum, with the same values', () => {
        expect(
            Object.values(DpGateFailureCode).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(
            Object.values(DpGateFailure).toSorted((a, b) => a.localeCompare(b)),
        );
    });
});

describe('the gate failure texts', () => {
    it('word every failure code once', () => {
        for (const code of Object.values(DpGateFailureCode)) {
            const text = DP_GATE_FAILURE_TEXT[code];
            expect(text.length, code).toBeGreaterThan(0);
        }
        expect(
            Object.keys(DP_GATE_FAILURE_TEXT).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(
            Object.values(DpGateFailureCode).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
    });

    it('append the stored result text after a colon, and say nothing more without one', () => {
        expect(dpGateFailureText(DpGateFailureCode.NoGateRun, null)).toBe(
            'no gate run is recorded for this plan',
        );
        expect(
            dpGateFailureText(
                DpGateFailureCode.BelowBestFlat,
                '0.99x best flat (credit-free)',
            ),
        ).toBe(
            'the gate run is below the best flat policy: 0.99x best flat (credit-free)',
        );
        expect(
            dpGateFailureText(
                DpGateFailureCode.SolveNotConverged,
                'solve-cap-reached',
            ),
        ).toBe('the gate run solve did not converge: solve-cap-reached');
    });
});

describe('the samples-unavailable texts', () => {
    it('word every reason', () => {
        expect(
            Object.keys(DP_SAMPLES_UNAVAILABLE_TEXT).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(
            Object.values(DpSamplesUnavailableReason).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        );
    });
});

describe('the gap texts', () => {
    it.each([
        [
            OWN_GAPS[0],
            'The consistency rule stops the DP cushion grid at $4,500.00, which truncates any state above it.',
        ],
        [
            OWN_GAPS[1],
            'Risk was solved in continuous dollars (no instrument and stop), so it is not placed in whole contracts.',
        ],
        [
            OWN_GAPS[2],
            'The documented day stop rule is not modeled by the funded DP.',
        ],
        [
            OWN_GAPS[3],
            'The eval drawdown $2,500.50 is not a whole multiple of the $100.00 cushion step; informational only.',
        ],
        [
            OWN_GAPS[4],
            'Your state sits at the top of the DP grid, so its risk is clamped there.',
        ],
    ])('words the own gap %j', (gap, text) => {
        expect(dpOwnGapText(gap)).toBe(text);
        expect(dpAdviceGapText(gap)).toBe(text);
    });

    it('words every funded model gap as a clause, and the web sentence is that clause behind "This plan:"', () => {
        for (const gap of FUNDED_GAPS) {
            const clause = fundedDpModelGapClause(gap);
            expect(clause.length, gap.kind).toBeGreaterThan(0);
            expect(dpAdviceGapText(gap), gap.kind).toBe(
                `This plan: ${clause}.`,
            );
        }
        expect(fundedDpModelGapClause(FUNDED_GAPS[1])).toContain('2.5%');
        expect(fundedDpModelGapClause(FUNDED_GAPS[2])).toContain('$100,000');
        expect(fundedDpModelGapClause(FUNDED_GAPS[3])).toContain('payout #5');
    });

    it('never points at a CLI output line, since the web shows the same text', () => {
        for (const gap of FUNDED_GAPS) {
            expect(fundedDpModelGapClause(gap), gap.kind).not.toMatch(
                /\bbelow\b/,
            );
        }
    });

    it('tells the own gaps from the funded gaps', () => {
        const all: readonly DpAdviceGapEntry[] = [...FUNDED_GAPS, ...OWN_GAPS];
        expect(all.filter((gap) => isFundedDpModelGap(gap))).toEqual(
            FUNDED_GAPS,
        );
    });

    it('formats cents as dollars with cents', () => {
        expect(dpMoney(250_050)).toBe('$2,500.50');
    });
});

describe('one copy of each DP text table (PT-30e)', () => {
    const fragments = [
        ...Object.values(DP_GATE_FAILURE_TEXT),
        ...Object.values(DP_SAMPLES_UNAVAILABLE_TEXT),
        'has a lifetime payout-dollar cap of',
        "this DP's payout-count regime cap of",
        'locks its funded drawdown only on the first payout',
        'its predicted rate overstated its own empirical replay',
        'clamped to the top cell',
    ];

    it.each(fragments.map((fragment) => [fragment]))(
        'defines %j in the DP text module only',
        (fragment) => {
            expect(filesContaining(fragment)).toEqual([TEXT_MODULE]);
        },
    );
});
