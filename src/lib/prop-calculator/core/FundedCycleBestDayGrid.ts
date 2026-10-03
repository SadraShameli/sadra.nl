import { BUCKET_EPSILON } from './constants';

interface FundedCycleBestDayGridOptions {
    readonly cushionStepDollars: number;
    readonly isTracked: boolean;
    readonly overflowDollars: number;
    readonly relevantBestDayDollars: number;
    readonly requestedBucketCount: number | undefined;
}

export class FundedCycleBestDayGrid {
    private readonly overflowBucketDollars: number;
    private readonly realBucketCount: number;

    readonly keyRadix: number;
    readonly stepDollars: number;

    constructor(options: FundedCycleBestDayGridOptions) {
        const {
            cushionStepDollars,
            isTracked,
            overflowDollars,
            relevantBestDayDollars,
            requestedBucketCount,
        } = options;
        if (
            !Number.isFinite(cushionStepDollars) ||
            cushionStepDollars <= 0 ||
            !Number.isFinite(relevantBestDayDollars) ||
            !Number.isFinite(overflowDollars)
        ) {
            throw new Error(
                `FundedCycleBestDayGrid: the step must be positive and every dollar figure finite, got step ${cushionStepDollars}, relevant best day ${relevantBestDayDollars} and overflow ${overflowDollars}`,
            );
        }
        const exactBucketCount =
            Math.floor(
                Math.max(0, relevantBestDayDollars) / cushionStepDollars +
                    BUCKET_EPSILON,
            ) + 2;
        if (!isTracked) {
            this.realBucketCount = 1;
            this.stepDollars = cushionStepDollars;
        } else if (requestedBucketCount === undefined) {
            this.realBucketCount = exactBucketCount;
            this.stepDollars = cushionStepDollars;
        } else {
            if (
                !Number.isFinite(requestedBucketCount) ||
                Math.floor(requestedBucketCount) < 1
            ) {
                throw new Error(
                    `FundedCycleBestDayGrid: a tracked best day needs a finite bucket count of at least 1, got ${requestedBucketCount}`,
                );
            }
            this.realBucketCount = Math.floor(requestedBucketCount);
            this.stepDollars =
                this.realBucketCount === 1
                    ? cushionStepDollars
                    : cushionStepDollars *
                      Math.max(
                          1,
                          Math.ceil(
                              (exactBucketCount - 1) /
                                  (this.realBucketCount - 1),
                          ),
                      );
        }
        this.keyRadix = isTracked ? this.realBucketCount + 1 : 1;
        this.overflowBucketDollars = Math.max(
            overflowDollars,
            (this.realBucketCount - 1) * this.stepDollars + this.stepDollars,
        );
    }

    dollarsAt(index: number): number {
        if (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index > this.keyRadix - 1
        ) {
            throw new RangeError(
                `FundedCycleBestDayGrid: index ${index} is outside 0..${this.keyRadix - 1}`,
            );
        }
        return index === this.realBucketCount
            ? this.overflowBucketDollars
            : index * this.stepDollars;
    }

    indexAtOrAbove(dollarsValue: number): number {
        if (this.keyRadix === 1) return 0;
        const raw = Math.max(
            0,
            Math.ceil((dollarsValue - BUCKET_EPSILON) / this.stepDollars),
        );
        return Math.min(this.realBucketCount, raw);
    }
}
