import { describe, expect, it } from 'vitest';

import { FundedCushionGrid } from '~/lib/prop-calculator/core/FundedCushionGrid';

function dollarsOf(grid: FundedCushionGrid): number[] {
    return Array.from({ length: grid.size }, (_, index) =>
        grid.dollarsAt(index),
    );
}

describe('FundedCushionGrid', () => {
    describe("tail off (uniform, today's behaviour)", () => {
        const grid = new FundedCushionGrid({ fineStep: 100, fineTop: 600 });

        it('is a plain uniform grid up to the fine top', () => {
            expect(dollarsOf(grid)).toStrictEqual([
                0, 100, 200, 300, 400, 500, 600,
            ]);
            expect(grid.size).toBe(7);
        });

        it('rejects an out-of-range index', () => {
            expect(() => grid.dollarsAt(-1)).toThrow(RangeError);
            expect(() => grid.dollarsAt(7)).toThrow(RangeError);
        });

        it('splits an exact cell dollar value with no upper weight', () => {
            expect(grid.split(0)).toStrictEqual({
                lowerIndex: 0,
                upperWeight: 0,
            });
            expect(grid.split(300)).toStrictEqual({
                lowerIndex: 3,
                upperWeight: 0,
            });
            expect(grid.split(600)).toStrictEqual({
                lowerIndex: 6,
                upperWeight: 0,
            });
        });

        it('splits a midpoint between two cells with a 0.5 weight', () => {
            expect(grid.split(250)).toStrictEqual({
                lowerIndex: 2,
                upperWeight: 0.5,
            });
        });

        it('splits a quarter-of-the-way point with a 0.25 weight', () => {
            expect(grid.split(325)).toStrictEqual({
                lowerIndex: 3,
                upperWeight: 0.25,
            });
        });

        it('clamps a negative dollar value to the bottom cell with no weight', () => {
            expect(grid.split(-50)).toStrictEqual({
                lowerIndex: 0,
                upperWeight: 0,
            });
        });

        it('clamps a value at or above the top to the top cell with no weight', () => {
            expect(grid.split(600)).toStrictEqual({
                lowerIndex: 6,
                upperWeight: 0,
            });
            expect(grid.split(10_000)).toStrictEqual({
                lowerIndex: 6,
                upperWeight: 0,
            });
        });

        it('clamps to a bucketCount narrower than the grid itself', () => {
            expect(grid.split(550, 4)).toStrictEqual({
                lowerIndex: 3,
                upperWeight: 0,
            });
            expect(grid.floorIndex(550, 4)).toBe(3);
        });

        it('floors to the lower cell with no weight information', () => {
            expect(grid.floorIndex(0)).toBe(0);
            expect(grid.floorIndex(249)).toBe(2);
            expect(grid.floorIndex(250)).toBe(2);
            expect(grid.floorIndex(-10)).toBe(0);
            expect(grid.floorIndex(10_000)).toBe(6);
        });

        it('round-trips every cell index through split and dollarsAt', () => {
            for (let index = 0; index < grid.size; index++) {
                const dollarsValue = grid.dollarsAt(index);
                expect(grid.split(dollarsValue)).toStrictEqual({
                    lowerIndex: index,
                    upperWeight: 0,
                });
            }
        });

        it('round-trips every midpoint between adjacent cells', () => {
            for (let index = 0; index < grid.size - 1; index++) {
                const midpoint =
                    (grid.dollarsAt(index) + grid.dollarsAt(index + 1)) / 2;
                expect(grid.split(midpoint)).toStrictEqual({
                    lowerIndex: index,
                    upperWeight: 0.5,
                });
            }
        });

        it('round-trips an exact dollar value through roundToIndex', () => {
            for (let index = 0; index < grid.size; index++) {
                expect(grid.roundToIndex(grid.dollarsAt(index))).toBe(index);
            }
        });
    });

    describe('a coarse tail', () => {
        const grid = new FundedCushionGrid({
            fineStep: 100,
            fineTop: 300,
            tailStep: 500,
            tailTop: 1800,
        });

        it('steps finely up to the fine top, then coarsely to the tail top', () => {
            expect(dollarsOf(grid)).toStrictEqual([
                0, 100, 200, 300, 800, 1300, 1800,
            ]);
            expect(grid.size).toBe(7);
        });

        it('splits inside the fine range using the fine step', () => {
            expect(grid.split(150)).toStrictEqual({
                lowerIndex: 1,
                upperWeight: 0.5,
            });
        });

        it('splits inside the coarse tail using the tail step', () => {
            expect(grid.split(1050)).toStrictEqual({
                lowerIndex: 4,
                upperWeight: 0.5,
            });
            expect(grid.split(800)).toStrictEqual({
                lowerIndex: 4,
                upperWeight: 0,
            });
        });

        it('splits exactly at the fine-to-tail boundary using the fine cell', () => {
            expect(grid.split(300)).toStrictEqual({
                lowerIndex: 3,
                upperWeight: 0,
            });
        });

        it('clamps at or above the tail top to the top cell', () => {
            expect(grid.split(1800)).toStrictEqual({
                lowerIndex: 6,
                upperWeight: 0,
            });
            expect(grid.split(50_000)).toStrictEqual({
                lowerIndex: 6,
                upperWeight: 0,
            });
        });

        it('round-trips every cell and every midpoint across both ranges', () => {
            for (let index = 0; index < grid.size; index++) {
                const dollarsValue = grid.dollarsAt(index);
                expect(grid.split(dollarsValue)).toStrictEqual({
                    lowerIndex: index,
                    upperWeight: 0,
                });
                expect(grid.roundToIndex(dollarsValue)).toBe(index);
            }
            for (let index = 0; index < grid.size - 1; index++) {
                const midpoint =
                    (grid.dollarsAt(index) + grid.dollarsAt(index + 1)) / 2;
                expect(grid.split(midpoint)).toStrictEqual({
                    lowerIndex: index,
                    upperWeight: 0.5,
                });
            }
        });
    });

    describe('summary', () => {
        it('reports a tail-off grid with its fine top as the only top', () => {
            expect(
                new FundedCushionGrid({
                    fineStep: 100,
                    fineTop: 600,
                }).summary(),
            ).toStrictEqual({
                fineStepDollars: 100,
                fineTopDollars: 600,
                tailStepDollars: 100,
                tailTopDollars: 600,
            });
        });

        it('reports the real top when the tail step does not divide the tail range, not the requested top', () => {
            const grid = new FundedCushionGrid({
                fineStep: 100,
                fineTop: 600,
                tailStep: 400,
                tailTop: 1500,
            });
            expect(grid.summary().tailTopDollars).toBe(1400);
            expect(grid.dollarsAt(grid.size - 1)).toBe(1400);
        });

        it('reports a tail that collapsed to no cells as ending at the fine top', () => {
            const grid = new FundedCushionGrid({
                fineStep: 100,
                fineTop: 300,
                tailStep: 2000,
                tailTop: 1000,
            });
            expect(grid.size).toBe(4);
            expect(grid.summary()).toStrictEqual({
                fineStepDollars: 100,
                fineTopDollars: 300,
                tailStepDollars: 2000,
                tailTopDollars: 300,
            });
        });

        it('reports a coarse tail with both steps and both tops', () => {
            expect(
                new FundedCushionGrid({
                    fineStep: 100,
                    fineTop: 300,
                    tailStep: 500,
                    tailTop: 1800,
                }).summary(),
            ).toStrictEqual({
                fineStepDollars: 100,
                fineTopDollars: 300,
                tailStepDollars: 500,
                tailTopDollars: 1800,
            });
        });
    });

    describe('validation', () => {
        it('rejects a non-finite bound or step', () => {
            expect(
                () =>
                    new FundedCushionGrid({ fineStep: Infinity, fineTop: 100 }),
            ).toThrow();
            expect(
                () => new FundedCushionGrid({ fineStep: 100, fineTop: NaN }),
            ).toThrow();
        });

        it('rejects a non-positive fine or tail step', () => {
            expect(
                () => new FundedCushionGrid({ fineStep: 0, fineTop: 100 }),
            ).toThrow();
            expect(
                () =>
                    new FundedCushionGrid({
                        fineStep: 100,
                        fineTop: 300,
                        tailStep: -50,
                        tailTop: 1000,
                    }),
            ).toThrow();
        });

        it('rejects a negative fine top', () => {
            expect(
                () => new FundedCushionGrid({ fineStep: 100, fineTop: -100 }),
            ).toThrow();
        });

        it('rejects a tail step finer than the fine step, naming both steps', () => {
            expect(
                () =>
                    new FundedCushionGrid({
                        fineStep: 100,
                        fineTop: 300,
                        tailStep: 50,
                        tailTop: 1000,
                    }),
            ).toThrow(/tailStep \(50\) must be at least fineStep \(100\)/);
        });

        it('accepts a tail step equal to the fine step and one coarser than it', () => {
            expect(
                new FundedCushionGrid({
                    fineStep: 100,
                    fineTop: 300,
                    tailStep: 100,
                    tailTop: 1000,
                }).size,
            ).toBe(11);
            expect(
                new FundedCushionGrid({
                    fineStep: 100,
                    fineTop: 300,
                    tailStep: 700,
                    tailTop: 1000,
                }).size,
            ).toBe(5);
        });

        it('accepts a tail step finer than the fine step when there is no tail to apply it to, because the guard protects only the tail region', () => {
            expect(
                new FundedCushionGrid({
                    fineStep: 200,
                    fineTop: 600,
                    tailStep: 100,
                    tailTop: 600,
                }).size,
            ).toBe(4);
            expect(
                new FundedCushionGrid({
                    fineStep: 200,
                    fineTop: 600,
                    tailStep: 100,
                }).size,
            ).toBe(4);
        });

        it('still rejects a finer tail step as soon as the tail has any extent', () => {
            expect(
                () =>
                    new FundedCushionGrid({
                        fineStep: 200,
                        fineTop: 600,
                        tailStep: 100,
                        tailTop: 700,
                    }),
            ).toThrow(/tailStep \(100\) must be at least fineStep \(200\)/);
        });

        it('rejects a tail top below the fine top', () => {
            expect(
                () =>
                    new FundedCushionGrid({
                        fineStep: 100,
                        fineTop: 600,
                        tailStep: 500,
                        tailTop: 300,
                    }),
            ).toThrow();
        });
    });
});
