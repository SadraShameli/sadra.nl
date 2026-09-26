import { describe, expect, expectTypeOf, it } from 'vitest';

import * as labMath from '~/app/(app)/prop-calculator/_components/lab/labMath';
import {
    dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
    EconomicsReason,
    evalPace,
    type EvalPace,
    MAX_WALK_WORK,
    type Quantity,
    requiredR,
    twoBarrierExpectedTrades,
    twoBarrierPassProbability,
    walkPassProbability,
} from '~/lib/prop-calculator/economics';

const FORTY_AT_ONE_TO_TWO_EXPECTED_TRADES = 59.51084082420812;

const videoFiftyFifty = { dd: 10, p: 0.5, rr: 1, target: 15 } as const;

const legacyLabPins = [
    { dd: 10, expected: 0.3999999402480675, p: 0.5, rr: 1, target: 15 },
    { dd: 10, expected: 0.8638443410402807, p: 0.4, rr: 2, target: 15 },
] as const;

interface ReferenceWalk {
    dd: number;
    down: number;
    p: number;
    target: number;
    up: number;
}

function denseReferenceWalk(walk: ReferenceWalk): {
    expectedTrades: number;
    passProbability: number;
} {
    const { dd, down, p, target, up } = walk;
    const size = target + dd - 1;
    const solve = (constant: (index: number) => number): number[] => {
        const matrix = Array.from({ length: size }, (_, row) => {
            const line = Array.from({ length: size + 1 }, () => 0);
            line[row] = 1;
            if (row + up < size) line[row + up] = -p;
            if (row >= down) line[row - down] = -(1 - p);
            line[size] = constant(row);
            return line;
        });
        for (let pivot = 0; pivot < size; pivot++) {
            let best = pivot;
            for (let row = pivot + 1; row < size; row++) {
                if (
                    Math.abs(matrix[row]?.[pivot] ?? 0) >
                    Math.abs(matrix[best]?.[pivot] ?? 0)
                ) {
                    best = row;
                }
            }
            const swap = matrix[pivot] ?? [];
            matrix[pivot] = matrix[best] ?? [];
            matrix[best] = swap;
            const pivotRow = matrix[pivot] ?? [];
            for (let row = 0; row < size; row++) {
                if (row === pivot) continue;
                const line = matrix[row] ?? [];
                const factor = (line[pivot] ?? 0) / (pivotRow[pivot] ?? 1);
                if (factor === 0) continue;
                for (let column = pivot; column <= size; column++) {
                    line[column] =
                        (line[column] ?? 0) - factor * (pivotRow[column] ?? 0);
                }
            }
        }
        return matrix.map((line, row) => (line[size] ?? 0) / (line[row] ?? 1));
    };
    const start = dd - 1;
    return {
        expectedTrades: solve(() => 1)[start] ?? NaN,
        passProbability:
            solve((row) => (row + up >= size ? p : 0))[start] ?? NaN,
    };
}

function unitStepExpectedTrades(p: number, z: number, n: number): number {
    const q = 1 - p;
    return z / (q - p) - (n / (q - p)) * unitStepPassProbability(p, z, n);
}

function unitStepPassProbability(p: number, z: number, n: number): number {
    const ratio = (1 - p) / p;
    return (1 - ratio ** z) / (1 - ratio ** n);
}

describe('twoBarrierPassProbability (lifted from labMath, now an exact solve)', () => {
    it.each(legacyLabPins)(
        'keeps the lab value at p $p, 1:$rr, target $target, drawdown $dd to 6 digits',
        ({ dd, expected, p, rr, target }) => {
            expect(twoBarrierPassProbability(p, rr, target, dd)).toBeCloseTo(
                expected,
                6,
            );
            expect(labMath.gamblersRuinAsymmetric(p, rr, target, dd)).toBe(
                twoBarrierPassProbability(p, rr, target, dd),
            );
        },
    );

    it('replaces the lab 1:1.5 pin, which rounded 1:1.5 to 1:2, with the exact half-R walk', () => {
        const exact = denseReferenceWalk({
            dd: 18,
            down: 2,
            p: 0.55,
            target: 25,
            up: 3,
        }).passProbability;
        expect(twoBarrierPassProbability(0.55, 1.5, 12.4, 8.6)).toBeCloseTo(
            exact,
            9,
        );
        expect(
            Math.abs(
                twoBarrierPassProbability(0.55, 1.5, 12.4, 8.6) -
                    0.9964986701483333,
            ),
        ).toBeGreaterThan(1e-4);
    });

    it('is the same function the lab imports, not a copy', () => {
        expect(labMath.gamblersRuinAsymmetric).toBe(twoBarrierPassProbability);
    });

    it('gives the video 50/50 case (1:1, target 15, drawdown 10) exactly a 40% pass probability', () => {
        const { dd, p, rr, target } = videoFiftyFifty;
        expect(twoBarrierPassProbability(p, rr, target, dd)).toBeCloseTo(
            0.4,
            12,
        );
    });

    it('matches the unit-step gambler ruin closed form at 60% and 1:1', () => {
        expect(twoBarrierPassProbability(0.6, 1, 15, 10)).toBeCloseTo(
            unitStepPassProbability(0.6, 10, 25),
            12,
        );
    });

    it.each([
        [60, 40],
        [75, 50],
        [120, 80],
        [150, 100],
    ])(
        'converges on a fine %i/%i-unit grid at 50/50 and 1:1 to drawdown / (target + drawdown) = 0.4',
        (target, dd) => {
            expect(twoBarrierPassProbability(0.5, 1, target, dd)).toBeCloseTo(
                0.4,
                9,
            );
        },
    );

    it('matches the closed form at 52% and 1:1 on a 60/40-unit grid', () => {
        expect(twoBarrierPassProbability(0.52, 1, 60, 40)).toBeCloseTo(
            unitStepPassProbability(0.52, 40, 100),
            9,
        );
    });

    it('walks 1:0.5 on a half-R grid, so 60% at 1:0.5 (a negative edge) rarely passes', () => {
        const exact = denseReferenceWalk({
            dd: 20,
            down: 2,
            p: 0.6,
            target: 30,
            up: 1,
        }).passProbability;
        expect(exact).toBeLessThan(0.01);
        expect(twoBarrierPassProbability(0.6, 0.5, 15, 10)).toBeCloseTo(
            exact,
            9,
        );
    });

    it('walks 1:1.5 on a half-R grid, so a zero-edge 40% is about 0.4 and not the 1:2 value', () => {
        const exact = denseReferenceWalk({
            dd: 20,
            down: 2,
            p: 0.4,
            target: 30,
            up: 3,
        }).passProbability;
        expect(exact).toBeGreaterThan(0.39);
        expect(exact).toBeLessThan(0.41);
        expect(twoBarrierPassProbability(0.4, 1.5, 15, 10)).toBeCloseTo(
            exact,
            9,
        );
    });

    it('puts a fractional barrier on the first grid point at or past it, never the nearest one', () => {
        const exact = denseReferenceWalk({
            dd: 3,
            down: 1,
            p: 0.4,
            target: 4,
            up: 2,
        }).passProbability;
        expect(
            twoBarrierPassProbability(0.4, 2, 3000 / 900, 2000 / 900),
        ).toBeCloseTo(exact, 12);
    });

    it('is not a number on a grid too large to hold in memory, never a drifted value (0.39859 against an exact 0.4)', () => {
        expect(
            twoBarrierPassProbability(0.5, 1, 30_000_000, 20_000_000),
        ).toBeNaN();
        expect(
            twoBarrierExpectedTrades(0.5, 1, 30_000_000, 20_000_000),
        ).toBeNaN();
    });

    it('is not a number when the reward:risk has no whole-number ratio with a small denominator', () => {
        expect(twoBarrierPassProbability(0.5, Math.PI, 15, 10)).toBeNaN();
    });
});

describe('twoBarrierExpectedTrades', () => {
    it('gives the video 50/50 case 150 expected trades (drawdown x target)', () => {
        const { dd, p, rr, target } = videoFiftyFifty;
        expect(twoBarrierExpectedTrades(p, rr, target, dd)).toBeCloseTo(150, 6);
    });

    it('matches the unit-step gambler ruin closed form at 60% and 1:1', () => {
        expect(twoBarrierExpectedTrades(0.6, 1, 15, 10)).toBeCloseTo(
            unitStepExpectedTrades(0.6, 10, 25),
            6,
        );
    });

    it('pins 40% at 1:2 on the same grid from the solver', () => {
        expect(twoBarrierExpectedTrades(0.4, 2, 15, 10)).toBeCloseTo(
            FORTY_AT_ONE_TO_TWO_EXPECTED_TRADES,
            6,
        );
    });

    it('matches the exact half-R walk at 1:0.5 and 1:1.5', () => {
        for (const [rr, up] of [
            [0.5, 1],
            [1.5, 3],
        ] as const) {
            expect(twoBarrierExpectedTrades(0.6, rr, 15, 10)).toBeCloseTo(
                denseReferenceWalk({ dd: 20, down: 2, p: 0.6, target: 30, up })
                    .expectedTrades,
                6,
            );
        }
    });

    it('walks straight down the drawdown when every trade loses', () => {
        expect(twoBarrierExpectedTrades(0, 2, 15, 10)).toBeCloseTo(10, 9);
    });

    it('climbs straight to the target when every trade wins', () => {
        expect(twoBarrierExpectedTrades(1, 2, 15, 10)).toBeCloseTo(8, 9);
    });

    it('needs no trade when the target or the drawdown is already gone', () => {
        expect(twoBarrierExpectedTrades(0.5, 1, 0, 10)).toBe(0);
        expect(twoBarrierExpectedTrades(0.5, 1, 15, 0)).toBe(0);
    });
});

describe('requiredR', () => {
    it('is target / risk per trade: 3000 at 200 needs 15R', () => {
        expect(requiredR(dollars(3000), dollars(200)).value).toBeCloseTo(
            15,
            12,
        );
    });

    it('refuses a non-positive risk', () => {
        expect(requiredR(dollars(3000), dollars(0)).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('evalPace', () => {
    it('reports required R, P(pass) and trades until pass or bust in units of risk, labelled a random-walk approximation', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(200),
            rrRatio: 1,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.value?.requiredR).toBeCloseTo(15, 12);
        expect(pace.value?.passProbability).toBeCloseTo(0.4, 9);
        expect(pace.value?.expectedTradesUntilPassOrBust).toBeCloseTo(150, 6);
        expect(pace.disclosures).toContain(
            EconomicsDisclosure.RandomWalkApproximation,
        );
    });

    it('brands the pass probability as a fraction', () => {
        expectTypeOf<
            EvalPace['passProbability']
        >().toEqualTypeOf<Fraction0to1>();
    });

    it('agrees on P(pass) and trades on a fine grid: 3,000 target, 2,000 drawdown, 50 risk', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(50),
            rrRatio: 1,
            target: dollars(3000),
            winrate: fraction(0.5),
        }).value;
        expect(pace?.passProbability).toBeCloseTo(0.4, 9);
        expect(pace?.expectedTradesUntilPassOrBust).toBeCloseTo(2400, 5);
    });

    it('models a 1:0.5 strategy as 1:0.5, not 1:1', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(200),
            rrRatio: 0.5,
            target: dollars(3000),
            winrate: fraction(0.6),
        }).value;
        expect(pace?.passProbability).toBeLessThan(0.01);
    });

    it('refuses a reward:risk it cannot put on a whole-unit grid with UnsupportedRatio', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(200),
            rrRatio: Math.PI,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.value).toBeNull();
        expect(pace.reason).toBe(EconomicsReason.UnsupportedRatio);
    });

    it('solves a two-decimal reward:risk on a realistic eval exactly (1:1.37, 100 risk on 3,000 / 2,000)', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(100),
            rrRatio: 1.37,
            target: dollars(3000),
            winrate: fraction(0.45),
        }).value;
        expect(pace?.passProbability).toBeGreaterThan(0);
        expect(pace?.passProbability).toBeLessThan(1);
        expect(pace?.passProbability).toBeCloseTo(
            twoBarrierPassProbability(0.45, 1.37, 30, 20),
            12,
        );
    });

    it('refuses a grid too large to solve quickly with WalkGridTooLarge', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(1),
            rrRatio: 1.37,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.value).toBeNull();
        expect(pace.reason).toBe(EconomicsReason.WalkGridTooLarge);
    });

    it('refuses a 50 million row grid (1:1, 3,000 / 2,000 at 0.0001 risk, about 1.6 GB) with WalkGridTooLarge instead of solving it', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(0.0001),
            rrRatio: 1,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.value).toBeNull();
        expect(pace.reason).toBe(EconomicsReason.WalkGridTooLarge);
    });

    it('refuses a wide band grid (1:50 on a million rows) that stays under the work limit but not the memory limit', () => {
        const rows = 1_000_000;
        expect(rows * 1 * (50 + 1)).toBeLessThan(MAX_WALK_WORK);
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(0.005),
            rrRatio: 50,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.value).toBeNull();
        expect(pace.reason).toBe(EconomicsReason.WalkGridTooLarge);
    });

    it('refuses a 1:1 grid just over the memory limit (1.25 million rows at 0.004 risk)', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(0.004),
            rrRatio: 1,
            target: dollars(3000),
            winrate: fraction(0.5),
        });
        expect(pace.reason).toBe(EconomicsReason.WalkGridTooLarge);
    });

    it('keeps the exact answer on a large supported 1:1 grid (half a million rows at 0.01 risk)', () => {
        const pace = evalPace({
            drawdown: dollars(2000),
            riskPerTrade: dollars(0.01),
            rrRatio: 1,
            target: dollars(3000),
            winrate: fraction(0.5),
        }).value;
        expect(pace?.passProbability).toBeCloseTo(0.4, 6);
    });

    it('says the walk ignores the firm rules and the simulated figures stay authoritative', () => {
        const text =
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ];
        expect(text).toContain('consistency rule');
        expect(text).toContain('daily loss limit');
        expect(text).toContain('contract limits');
        expect(text).toContain(
            'the simulated pass rate and trades per pass stay authoritative',
        );
    });

    it.each([
        { riskPerTrade: 0 },
        { winrate: 1.5 },
        { rrRatio: 0 },
        { drawdown: -1 },
    ])('refuses %o', (override) => {
        const inputs = {
            drawdown: 2000,
            riskPerTrade: 200,
            rrRatio: 1,
            target: 3000,
            winrate: 0.5,
            ...override,
        };
        expect(
            evalPace({
                drawdown: dollars(inputs.drawdown),
                riskPerTrade: dollars(inputs.riskPerTrade),
                rrRatio: inputs.rrRatio,
                target: dollars(inputs.target),
                winrate: fraction(inputs.winrate),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});

function fortyAtOneToTwoPassAt(drawdown: number): Fraction0to1 | null {
    return walkPassProbability({
        drawdown: dollars(drawdown),
        riskPerTrade: dollars(300),
        rrRatio: 2,
        target: dollars(3000),
        winrate: fraction(0.4),
    }).value;
}

describe('walkPassProbability', () => {
    const fiftyFiftyEval = {
        drawdown: dollars(2000),
        riskPerTrade: dollars(200),
        rrRatio: 1,
        target: dollars(3000),
        winrate: fraction(0.5),
    };

    it('gives the pass probability of the exact walk, labelled a random-walk approximation', () => {
        const pass = walkPassProbability(fiftyFiftyEval);
        expect(pass.reason).toBeNull();
        expect(pass.value).toBeCloseTo(0.4, 9);
        expect(pass.disclosures).toStrictEqual([
            EconomicsDisclosure.RandomWalkApproximation,
        ]);
    });

    it('solves a drawdown between two multiples of the risk as the next multiple, the optimism its disclosure states', () => {
        const justAboveSixRisks = fortyAtOneToTwoPassAt(1801);
        expect(justAboveSixRisks).not.toBeNull();
        expect(justAboveSixRisks).toBe(fortyAtOneToTwoPassAt(2100));
        expect(fortyAtOneToTwoPassAt(1800)).toBeLessThan(
            justAboveSixRisks ?? NaN,
        );
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ],
        ).toContain(
            'optimistic when the drawdown is not a whole multiple of the risk',
        );
    });

    it('brands the pass probability as a fraction', () => {
        expectTypeOf(walkPassProbability).returns.toEqualTypeOf<
            Quantity<Fraction0to1>
        >();
    });

    it.each([
        { name: 'the 50/50 eval', override: {} },
        { name: '40% at 1:2', override: { rrRatio: 2, winrate: 0.4 } },
        {
            name: 'a two-decimal 1:1.37 at 100 risk',
            override: { riskPerTrade: 100, rrRatio: 1.37, winrate: 0.45 },
        },
        {
            name: 'a 1:0.5 negative edge',
            override: { rrRatio: 0.5, winrate: 0.6 },
        },
        { name: 'a target already reached', override: { target: 0 } },
        { name: 'a strategy that never wins', override: { winrate: 0 } },
        { name: 'a strategy that always wins', override: { winrate: 1 } },
        { name: 'an unrepresentable 1:pi', override: { rrRatio: Math.PI } },
        {
            name: 'a grid too large at 0.0001 risk',
            override: { riskPerTrade: 0.0001 },
        },
        { name: 'a zero risk', override: { riskPerTrade: 0 } },
        { name: 'a negative risk', override: { riskPerTrade: -200 } },
        { name: 'a winrate above one', override: { winrate: 1.5 } },
        { name: 'a zero reward:risk', override: { rrRatio: 0 } },
        { name: 'a negative drawdown', override: { drawdown: -1 } },
        { name: 'a negative target', override: { target: -1 } },
        {
            name: 'a non-finite drawdown',
            override: { drawdown: Infinity },
        },
    ])(
        'validates like evalPace and gives its pass probability or reason for $name',
        ({ override }) => {
            const raw = {
                drawdown: 2000,
                riskPerTrade: 200,
                rrRatio: 1,
                target: 3000,
                winrate: 0.5,
                ...override,
            };
            const inputs = {
                drawdown: dollars(raw.drawdown),
                riskPerTrade: dollars(raw.riskPerTrade),
                rrRatio: raw.rrRatio,
                target: dollars(raw.target),
                winrate: fraction(raw.winrate),
            };
            const pace = evalPace(inputs);
            expect(walkPassProbability(inputs)).toStrictEqual(
                pace.value === null
                    ? {
                          disclosures: pace.disclosures,
                          reason: pace.reason,
                          value: null,
                      }
                    : {
                          disclosures: pace.disclosures,
                          reason: null,
                          value: pace.value.passProbability,
                      },
            );
        },
    );
});
