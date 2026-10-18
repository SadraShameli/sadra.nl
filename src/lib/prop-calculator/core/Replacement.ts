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

export interface CurrentAttemptInputs {
    readonly attemptDays?: AttemptDaySamples;
    readonly meanDaysOnFail: number;
    readonly meanDaysOnPass: number;
    readonly passRate: number;
    readonly subscriptionElapsedDays: number;
}

export interface ReplacementEconomics {
    attemptsPerFundedAccount: number;
    costPerFundedAccount: number;
    daysPerFundedAccount: number;
}

export interface ReplacementFromStateInputs {
    readonly current: CurrentAttemptInputs;
    readonly fresh: ReplacementInputs;
}

export interface ReplacementInputs {
    readonly attemptDays?: AttemptDaySamples;
    readonly discounts: CouponDiscounts | undefined;
    readonly evalPassRate: number;
    readonly fees: FeeSchedule;
    readonly meanDaysOnFail: number;
    readonly meanDaysOnPass: number;
}

interface ChainDays {
    readonly meanDays: number;
    readonly residues: readonly number[];
    readonly zeroDayProbability: number;
}

interface WeightedChain {
    readonly chain: ChainDays;
    readonly weight: number;
}

const REPLACEMENT_ECONOMICS = 'replacementEconomics';
const REPLACEMENT_FROM_STATE = 'replacementEconomicsFromState';

const UNREACHABLE_FUNDED_ACCOUNT: ReplacementEconomics = {
    attemptsPerFundedAccount: Infinity,
    costPerFundedAccount: Infinity,
    daysPerFundedAccount: Infinity,
};

export function replacementEconomics(
    inputs: ReplacementInputs,
): ReplacementEconomics {
    const { discounts, evalPassRate, fees, meanDaysOnFail, meanDaysOnPass } =
        inputs;
    assertProbability(REPLACEMENT_ECONOMICS, 'evalPassRate', evalPassRate);
    if (evalPassRate === 0) return { ...UNREACHABLE_FUNDED_ACCOUNT };
    const attempts = 1 / evalPassRate;
    const retries = attempts - 1;
    const days = chainDays(evalPassRate, meanDaysOnPass, meanDaysOnFail);
    const subscription =
        retryPath(fees, discounts) === RetryKind.Rebuy
            ? rebuyChainSubscription(inputs, retries, (attemptDays) =>
                  subscriptionFee(fees, attemptDays, discounts),
              )
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

export function replacementEconomicsFromState(
    inputs: ReplacementFromStateInputs,
): ReplacementEconomics {
    const { current, fresh } = inputs;
    const { discounts, fees } = fresh;
    assertProbability(REPLACEMENT_FROM_STATE, 'passRate', current.passRate);
    assertProbability(
        REPLACEMENT_FROM_STATE,
        'evalPassRate',
        fresh.evalPassRate,
    );
    if (!isWholeDayCount(current.subscriptionElapsedDays)) {
        throw new Error(
            `${REPLACEMENT_FROM_STATE}: subscriptionElapsedDays must be a whole non-negative day count, got ${current.subscriptionElapsedDays}`,
        );
    }
    if (current.attemptDays !== undefined) {
        assertDaySamples(
            REPLACEMENT_FROM_STATE,
            'passRate',
            current.passRate,
            current.attemptDays,
        );
    }
    const failShare = 1 - current.passRate;
    if (failShare > 0 && fresh.evalPassRate === 0) {
        return { ...UNREACHABLE_FUNDED_ACCOUNT };
    }
    const freshAttempts = failShare > 0 ? failShare / fresh.evalPassRate : 0;
    const freshDays =
        failShare > 0
            ? chainDays(
                  fresh.evalPassRate,
                  fresh.meanDaysOnPass,
                  fresh.meanDaysOnFail,
              )
            : 0;
    const days =
        current.passRate * current.meanDaysOnPass +
        failShare * (current.meanDaysOnFail + freshDays);
    const subscription =
        retryPath(fees, discounts) === RetryKind.Rebuy
            ? rebuySubscriptionFromState(inputs)
            : renewalSubscriptionFromState(inputs, days);
    return {
        attemptsPerFundedAccount: 1 + freshAttempts,
        costPerFundedAccount:
            activationFee(fees, discounts) +
            freshAttempts * retryFee(fees, discounts) +
            subscription,
        daysPerFundedAccount: days,
    };
}

function assertDaySamples(
    caller: string,
    rateName: string,
    passRate: number,
    samples: AttemptDaySamples,
): void {
    const isUsable =
        (passRate === 0 || samples.passDays.length > 0) &&
        (passRate === 1 || samples.failDays.length > 0) &&
        samples.passDays.every((day) => isWholeDayCount(day)) &&
        samples.failDays.every((day) => isWholeDayCount(day));
    if (!isUsable) {
        throw new Error(
            `${caller}: attemptDays needs whole non-negative day counts, a pass sample whenever ${rateName} is above 0, and a fail sample whenever ${rateName} is below 1`,
        );
    }
}

function assertProbability(
    caller: string,
    rateName: string,
    value: number,
): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(
            `${caller}: ${rateName} must be a probability in [0, 1], got ${value}`,
        );
    }
}

function billedMonths(chain: ChainDays): number {
    const period = chain.residues.length;
    const roundUpDays = chain.residues.reduce(
        (sum, probability, residue) =>
            sum + probability * ((period - residue) % period),
        0,
    );
    return (chain.meanDays + roundUpDays) / period + chain.zeroDayProbability;
}

function chainDays(
    evalPassRate: number,
    meanDaysOnPass: number,
    meanDaysOnFail: number,
): number {
    return meanDaysOnPass + (1 / evalPassRate - 1) * meanDaysOnFail;
}

function concatChains(first: ChainDays, second: ChainDays): ChainDays {
    return {
        meanDays: first.meanDays + second.meanDays,
        residues: convolveResidues(first.residues, second.residues),
        zeroDayProbability:
            first.zeroDayProbability * second.zeroDayProbability,
    };
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

function expectedAttemptFee(
    meanDays: number,
    samples: readonly number[] | undefined,
    fee: (days: number) => number,
): number {
    return samples === undefined
        ? fee(meanDays)
        : mean(samples.map((days) => fee(days)));
}

function expectedBilledMonths(
    evalPassRate: number,
    samples: AttemptDaySamples,
): number {
    assertDaySamples(
        REPLACEMENT_ECONOMICS,
        'evalPassRate',
        evalPassRate,
        samples,
    );
    return billedMonths(freshChain(evalPassRate, samples));
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

function freshChain(
    evalPassRate: number,
    samples: AttemptDaySamples,
): ChainDays {
    const period = TRADING_DAYS_PER_MONTH;
    const failShare = 1 - evalPassRate;
    return {
        meanDays:
            mean(samples.passDays) +
            (failShare / evalPassRate) * mean(samples.failDays),
        residues: convolveResidues(
            residueDistribution(samples.passDays, period),
            failureSumResidues(
                evalPassRate,
                residueDistribution(samples.failDays, period),
            ),
        ),
        zeroDayProbability:
            shareOfZeroDays(samples.passDays) *
            (evalPassRate /
                (1 - failShare * shareOfZeroDays(samples.failDays))),
    };
}

function isWholeDayCount(day: number): boolean {
    return Number.isSafeInteger(day) && day >= 0;
}

function mean(values: readonly number[]): number {
    return values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mixChains(branches: readonly WeightedChain[]): ChainDays {
    return branches.reduce<ChainDays>(
        (mixed, { chain, weight }) => ({
            meanDays: mixed.meanDays + weight * chain.meanDays,
            residues: mixed.residues.map(
                (probability, residue) =>
                    probability + weight * (chain.residues[residue] ?? 0),
            ),
            zeroDayProbability:
                mixed.zeroDayProbability + weight * chain.zeroDayProbability,
        }),
        {
            meanDays: 0,
            residues: Array.from({ length: TRADING_DAYS_PER_MONTH }, () => 0),
            zeroDayProbability: 0,
        },
    );
}

function rebuyChainSubscription(
    inputs: ReplacementInputs,
    retries: number,
    passAttemptFee: (days: number) => number,
): number {
    const {
        attemptDays,
        discounts,
        evalPassRate,
        fees,
        meanDaysOnFail,
        meanDaysOnPass,
    } = inputs;
    if (attemptDays !== undefined) {
        assertDaySamples(
            REPLACEMENT_ECONOMICS,
            'evalPassRate',
            evalPassRate,
            attemptDays,
        );
    }
    return (
        expectedAttemptFee(
            meanDaysOnPass,
            attemptDays?.passDays,
            passAttemptFee,
        ) +
        retries *
            expectedAttemptFee(meanDaysOnFail, attemptDays?.failDays, (days) =>
                rebuyAttemptSubscriptionFee(fees, days, discounts),
            )
    );
}

function rebuySubscriptionFromState(
    inputs: ReplacementFromStateInputs,
): number {
    const { current, fresh } = inputs;
    const { discounts, fees } = fresh;
    const { attemptDays, passRate, subscriptionElapsedDays } = current;
    const failShare = 1 - passRate;
    const startedMonths = subscriptionFee(
        fees,
        subscriptionElapsedDays,
        discounts,
    );
    const currentAccountFee = (days: number) =>
        subscriptionFee(fees, subscriptionElapsedDays + days, discounts) -
        startedMonths;
    const currentAccount =
        passRate *
            expectedAttemptFee(
                current.meanDaysOnPass,
                attemptDays?.passDays,
                currentAccountFee,
            ) +
        failShare *
            expectedAttemptFee(
                current.meanDaysOnFail,
                attemptDays?.failDays,
                currentAccountFee,
            );
    return failShare === 0
        ? currentAccount
        : currentAccount +
              failShare *
                  rebuyChainSubscription(
                      fresh,
                      1 / fresh.evalPassRate - 1,
                      (days) =>
                          rebuyAttemptSubscriptionFee(fees, days, discounts),
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

function renewalSubscriptionFromState(
    inputs: ReplacementFromStateInputs,
    days: number,
): number {
    const { current, fresh } = inputs;
    const { discounts, fees } = fresh;
    const { attemptDays, passRate, subscriptionElapsedDays } = current;
    const failShare = 1 - passRate;
    const startedMonths = subscriptionFee(
        fees,
        subscriptionElapsedDays,
        discounts,
    );
    const freshSamples = failShare > 0 ? fresh.attemptDays : undefined;
    if (
        attemptDays === undefined ||
        (freshSamples === undefined && failShare > 0)
    ) {
        return (
            subscriptionFee(fees, subscriptionElapsedDays + days, discounts) -
            startedMonths
        );
    }
    const branches: WeightedChain[] = [];
    if (passRate > 0) {
        branches.push({
            chain: sampleChain(attemptDays.passDays, subscriptionElapsedDays),
            weight: passRate,
        });
    }
    if (freshSamples !== undefined) {
        assertDaySamples(
            REPLACEMENT_FROM_STATE,
            'evalPassRate',
            fresh.evalPassRate,
            freshSamples,
        );
        branches.push({
            chain: concatChains(
                sampleChain(attemptDays.failDays, subscriptionElapsedDays),
                freshChain(fresh.evalPassRate, freshSamples),
            ),
            weight: failShare,
        });
    }
    return (
        monthlySubscriptionFee(fees, discounts) *
            billedMonths(mixChains(branches)) -
        startedMonths
    );
}

function residueDistribution(
    days: readonly number[],
    period: number,
    offset = 0,
): number[] {
    const out = Array.from({ length: period }, () => 0);
    for (const day of days) {
        const residue = (day + offset) % period;
        out[residue] = (out[residue] ?? 0) + 1 / days.length;
    }
    return out;
}

function sampleChain(days: readonly number[], offset: number): ChainDays {
    return {
        meanDays: offset + mean(days),
        residues: residueDistribution(days, TRADING_DAYS_PER_MONTH, offset),
        zeroDayProbability: offset === 0 ? shareOfZeroDays(days) : 0,
    };
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
