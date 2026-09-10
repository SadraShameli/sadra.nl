import { describe, expect, it } from 'vitest';

import {
    type DayStopRule,
    DayStopRuleKind,
    InstrumentSymbol,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';

const COVERAGE_ARITY = 3;

interface Dimension<T> {
    readonly levels: readonly T[];
    readonly name: string;
}

const PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

const RUNG_SIZING_DIM: Dimension<RungSizing> = {
    levels: [RungSizing.CapToCushion, RungSizing.SkipIfUnaffordable],
    name: 'rungSizing',
};

const POSITION_SIZING_DIM: Dimension<null | {
    instrument: InstrumentSymbol;
    stopPoints: number;
}> = {
    levels: [
        null,
        { instrument: InstrumentSymbol.NQ, stopPoints: 10 },
        { instrument: InstrumentSymbol.MNQ, stopPoints: 2 },
        { instrument: InstrumentSymbol.ES, stopPoints: 20 },
    ],
    name: 'positionSizing',
};

const IDLE_DAY_PROBABILITY_DIM: Dimension<number> = {
    levels: [0, 0.3, 1],
    name: 'idleDayProbability',
};

const RETAINED_CUSHION_DIM: Dimension<'default' | 'full' | 'half' | 'none'> = {
    levels: ['default', 'none', 'half', 'full'],
    name: 'minRetainedCushion',
};

const PAYOUT_REQUEST_SIZE_DIM: Dimension<'all' | 'large' | 'small'> = {
    levels: ['all', 'small', 'large'],
    name: 'payoutRequestSize',
};

const MAX_ATTEMPTS_DIM: Dimension<number> = {
    levels: [1, 3, 5],
    name: 'maxAttempts',
};

const DAY_STOP_DIM: Dimension<DayStopRule> = {
    levels: [
        { kind: DayStopRuleKind.None },
        { kind: DayStopRuleKind.DayGreen },
        { k: 2, kind: DayStopRuleKind.AfterKLosses },
        { dollars: 500, kind: DayStopRuleKind.AfterTarget },
    ],
    name: 'dayStop',
};

const RISK_PROFILE_DIM: Dimension<{
    riskPerTrade: number;
    rrRatio: number;
    tradesPerDay: number;
    winrate: number;
}> = {
    levels: [
        { riskPerTrade: 250, rrRatio: 2, tradesPerDay: 4, winrate: 0.4 },
        { riskPerTrade: 2000, rrRatio: 1.3, tradesPerDay: 2, winrate: 0.55 },
        { riskPerTrade: 50, rrRatio: 3, tradesPerDay: 8, winrate: 0.3 },
        { riskPerTrade: 3000, rrRatio: 1, tradesPerDay: 1, winrate: 0.6 },
    ],
    name: 'riskProfile',
};

const DIMENSIONS = [
    { levels: PLANS, name: 'plan' },
    RUNG_SIZING_DIM,
    POSITION_SIZING_DIM,
    IDLE_DAY_PROBABILITY_DIM,
    RETAINED_CUSHION_DIM,
    PAYOUT_REQUEST_SIZE_DIM,
    MAX_ATTEMPTS_DIM,
    DAY_STOP_DIM,
    RISK_PROFILE_DIM,
] as const;

function allTupleKeys(
    levelCounts: readonly number[],
    dimensionCombos: readonly number[][],
): Set<string> {
    const tuples = new Set<string>();
    for (const combo of dimensionCombos) {
        const levelIndices = combo.map((dimensionIndex) =>
            Array.from(
                { length: levelCounts[dimensionIndex] ?? 0 },
                (_v, index) => index,
            ),
        );
        cartesianProduct(levelIndices, (levels) => {
            tuples.add(
                combo.map((dim, index) => `${dim}:${levels[index]}`).join('|'),
            );
        });
    }
    return tuples;
}

function buildSimInputs(row: readonly number[], seed: number): SimInputs {
    const plan = PLANS[row[0] ?? 0];
    const rungSizing = RUNG_SIZING_DIM.levels[row[1] ?? 0];
    const positionSizing = POSITION_SIZING_DIM.levels[row[2] ?? 0];
    const idleDayProbability = IDLE_DAY_PROBABILITY_DIM.levels[row[3] ?? 0];
    const retainedCushionLevel = RETAINED_CUSHION_DIM.levels[row[4] ?? 0];
    const payoutRequestSizeLevel = PAYOUT_REQUEST_SIZE_DIM.levels[row[5] ?? 0];
    const maxAttempts = MAX_ATTEMPTS_DIM.levels[row[6] ?? 0];
    const dayStop = DAY_STOP_DIM.levels[row[7] ?? 0];
    const riskProfile = RISK_PROFILE_DIM.levels[row[8] ?? 0];
    if (
        !plan ||
        rungSizing === undefined ||
        positionSizing === undefined ||
        idleDayProbability === undefined ||
        retainedCushionLevel === undefined ||
        payoutRequestSizeLevel === undefined ||
        maxAttempts === undefined ||
        !dayStop ||
        !riskProfile
    ) {
        throw new Error('combinatorial row out of range');
    }

    const minRetainedCushion =
        retainedCushionLevel === 'default'
            ? undefined
            : retainedCushionLevel === 'none'
              ? 0
              : retainedCushionLevel === 'half'
                ? plan.drawdown.amount / 2
                : plan.drawdown.amount;

    const payoutRequestSize =
        payoutRequestSizeLevel === 'all'
            ? undefined
            : payoutRequestSizeLevel === 'small'
              ? 300
              : 5000;

    return {
        dayStop,
        fundedHorizonDays: 60,
        idleDayProbability,
        instrument: positionSizing?.instrument,
        maxAttempts,
        maxEvalDays: 60,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade: riskProfile.riskPerTrade,
        rrRatio: riskProfile.rrRatio,
        rungSizing,
        seed,
        stopPoints: positionSizing?.stopPoints,
        tradesPerDay: riskProfile.tradesPerDay,
        trials: 40,
        winrate: riskProfile.winrate,
    };
}

function cartesianProduct(
    arrays: readonly number[][],
    onEach: (combo: readonly number[]) => void,
): void {
    const current: number[] = [];
    const build = (depth: number) => {
        if (depth === arrays.length) {
            onEach(current);
            return;
        }
        const options = arrays[depth] ?? [];
        for (const value of options) {
            current.push(value);
            build(depth + 1);
            current.pop();
        }
    };
    build(0);
}

function generateTWiseRows(
    levelCounts: readonly number[],
    arity: number,
    seed: number,
    candidatesPerStep: number,
    maxRows: number,
): { rows: number[][]; uncoveredCount: number } {
    const dimensionCombos = kCombinations(levelCounts.length, arity);
    const rng = mulberry32(seed);
    const uncovered = allTupleKeys(levelCounts, dimensionCombos);
    const rows: number[][] = [];

    while (uncovered.size > 0 && rows.length < maxRows) {
        let bestRow: null | number[] = null;
        let bestScore = -1;
        for (let c = 0; c < candidatesPerStep; c++) {
            const candidate = levelCounts.map((count) =>
                Math.floor(rng() * count),
            );
            const keys = rowTupleKeys(candidate, dimensionCombos);
            let score = 0;
            for (const key of keys) {
                if (uncovered.has(key)) score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                bestRow = candidate;
            }
        }
        if (!bestRow) break;
        rows.push(bestRow);
        for (const key of rowTupleKeys(bestRow, dimensionCombos)) {
            uncovered.delete(key);
        }
    }

    return { rows, uncoveredCount: uncovered.size };
}

function kCombinations(n: number, k: number): number[][] {
    const out: number[][] = [];
    const combo: number[] = [];
    const build = (start: number) => {
        if (combo.length === k) {
            out.push([...combo]);
            return;
        }
        for (let index = start; index < n; index++) {
            combo.push(index);
            build(index + 1);
            combo.pop();
        }
    };
    build(0);
    return out;
}

function rowTupleKeys(
    row: readonly number[],
    dimensionCombos: readonly number[][],
): string[] {
    return dimensionCombos.map((combo) =>
        combo.map((dim) => `${dim}:${row[dim]}`).join('|'),
    );
}

describe(`combinatorial coverage: every ${COVERAGE_ARITY}-wise interaction of engine-level opt-in features and firms`, () => {
    const levelCounts = DIMENSIONS.map((d) => d.levels.length);
    const fullCrossProduct = levelCounts.reduce((a, b) => a * b, 1);
    const { rows, uncoveredCount } = generateTWiseRows(
        levelCounts,
        COVERAGE_ARITY,
        424_242,
        100,
        10_000,
    );

    it(`the generated matrix achieves 100% ${COVERAGE_ARITY}-wise coverage across all 9 dimensions (full cross-product would be ${fullCrossProduct})`, () => {
        expect(uncoveredCount).toBe(0);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThan(fullCrossProduct);
    });

    it(`every one of the ${rows.length} generated combinations produces structurally valid SimOutputs`, () => {
        const failures: string[] = [];

        for (const [index, row] of rows.entries()) {
            const inputs = buildSimInputs(row, 1000 + index);
            let out;
            try {
                out = simulate(inputs);
            } catch (error) {
                failures.push(
                    `row ${index} (${describeRow(row)}) threw: ${String(error)}`,
                );
                continue;
            }

            const outcomeSum =
                out.bustProbability +
                out.timeoutProbability +
                out.passProbability +
                out.fundedBustProbability;
            if (Math.abs(outcomeSum - 1) > 1e-6) {
                failures.push(
                    `row ${index} (${describeRow(row)}): outcome probabilities summed to ${outcomeSum}, not 1`,
                );
            }

            const probabilityFields = Object.entries({
                bustProbability: out.bustProbability,
                fundedBustProbability: out.fundedBustProbability,
                inactivityClosureProbability: out.inactivityClosureProbability,
                passProbability: out.passProbability,
                timeoutProbability: out.timeoutProbability,
            });
            for (const [key, value] of probabilityFields) {
                if (!Number.isFinite(value) || value < 0 || value > 1) {
                    failures.push(
                        `row ${index} (${describeRow(row)}): ${key}=${value} is not a finite probability in [0,1]`,
                    );
                }
            }

            if (
                out.inactivityClosureProbability >
                out.bustProbability + out.fundedBustProbability + 1e-9
            ) {
                failures.push(
                    `row ${index} (${describeRow(row)}): inactivityClosureProbability exceeds bust+fundedBust`,
                );
            }

            const maxAttempts = inputs.maxAttempts ?? 1;
            if (
                out.expectedAttempts < 1 - 1e-9 ||
                out.expectedAttempts > maxAttempts + 1e-9
            ) {
                failures.push(
                    `row ${index} (${describeRow(row)}): expectedAttempts=${out.expectedAttempts} outside [1, ${maxAttempts}]`,
                );
            }

            const nonNegativeFields = Object.entries({
                expectedGrossPayout: out.expectedGrossPayout,
                expectedTotalCost: out.expectedTotalCost,
                maxDrawdownP50: out.maxDrawdownP50,
                maxDrawdownP95: out.maxDrawdownP95,
            });
            for (const [key, value] of nonNegativeFields) {
                if (!Number.isFinite(value) || value < 0) {
                    failures.push(
                        `row ${index} (${describeRow(row)}): ${key}=${value} is not a finite, non-negative value`,
                    );
                }
            }

            if (Number.isNaN(out.profitFactor)) {
                failures.push(
                    `row ${index} (${describeRow(row)}): profitFactor is NaN`,
                );
            }
            if (Number.isNaN(out.expectancyDollars)) {
                failures.push(
                    `row ${index} (${describeRow(row)}): expectancyDollars is NaN`,
                );
            }
        }

        expect(failures).toEqual([]);
    }, 30_000);
});

function describeRow(row: readonly number[]): string {
    return DIMENSIONS.map((d, index) => `${d.name}=${row[index]}`).join(', ');
}
