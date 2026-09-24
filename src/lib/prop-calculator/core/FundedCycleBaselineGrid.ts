import { BUCKET_EPSILON } from './constants';

interface FundedCycleBaselineGridOptions {
    readonly coarseStep: number;
    readonly fineEnd: number;
    readonly fineStep: number;
    readonly max: number;
    readonly min: number;
}

export class FundedCycleBaselineGrid {
    private readonly levels: readonly number[];

    readonly size: number;

    constructor(options: FundedCycleBaselineGridOptions) {
        const { coarseStep, fineEnd, fineStep, max, min } = options;
        if (
            [coarseStep, fineEnd, fineStep, max, min].some(
                (value) => !Number.isFinite(value),
            )
        ) {
            throw new Error(
                'FundedCycleBaselineGrid: every bound and step must be finite',
            );
        }
        if (fineStep <= 0 || coarseStep <= 0) {
            throw new Error(
                `FundedCycleBaselineGrid: each step must be positive, got fineStep ${fineStep} and coarseStep ${coarseStep}`,
            );
        }
        if (min > max) {
            throw new Error(
                `FundedCycleBaselineGrid: min (${min}) must not exceed max (${max})`,
            );
        }
        const levels = [min];
        let last = min;
        while (last < max - BUCKET_EPSILON) {
            last += last < fineEnd - BUCKET_EPSILON ? fineStep : coarseStep;
            levels.push(last);
        }
        this.levels = levels;
        this.size = levels.length;
    }

    dollarsAt(index: number): number {
        const level = this.levels[index];
        if (level === undefined) {
            throw new RangeError(
                `FundedCycleBaselineGrid: index ${index} is outside 0..${this.size - 1}`,
            );
        }
        return level;
    }

    indexAtOrAbove(dollarsValue: number): number {
        const index = this.levels.findIndex(
            (level) => level >= dollarsValue - BUCKET_EPSILON,
        );
        return index === -1 ? this.size - 1 : index;
    }
}
