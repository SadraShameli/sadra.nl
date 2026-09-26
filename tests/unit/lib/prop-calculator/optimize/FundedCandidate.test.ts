import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    placedFundedRiskAt,
    type Plan,
    PolicySizing,
    type PositionSizingConfig,
    resolvePositionSizing,
    simInputsSizingIssue,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    belowOneContractClause,
    buildFundedCandidates,
    type BuiltFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    DEFAULT_FUNDED_PERCENT_CANDIDATES,
    flatsBelowOneContractNote,
    type FundedCandidateBuild,
    FundedCandidateBuildKind,
    fundedCandidateListsSchema,
    type FundedCandidateOptions,
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
    fundedFlatCandidateSchema,
    fundedPercentCandidateSchema,
    fundedPlacementNotes,
    fundedPlacementText,
    ladderRungsBelowOneContractText,
    type RefusedFundedCandidates,
} from '~/lib/prop-calculator/optimize';

const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

const CAP_SUFFIX = 'by the funded contract limit at the start tier';

const PLACEMENT_NOTE_AT_MNQ_TEN =
    'flat, percent and ladder rows are placed in whole MNQ contracts at a 10 point stop; a flat or ladder label shows the placement at the funded contract limit at the start tier (a tiered plan can place more later), and the affordable room can cut it further';

function apexEodPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function builtFor(
    overrides: Partial<FundedCandidateOptions>,
): BuiltFundedCandidates {
    const build = buildFundedCandidates(options(overrides));
    if (build.kind !== FundedCandidateBuildKind.Built) {
        throw new Error(`expected candidates, got ${build.refusal.kind}`);
    }
    return build;
}

function isRefused(
    build: FundedCandidateBuild,
): build is RefusedFundedCandidates {
    return build.kind === FundedCandidateBuildKind.Refused;
}

function labelsFor(overrides: Partial<FundedCandidateOptions>): string[] {
    return builtFor(overrides).candidates.map((candidate) => candidate.label);
}

function mffPlan(variant: MffuVariant): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFF ${variant} 50K plan not found`);
    return plan;
}

function options(
    overrides: Partial<FundedCandidateOptions>,
): FundedCandidateOptions {
    return {
        fundedLadder: null,
        plan: null,
        positionSizing: null,
        stopRule,
        ...overrides,
    };
}

function refusalFor(
    overrides: Partial<FundedCandidateOptions>,
): FundedCandidateRefusalDetail {
    const build = buildFundedCandidates(options(overrides));
    if (!isRefused(build)) {
        throw new Error('expected a refusal, got candidates');
    }
    return build.refusal;
}

function sizingAt(
    symbol: InstrumentSymbol,
    stopPoints: number,
): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(symbol, stopPoints);
    if (positionSizing === null) {
        throw new Error(`no position sizing for ${symbol} at ${stopPoints}`);
    }
    return positionSizing;
}

const mnqAtTen = sizingAt(InstrumentSymbol.MNQ, 10);
const nqAtTen = sizingAt(InstrumentSymbol.NQ, 10);
const esAtOnePointOne = sizingAt(InstrumentSymbol.ES, 1.1);

describe('funded candidate defaults and item schemas', () => {
    it('keeps the CLI default flat and percent candidates', () => {
        expect(DEFAULT_FUNDED_FLAT_CANDIDATES).toStrictEqual([
            150, 200, 250, 300, 400, 500,
        ]);
        expect(DEFAULT_FUNDED_PERCENT_CANDIDATES).toStrictEqual([
            5, 7.5, 10, 15,
        ]);
    });

    it('accepts a positive flat and refuses zero or a negative one', () => {
        expect(fundedFlatCandidateSchema.safeParse(0.01).success).toBe(true);
        expect(fundedFlatCandidateSchema.safeParse(0).success).toBe(false);
        expect(fundedFlatCandidateSchema.safeParse(-5).success).toBe(false);
    });

    it('accepts a percent in (0, 100] only', () => {
        expect(fundedPercentCandidateSchema.safeParse(100).success).toBe(true);
        expect(fundedPercentCandidateSchema.safeParse(0.5).success).toBe(true);
        expect(fundedPercentCandidateSchema.safeParse(0).success).toBe(false);
        expect(fundedPercentCandidateSchema.safeParse(100.01).success).toBe(
            false,
        );
    });

    it('fills in the default flats and keeps an omitted percent list undefined', () => {
        const parsed = fundedCandidateListsSchema.parse({ fundedLadder: null });
        expect(parsed.flat).toStrictEqual(DEFAULT_FUNDED_FLAT_CANDIDATES);
        expect(parsed.percent).toBeUndefined();
    });
});

describe('buildFundedCandidates with the default families', () => {
    it('gives the six plain flat rows with no stop and leaves the default percent rows out silently', () => {
        const build = builtFor({});
        expect(labelsFor({})).toStrictEqual([
            'flat $150',
            'flat $200',
            'flat $250',
            'flat $300',
            'flat $400',
            'flat $500',
        ]);
        expect(build.flatsBelowOneContract).toStrictEqual([]);
        expect(build.placedFlats).toStrictEqual([150, 200, 250, 300, 400, 500]);
    });

    it('gives the placed flat rows then the four percent rows at an MNQ 10 point stop', () => {
        expect(labelsFor({ positionSizing: mnqAtTen })).toStrictEqual([
            'flat $150 (7 MNQ = $140)',
            'flat $200 (10 MNQ = $200)',
            'flat $250 (12 MNQ = $240)',
            'flat $300 (15 MNQ = $300)',
            'flat $400 (20 MNQ = $400)',
            'flat $500 (25 MNQ = $500)',
            '5% cushion',
            '7.5% cushion',
            '10% cushion',
            '15% cushion',
        ]);
    });
});

describe('buildFundedCandidates rows and overrides', () => {
    it('orders flat, percent and ladder rows and sets each family override the way the CLI did', () => {
        const { candidates } = builtFor({
            flat: [150, 200],
            fundedLadder: [400, 600],
            percent: [5, 10],
            positionSizing: mnqAtTen,
        });
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150 (7 MNQ = $140)',
            'flat $200 (10 MNQ = $200)',
            '5% cushion',
            '10% cushion',
            'ladder 400/600 (20/30 MNQ = $400/$600)',
        ]);
        expect(
            candidates.map((candidate) => candidate.overrides),
        ).toStrictEqual([
            { fundedCushionPercent: undefined, fundedRiskPerTrade: 150 },
            { fundedCushionPercent: undefined, fundedRiskPerTrade: 200 },
            {
                fundedCushionPercent: fraction(5 / 100),
                fundedRiskPerTrade: undefined,
            },
            {
                fundedCushionPercent: fraction(10 / 100),
                fundedRiskPerTrade: undefined,
            },
            {
                fundedCushionPercent: undefined,
                fundedDayPolicy: {
                    ladder: [400, 600],
                    maxLossesPerDay: null,
                    sizing: PolicySizing.WholeContracts,
                    stopRule,
                },
                fundedRiskPerTrade: undefined,
            },
        ]);
    });

    it.each([5, 7.5, 10, 15, 100])(
        'sets a %d percent row to fraction(pct / 100) of the cushion',
        (pct) => {
            const [candidate] = builtFor({
                flat: [],
                percent: [pct],
                positionSizing: nqAtTen,
            }).candidates;
            expect(candidate?.label).toBe(`${pct}% cushion`);
            expect(candidate?.overrides.fundedCushionPercent).toBe(
                fraction(pct / 100),
            );
        },
    );

    it('keeps the plain ladder label and the funded whole-contract sizing with no stop', () => {
        const { candidates } = builtFor({
            flat: [150],
            fundedLadder: [400, 600],
            percent: [],
        });
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150',
            'ladder 400/600',
        ]);
        expect(candidates[1]?.overrides.fundedDayPolicy).toStrictEqual({
            ladder: [400, 600],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule,
        });
    });

    it('leaves a flat below one NQ contract out at a 10 point stop, lists it, and labels $250 as one NQ', () => {
        const build = builtFor({
            flat: [150, 250, 500],
            percent: [],
            positionSizing: nqAtTen,
        });
        expect(
            build.candidates.map((candidate) => candidate.label),
        ).toStrictEqual(['flat $250 (1 NQ = $200)', 'flat $500 (2 NQ = $400)']);
        expect(build.flatsBelowOneContract).toStrictEqual([150]);
        expect(build.placedFlats).toStrictEqual([250, 500]);
    });

    it('prints a placed risk that is not exact in binary in whole cents', () => {
        expect(
            labelsFor({
                flat: [80],
                fundedLadder: [80, 50],
                percent: [],
                positionSizing: sizingAt(InstrumentSymbol.MNQ, 12.3),
            }),
        ).toStrictEqual([
            'flat $80 (3 MNQ = $73.80)',
            'ladder 80/50 (3/2 MNQ = $73.80/$49.20)',
        ]);
    });

    it('returns candidates a worker can structured-clone unchanged', () => {
        const { candidates } = builtFor({
            fundedLadder: [400, 600],
            positionSizing: mnqAtTen,
        });
        expect(structuredClone(candidates)).toStrictEqual(candidates);
    });
});

describe('buildFundedCandidates labels at the funded start-tier contract cap (N-75, WP42)', () => {
    it('labels MFF Pro flat and ladder rows at the 5 MNQ start-tier cap', () => {
        expect(
            labelsFor({
                flat: [80, 150, 1000],
                fundedLadder: [80, 150],
                percent: [],
                plan: mffPlan(MffuVariant.Pro),
                positionSizing: mnqAtTen,
            }),
        ).toStrictEqual([
            'flat $80 (4 MNQ = $80)',
            `flat $150 (7 MNQ = $140, capped at 5 MNQ = $100 ${CAP_SUFFIX})`,
            `flat $1000 (50 MNQ = $1,000, capped at 5 MNQ = $100 ${CAP_SUFFIX})`,
            `ladder 80/150 (4/7 MNQ = $80/$140, capped at 4/5 MNQ = $80/$100 ${CAP_SUFFIX})`,
        ]);
    });

    it('labels MFF Rapid rows with no cap marker', () => {
        expect(
            labelsFor({
                flat: [80, 150, 1000],
                percent: [],
                plan: mffPlan(MffuVariant.Rapid),
                positionSizing: mnqAtTen,
            }),
        ).toStrictEqual([
            'flat $80 (4 MNQ = $80)',
            'flat $150 (7 MNQ = $140)',
            'flat $1000 (50 MNQ = $1,000)',
        ]);
    });

    it('makes the caller name the plan, or opt out of the cap with null', () => {
        expectTypeOf<Pick<FundedCandidateOptions, 'plan'>>().toEqualTypeOf<{
            plan: null | Plan;
        }>();
    });

    it('labels MFF Pro rows uncapped only when the caller opts out with a null plan', () => {
        expect(
            labelsFor({
                flat: [1000],
                percent: [],
                plan: null,
                positionSizing: mnqAtTen,
            }),
        ).toStrictEqual(['flat $1000 (50 MNQ = $1,000)']);
    });
});

describe('buildFundedCandidates refusals (typed, never thrown)', () => {
    it('refuses an explicit percent list without a stop as PercentNeedsStop', () => {
        expect(refusalFor({ flat: [150], percent: [10] })).toStrictEqual({
            kind: FundedCandidateRefusal.PercentNeedsStop,
            percent: [10],
        });
    });

    it('accepts an explicit percent list once a stop is given', () => {
        expect(
            labelsFor({ flat: [], percent: [10], positionSizing: mnqAtTen }),
        ).toStrictEqual(['10% cushion']);
    });

    it('refuses empty families as NoCandidates', () => {
        expect(refusalFor({ flat: [], percent: [] })).toStrictEqual({
            flatsBelowOneContract: [],
            kind: FundedCandidateRefusal.NoCandidates,
        });
    });

    it('lists the flats left out below one contract when nothing else is left', () => {
        expect(
            refusalFor({ flat: [150], percent: [], positionSizing: nqAtTen }),
        ).toStrictEqual({
            flatsBelowOneContract: [150],
            kind: FundedCandidateRefusal.NoCandidates,
        });
    });

    it('refuses a ladder rung below one NQ contract at a 10 point stop', () => {
        expect(
            refusalFor({
                flat: [],
                fundedLadder: [150, 400],
                percent: [],
                positionSizing: nqAtTen,
            }),
        ).toStrictEqual({
            kind: FundedCandidateRefusal.LadderRungBelowOneContract,
            ladder: [150, 400],
            positionSizing: nqAtTen,
            rungsBelowOneContract: [150],
        });
    });

    it('accepts a $55 rung as one ES contract at a 1.1 point stop and refuses $54.99', () => {
        expect(
            labelsFor({
                flat: [],
                fundedLadder: [55, 110],
                percent: [],
                positionSizing: esAtOnePointOne,
            }),
        ).toStrictEqual(['ladder 55/110 (1/2 ES = $55/$110)']);
        expect(
            refusalFor({
                flat: [],
                fundedLadder: [54.99, 110],
                percent: [],
                positionSizing: esAtOnePointOne,
            }),
        ).toStrictEqual({
            kind: FundedCandidateRefusal.LadderRungBelowOneContract,
            ladder: [54.99, 110],
            positionSizing: esAtOnePointOne,
            rungsBelowOneContract: [54.99],
        });
    });

    it('checks the percent family before the ladder, as the CLI did', () => {
        expect(
            refusalFor({
                flat: [],
                fundedLadder: [150, 400],
                percent: [10],
            }).kind,
        ).toBe(FundedCandidateRefusal.PercentNeedsStop);
    });

    it.each([
        { flat: [-5], fundedLadder: null },
        { flat: [NaN], fundedLadder: null },
        { flat: [150], fundedLadder: null, percent: [150] },
        { flat: [150], fundedLadder: [0, 100] },
        { flat: [150], fundedLadder: [100, 0, 50] },
        { flat: [150], fundedLadder: [] },
    ])(
        'refuses invalid lists %j as InvalidLists instead of throwing',
        (lists) => {
            expect(refusalFor({ ...lists, positionSizing: nqAtTen }).kind).toBe(
                FundedCandidateRefusal.InvalidLists,
            );
        },
    );
});

describe('buildFundedCandidates agrees with simInputsSizingIssue (WP40 parity)', () => {
    const dollars = [
        10, 20, 24.6, 24.61, 50, 50.01, 54.99, 55, 150, 199.99, 200, 250, 400,
    ];

    it.each([
        [InstrumentSymbol.NQ, 10],
        [InstrumentSymbol.MNQ, 10],
        [InstrumentSymbol.ES, 1.1],
        [InstrumentSymbol.ES, 1.0001],
        [InstrumentSymbol.MNQ, 12.301],
    ] as const)(
        'places a flat at %s %d points exactly when the shared check accepts it',
        (symbol, stopPoints) => {
            const build = builtFor({
                flat: dollars,
                percent: [],
                positionSizing: sizingAt(symbol, stopPoints),
            });
            const isAccepted = (dollar: number): boolean =>
                simInputsSizingIssue({
                    fundedRiskPerTrade: dollar,
                    instrument: symbol,
                    riskPerTrade: dollar,
                    stopPoints,
                }) === null;
            const accepted = dollars.filter((dollar) => isAccepted(dollar));
            expect(accepted.length).toBeGreaterThan(0);
            expect(accepted.length).toBeLessThan(dollars.length);
            expect(build.placedFlats).toStrictEqual(accepted);
            expect(build.flatsBelowOneContract).toStrictEqual(
                dollars.filter((dollar) => !isAccepted(dollar)),
            );
        },
    );
});

describe('funded candidate text', () => {
    it('builds the below-one-contract clause once', () => {
        expect(belowOneContractClause(nqAtTen)).toBe(
            "below one NQ contract's risk at a 10 point stop ($200)",
        );
    });

    it.each([
        { minimum: '$50.01', stopPoints: 1.0001, symbol: InstrumentSymbol.ES },
        {
            minimum: '$24.61',
            stopPoints: 12.301,
            symbol: InstrumentSymbol.MNQ,
        },
        { minimum: '$55', stopPoints: 1.1, symbol: InstrumentSymbol.ES },
    ])(
        'rounds the one-contract amount up to whole cents ($minimum)',
        ({ minimum, stopPoints, symbol }) => {
            expect(
                belowOneContractClause(sizingAt(symbol, stopPoints)),
            ).toContain(`point stop (${minimum})`);
        },
    );

    it('accepts a rung of exactly the rounded-up one-contract amount', () => {
        const [label] = labelsFor({
            flat: [],
            fundedLadder: [50.01, 200],
            percent: [],
            positionSizing: sizingAt(InstrumentSymbol.ES, 1.0001),
        });
        expect(label).toMatch(/^ladder 50\.01\/200 \(1\//);
    });

    it('words the flat note like the CLI and gives null when nothing is left out or there is no stop', () => {
        expect(flatsBelowOneContractNote([150, 199.99], nqAtTen)).toBe(
            "flat $150, $199.99 left out: below one NQ contract's risk at a 10 point stop ($200), and funded flat risk is rounded down to whole contracts, never up",
        );
        expect(flatsBelowOneContractNote([], nqAtTen)).toBeNull();
        expect(flatsBelowOneContractNote([150], null)).toBeNull();
    });

    it('words the ladder refusal without any flag name', () => {
        expect(ladderRungsBelowOneContractText([54.99], esAtOnePointOne)).toBe(
            "$54.99 below one ES contract's risk at a 1.1 point stop ($55), and funded ladder rungs are rounded down to whole contracts, never up. Raise the rung, or use a micro instrument or a tighter stop.",
        );
    });

    it('joins placements as contracts then whole-cent risks', () => {
        const positionSizing = sizingAt(InstrumentSymbol.MNQ, 12.3);
        const placed = [80, 50].map((dollar) =>
            placedFundedRiskAt(dollar, positionSizing),
        );
        expect(fundedPlacementText(placed, positionSizing)).toBe(
            '3/2 MNQ = $73.80/$49.20',
        );
    });

    it('notes a left-out flat, the whole-contract placement and the MFF Pro flats that collapse to one policy', () => {
        const plan = mffPlan(MffuVariant.Pro);
        const build = builtFor({
            flat: [10, 80, 150, 1000],
            percent: [],
            plan,
            positionSizing: mnqAtTen,
        });
        expect(fundedPlacementNotes(build, mnqAtTen, plan)).toStrictEqual([
            "flat $10 left out: below one MNQ contract's risk at a 10 point stop ($20), and funded flat risk is rounded down to whole contracts, never up",
            PLACEMENT_NOTE_AT_MNQ_TEN,
            'flat $150 and $1,000 place the same 5 MNQ = $100, so their rows are one policy',
        ]);
    });

    it('prints no collapse note on a tiered funded contract limit (Apex EOD)', () => {
        const plan = apexEodPlan();
        const build = builtFor({
            flat: [400, 500, 1000],
            percent: [],
            plan,
            positionSizing: mnqAtTen,
        });
        expect(fundedPlacementNotes(build, mnqAtTen, plan)).toStrictEqual([
            PLACEMENT_NOTE_AT_MNQ_TEN,
        ]);
    });
});
