import { BUCKET_EPSILON } from './constants';

export interface CushionGridSplit {
    readonly lowerIndex: number;
    readonly upperWeight: number;
}

export interface FundedCushionGridOptions {
    readonly fineStep: number;
    readonly fineTop: number;
    readonly tailStep?: number;
    readonly tailTop?: number;
}

export interface FundedCushionGridSummary {
    readonly fineStepDollars: number;
    readonly fineTopDollars: number;
    readonly tailStepDollars: number;
    readonly tailTopDollars: number;
}

interface CushionGridCell {
    readonly cellStart: number;
    readonly cellStep: number;
    readonly rawIndex: number;
}

export class FundedCushionGrid {
    private readonly fineCount: number;
    private readonly fineStep: number;
    private readonly fineTop: number;
    private readonly tailStep: number;
    private readonly tailTop: number;

    readonly size: number;

    constructor(options: FundedCushionGridOptions) {
        const { fineStep, fineTop } = options;
        const tailStep = options.tailStep ?? fineStep;
        const tailTop = options.tailTop ?? fineTop;
        if (
            [fineStep, fineTop, tailStep, tailTop].some(
                (value) => !Number.isFinite(value),
            )
        ) {
            throw new Error(
                'FundedCushionGrid: every bound and step must be finite',
            );
        }
        if (fineStep <= 0 || tailStep <= 0) {
            throw new Error(
                `FundedCushionGrid: each step must be positive, got fineStep ${fineStep} and tailStep ${tailStep}`,
            );
        }
        if (
            tailTop > fineTop + BUCKET_EPSILON &&
            tailStep < fineStep - BUCKET_EPSILON
        ) {
            throw new Error(
                `FundedCushionGrid: tailStep (${tailStep}) must be at least fineStep (${fineStep}), because the day tree's windowed search bounds are computed from the fine step and applied as raw grid-index deltas in the tail too, so a finer tail step would under-cover the reachable range there`,
            );
        }
        if (fineTop < 0) {
            throw new Error(
                `FundedCushionGrid: fineTop must be non-negative, got ${fineTop}`,
            );
        }
        if (tailTop < fineTop - BUCKET_EPSILON) {
            throw new Error(
                `FundedCushionGrid: tailTop (${tailTop}) must not be below fineTop (${fineTop})`,
            );
        }
        this.fineStep = fineStep;
        this.fineTop = fineTop;
        this.tailStep = tailStep;
        this.tailTop = tailTop;
        this.fineCount = Math.round(fineTop / fineStep);
        const tailCount =
            tailTop <= fineTop + BUCKET_EPSILON
                ? 0
                : Math.round((tailTop - fineTop) / tailStep);
        this.size = this.fineCount + tailCount + 1;
    }

    private locate(dollarsValue: number): CushionGridCell {
        if (dollarsValue <= this.fineTop + BUCKET_EPSILON) {
            const raw = Math.floor(
                (dollarsValue + BUCKET_EPSILON) / this.fineStep,
            );
            return {
                cellStart: raw * this.fineStep,
                cellStep: this.fineStep,
                rawIndex: raw,
            };
        }
        const offset = dollarsValue - this.fineTop;
        const raw = Math.floor((offset + BUCKET_EPSILON) / this.tailStep);
        return {
            cellStart: this.fineTop + raw * this.tailStep,
            cellStep: this.tailStep,
            rawIndex: this.fineCount + raw,
        };
    }

    dollarsAt(index: number): number {
        if (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index > this.size - 1
        ) {
            throw new RangeError(
                `FundedCushionGrid: index ${index} is outside 0..${this.size - 1}`,
            );
        }
        return index <= this.fineCount
            ? index * this.fineStep
            : this.fineTop + (index - this.fineCount) * this.tailStep;
    }

    floorIndex(dollarsValue: number, bucketCount: number = this.size): number {
        return this.split(dollarsValue, bucketCount).lowerIndex;
    }

    roundToIndex(dollarsValue: number): number {
        return dollarsValue <= this.fineTop + BUCKET_EPSILON
            ? Math.round(dollarsValue / this.fineStep)
            : this.fineCount +
                  Math.round((dollarsValue - this.fineTop) / this.tailStep);
    }

    split(
        dollarsValue: number,
        bucketCount: number = this.size,
    ): CushionGridSplit {
        const maxIndex = bucketCount - 1;
        const { cellStart, cellStep, rawIndex } = this.locate(dollarsValue);
        if (rawIndex >= maxIndex) {
            return { lowerIndex: maxIndex, upperWeight: 0 };
        }
        if (rawIndex < 0) return { lowerIndex: 0, upperWeight: 0 };
        const remainder = dollarsValue - cellStart;
        return {
            lowerIndex: rawIndex,
            upperWeight: remainder > BUCKET_EPSILON ? remainder / cellStep : 0,
        };
    }

    summary(): FundedCushionGridSummary {
        return {
            fineStepDollars: this.fineStep,
            fineTopDollars: this.fineTop,
            tailStepDollars: this.tailStep,
            tailTopDollars: this.dollarsAt(this.size - 1),
        };
    }
}
