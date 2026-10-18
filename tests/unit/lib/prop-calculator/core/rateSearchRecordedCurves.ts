import { type RateProbe } from '~/lib/prop-calculator/core/AverageRewardSolver';

export interface RecordedCurve {
    readonly maxCycleDays: number;
    readonly minCycleDays: number;
    readonly name: string;
    readonly points: readonly RecordedPoint[];
}

interface RecordedPoint {
    readonly errorBound: number;
    readonly h: number;
    readonly ratePerDay: number;
}

export const TOP_STEP_DEFAULT_GRID_CURVE: RecordedCurve = {
    maxCycleDays: 267,
    minCycleDays: 1,
    name: 'TopStep No-fee Standard 50K, default grid, 252 funded days',
    points: [
        { errorBound: 6.831, h: 27_262.783, ratePerDay: 0 },
        { errorBound: 6.797, h: 12_471.57, ratePerDay: 102.108 },
        { errorBound: 6.18, h: 2600.214, ratePerDay: 188.202 },
        { errorBound: 7.035, h: 1216.065, ratePerDay: 210.881 },
        { errorBound: 5.554, h: 454.144, ratePerDay: 230.805 },
        { errorBound: 4.825, h: 123.052, ratePerDay: 242.681 },
        { errorBound: 3.703, h: 16.56, ratePerDay: 247.095 },
        { errorBound: 6.544, h: 1.423, ratePerDay: 247.781 },
        { errorBound: 4.54, h: 0.022, ratePerDay: 247.845 },
    ],
};

export const FAST_GRID_CURVE: RecordedCurve = {
    maxCycleDays: 267,
    minCycleDays: 1,
    name: 'TopStep No-fee Standard 50K, cushion step 0.25 and action step 0.125, 252 funded days',
    points: [
        { errorBound: 3.149, h: 14_875.475, ratePerDay: 0 },
        { errorBound: 2.011, h: 10_000.019, ratePerDay: 55.713 },
        { errorBound: 1.862, h: 1532.601, ratePerDay: 169.987 },
        { errorBound: 1.248, h: 693.396, ratePerDay: 190.67 },
        { errorBound: 2.857, h: 191.811, ratePerDay: 207.76 },
        { errorBound: 1.428, h: 45.417, ratePerDay: 214.295 },
        { errorBound: 2.5, h: 5.481, ratePerDay: 216.323 },
        { errorBound: 1.86, h: 0.178, ratePerDay: 216.601 },
        { errorBound: 0.53, h: 0.01, ratePerDay: 216.61 },
    ],
};

export function recordedProbe(
    curve: RecordedCurve,
    ratePerDay: number,
): RateProbe {
    const { points } = curve;
    let segment = points.length - 2;
    for (let index = 0; index < points.length - 1; index++) {
        if (ratePerDay <= (points[index + 1]?.ratePerDay ?? Infinity)) {
            segment = index;
            break;
        }
    }
    const from = points[segment];
    const to = points[segment + 1];
    if (from === undefined || to === undefined) {
        throw new Error('a recorded curve needs two points');
    }
    const share =
        (ratePerDay - from.ratePerDay) / (to.ratePerDay - from.ratePerDay);
    const nearest = [from, to].reduce((closest, point) =>
        Math.abs(point.ratePerDay - ratePerDay) <
        Math.abs(closest.ratePerDay - ratePerDay)
            ? point
            : closest,
    );
    return {
        errorBound: nearest.errorBound,
        h: from.h + share * (to.h - from.h),
        ratePerDay,
    };
}

export function recordedRoot(curve: RecordedCurve): number {
    const last = curve.points.at(-1);
    const previous = curve.points.at(-2);
    if (last === undefined || previous === undefined) {
        throw new Error('a recorded curve needs two points');
    }
    const slope =
        (last.h - previous.h) / (last.ratePerDay - previous.ratePerDay);
    return last.ratePerDay - last.h / slope;
}
