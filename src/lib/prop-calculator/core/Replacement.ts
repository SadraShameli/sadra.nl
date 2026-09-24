import { TRADING_DAYS_PER_MONTH } from './constants';
import {
    activationFee,
    type CouponDiscounts,
    type FeeSchedule,
    initialEvalFee,
    monthlySubscriptionFee,
    rebuyAttemptSubscriptionFee,
    retryFee,
    RetryKind,
    retryPath,
    subscriptionFee,
} from './FeeSchedule';

export interface AttemptDaySamples {
    readonly failDays: readonly number[];
    readonly passDays: readonly number[];
}

export interface ReplacementEconomics {
    attemptsPerFundedAccount: number;
    costPerFundedAccount: number;
    daysPerFundedAccount: number;
}

export interface ReplacementInputs {
    readonly attemptDays?: AttemptDaySamples;
    readonly discounts: CouponDiscounts | undefined;
    readonly evalPassRate: number;
    readonly fees: FeeSchedule;
    readonly meanDaysOnFail: number;
    readonly meanDaysOnPass: number;
}

export function replacementEconomics(
    inputs: ReplacementInputs,
): ReplacementEconomics {
    const { discounts, evalPassRate, fees, meanDaysOnFail, meanDaysOnPass } =
        inputs;
    if (
        !Number.isFinite(evalPassRate) ||
        evalPassRate < 0 ||
        evalPassRate > 1
    ) {
        throw new Error(
            `replacementEconomics: evalPassRate must be a probability in [0, 1], got ${evalPassRate}`,
        );
    }
    if (evalPassRate === 0) {
        return {
            attemptsPerFundedAccount: Infinity,
            costPerFundedAccount: Infinity,
            daysPerFundedAccount: Infinity,
        };
    }
    const attempts = 1 / evalPassRate;
    const retries = attempts - 1;
    const days = meanDaysOnPass + retries * meanDaysOnFail;
    const subscription =
        retryPath(fees, discounts) === RetryKind.Rebuy
            ? rebuyChainSubscription(inputs, retries)
            : renewalChainSubscription(inputs, days);
    return {
        attemptsPerFundedAccount: attempts,
        costPerFundedAccount:
            initialEvalFee(fees, discounts) +
            retries * retryFee(fees, discounts) +
            subscription +
            activationFee(fees, discounts),
        daysPerFundedAccount: days,
    };
}

function assertDaySamples(
    evalPassRate: number,
    samples: AttemptDaySamples,
): void {
    const isUsable =
        samples.passDays.length > 0 &&
        (evalPassRate === 1 || samples.failDays.length > 0) &&
        samples.passDays.every((day) => isWholeDayCount(day)) &&
        samples.failDays.every((day) => isWholeDayCount(day));
    if (!isUsable) {
        throw new Error(
            'replacementEconomics: attemptDays needs whole non-negative day counts, at least one pass sample, and a fail sample whenever evalPassRate is below 1',
        );
    }
}

function convolveResidues(
    a: readonly number[],
    b: readonly number[],
): number[] {
    const period = a.length;
    const out = Array.from({ length: period }, () => 0);
    for (const [leftResidue, left] of a.entries()) {
        for (const [rightResidue, right] of b.entries()) {
            const residue = (leftResidue + rightResidue) % period;
            out[residue] = (out[residue] ?? 0) + left * right;
        }
    }
    return out;
}

function expectedBilledMonths(
    evalPassRate: number,
    samples: AttemptDaySamples,
): number {
    assertDaySamples(evalPassRate, samples);
    const period = TRADING_DAYS_PER_MONTH;
    const failShare = 1 - evalPassRate;
    const chainResidues = convolveResidues(
        residueDistribution(samples.passDays, period),
        failureSumResidues(
            evalPassRate,
            residueDistribution(samples.failDays, period),
        ),
    );
    const meanChainDays =
        mean(samples.passDays) +
        (failShare / evalPassRate) * mean(samples.failDays);
    const roundUpDays = chainResidues.reduce(
        (sum, probability, residue) =>
            sum + probability * ((period - residue) % period),
        0,
    );
    const zeroDayChainProbability =
        shareOfZeroDays(samples.passDays) *
        (evalPassRate / (1 - failShare * shareOfZeroDays(samples.failDays)));
    return (meanChainDays + roundUpDays) / period + zeroDayChainProbability;
}

function failureSumResidues(
    evalPassRate: number,
    failResidues: readonly number[],
): number[] {
    const period = failResidues.length;
    const failShare = 1 - evalPassRate;
    const matrix = Array.from({ length: period }, (_, row) =>
        Array.from(
            { length: period },
            (_, column) =>
                (row === column ? 1 : 0) -
                failShare *
                    (failResidues[(row - column + period) % period] ?? 0),
        ),
    );
    const rhs = Array.from({ length: period }, (_, row) =>
        row === 0 ? evalPassRate : 0,
    );
    return solveLinearSystem(matrix, rhs);
}

function isWholeDayCount(day: number): boolean {
    return Number.isSafeInteger(day) && day >= 0;
}

function mean(values: readonly number[]): number {
    return values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rebuyChainSubscription(
    inputs: ReplacementInputs,
    retries: number,
): number {
    const {
        attemptDays,
        discounts,
        evalPassRate,
        fees,
        meanDaysOnFail,
        meanDaysOnPass,
    } = inputs;
    const passFee = (days: number) => subscriptionFee(fees, days, discounts);
    const retryAttemptFee = (days: number) =>
        rebuyAttemptSubscriptionFee(fees, days, discounts);
    if (attemptDays === undefined) {
        return (
            passFee(meanDaysOnPass) + retries * retryAttemptFee(meanDaysOnFail)
        );
    }
    assertDaySamples(evalPassRate, attemptDays);
    return (
        mean(attemptDays.passDays.map((days) => passFee(days))) +
        retries *
            mean(attemptDays.failDays.map((days) => retryAttemptFee(days)))
    );
}

function renewalChainSubscription(
    inputs: ReplacementInputs,
    days: number,
): number {
    const { attemptDays, discounts, evalPassRate, fees } = inputs;
    return attemptDays === undefined
        ? subscriptionFee(fees, days, discounts)
        : monthlySubscriptionFee(fees, discounts) *
              expectedBilledMonths(evalPassRate, attemptDays);
}

function residueDistribution(
    days: readonly number[],
    period: number,
): number[] {
    const out = Array.from({ length: period }, () => 0);
    for (const day of days) {
        const residue = day % period;
        out[residue] = (out[residue] ?? 0) + 1 / days.length;
    }
    return out;
}

function shareOfZeroDays(days: readonly number[]): number {
    return days.length === 0
        ? 0
        : days.filter((day) => day === 0).length / days.length;
}

function solveLinearSystem(
    matrix: readonly (readonly number[])[],
    rhs: readonly number[],
): number[] {
    const size = rhs.length;
    const a = matrix.map((row) => [...row]);
    const b = [...rhs];
    for (let pivot = 0; pivot < size; pivot++) {
        const pivotRow = a[pivot] ?? [];
        const pivotValue = pivotRow[pivot] ?? 0;
        for (let row = pivot + 1; row < size; row++) {
            const current = a[row] ?? [];
            const factor = (current[pivot] ?? 0) / pivotValue;
            if (factor === 0) continue;
            for (let column = pivot; column < size; column++) {
                current[column] =
                    (current[column] ?? 0) - factor * (pivotRow[column] ?? 0);
            }
            b[row] = (b[row] ?? 0) - factor * (b[pivot] ?? 0);
        }
    }
    const x = Array.from({ length: size }, () => 0);
    for (let row = size - 1; row >= 0; row--) {
        const current = a[row] ?? [];
        let sum = b[row] ?? 0;
        for (let column = row + 1; column < size; column++) {
            sum -= (current[column] ?? 0) * (x[column] ?? 0);
        }
        x[row] = sum / (current[row] ?? 1);
    }
    return x;
}
