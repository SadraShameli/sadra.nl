import { type Dollars, fraction, type Fraction0to1 } from '../core';
import {
    EconomicsDisclosure,
    EconomicsReason,
    isNonNegativeAmount,
    isProbability,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';
import {
    MAX_WALK_CELLS,
    MAX_WALK_RATIO_DENOMINATOR,
    MAX_WALK_WORK,
} from './WalkLimits';

const WALK_TOLERANCE = 1e-9;

const WALK_DISCLOSURES: readonly EconomicsDisclosure[] = [
    EconomicsDisclosure.RandomWalkApproximation,
];

enum WalkValue {
    PassProbability = 'pass-probability',
    Trades = 'trades',
}

export interface EvalPace {
    expectedTradesUntilPassOrBust: number;
    passProbability: Fraction0to1;
    requiredR: number;
}

export interface EvalPaceInputs {
    drawdown: Dollars;
    riskPerTrade: Dollars;
    rrRatio: number;
    target: Dollars;
    winrate: Fraction0to1;
}

interface Walk {
    drawdownR: number;
    grid: WalkGrid;
    targetR: number;
}

interface WalkGrid {
    ddUnits: number;
    downUnits: number;
    targetUnits: number;
    upUnits: number;
}

export function evalPace(inputs: EvalPaceInputs): Quantity<EvalPace> {
    const walk = walkOf(inputs);
    if (walk.value === null) return walk;
    const { drawdownR, grid, targetR } = walk.value;
    const { rrRatio, winrate } = inputs;
    return quantityOf(
        {
            expectedTradesUntilPassOrBust: twoBarrierExpectedTrades(
                winrate,
                rrRatio,
                targetR,
                drawdownR,
            ),
            passProbability: fraction(
                passProbabilityOn(winrate, targetR, drawdownR, grid),
            ),
            requiredR: targetR,
        },
        WALK_DISCLOSURES,
    );
}

export function requiredR(
    target: Dollars,
    riskPerTrade: Dollars,
): Quantity<number> {
    return !isNonNegativeAmount(target) ||
        !(Number.isFinite(riskPerTrade) && riskPerTrade > 0)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(target / riskPerTrade);
}

export function twoBarrierExpectedTrades(
    p: number,
    rr: number,
    target: number,
    dd: number,
): number {
    if (target <= 0 || dd <= 0) return 0;
    const grid = walkGrid(rr, target, dd);
    return grid.value === null
        ? NaN
        : solveWalk(p, grid.value, WalkValue.Trades);
}

export function twoBarrierPassProbability(
    p: number,
    rr: number,
    target: number,
    dd: number,
): number {
    return passProbabilityOn(p, target, dd, walkGrid(rr, target, dd).value);
}

export function walkPassProbability(
    inputs: EvalPaceInputs,
): Quantity<Fraction0to1> {
    const walk = walkOf(inputs);
    if (walk.value === null) return walk;
    const { drawdownR, grid, targetR } = walk.value;
    return quantityOf(
        fraction(passProbabilityOn(inputs.winrate, targetR, drawdownR, grid)),
        WALK_DISCLOSURES,
    );
}

function barrierUnits(distance: number, unitsPerR: number): number {
    return Math.max(1, Math.ceil(distance * unitsPerR - WALK_TOLERANCE));
}

function passProbabilityOn(
    p: number,
    target: number,
    dd: number,
    grid: null | WalkGrid,
): number {
    if (p <= 0) return 0;
    if (p >= 1 || target <= 0) return 1;
    if (dd <= 0) return 0;
    return grid === null ? NaN : solveWalk(p, grid, WalkValue.PassProbability);
}

function solveWalk(p: number, grid: WalkGrid, kind: WalkValue): number {
    const { ddUnits, downUnits, targetUnits, upUnits } = grid;
    const up = Math.min(1, Math.max(0, p));
    const down = 1 - up;
    const interior = targetUnits + ddUnits - 1;
    const upperWidth = upUnits + 1;
    const upper = new Float64Array(interior * upperWidth);
    const rhs = new Float64Array(interior);
    const working = new Float64Array(downUnits + upperWidth);
    for (let row = 0; row < interior; row++) {
        working.fill(0);
        working[downUnits] = 1;
        const isTargetReached = row + upUnits >= interior;
        if (!isTargetReached) working[downUnits + upUnits] = -up;
        if (row >= downUnits) working[0] = -down;
        let constant = kind === WalkValue.Trades ? 1 : isTargetReached ? up : 0;
        for (let lag = Math.min(downUnits, row); lag >= 1; lag--) {
            const pivotRow = row - lag;
            const entry = working[downUnits - lag] ?? 0;
            if (entry === 0) continue;
            const pivotOffset = pivotRow * upperWidth;
            const factor = entry / (upper[pivotOffset] ?? 1);
            for (let offset = 0; offset < upperWidth; offset++) {
                const column = downUnits - lag + offset;
                working[column] =
                    (working[column] ?? 0) -
                    factor * (upper[pivotOffset + offset] ?? 0);
            }
            constant -= factor * (rhs[pivotRow] ?? 0);
        }
        upper.set(
            working.subarray(downUnits, downUnits + upperWidth),
            row * upperWidth,
        );
        rhs[row] = constant;
    }
    const solution = new Float64Array(interior);
    for (let row = interior - 1; row >= 0; row--) {
        const rowOffset = row * upperWidth;
        let sum = rhs[row] ?? 0;
        const lastOffset = Math.min(upperWidth, interior - row);
        for (let offset = 1; offset < lastOffset; offset++) {
            sum -=
                (upper[rowOffset + offset] ?? 0) *
                (solution[row + offset] ?? 0);
        }
        solution[row] = sum / (upper[rowOffset] ?? 1);
    }
    return solution[ddUnits - 1] ?? NaN;
}

function walkCells(grid: WalkGrid): number {
    const { ddUnits, downUnits, targetUnits, upUnits } = grid;
    const interior = targetUnits + ddUnits - 1;
    const upperWidth = upUnits + 1;
    return interior * (upperWidth + 2) + downUnits + upperWidth;
}

function walkGrid(rr: number, target: number, dd: number): Quantity<WalkGrid> {
    if (!(Number.isFinite(rr) && rr > 0)) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    for (
        let downUnits = 1;
        downUnits <= MAX_WALK_RATIO_DENOMINATOR;
        downUnits++
    ) {
        const scaled = rr * downUnits;
        const upUnits = Math.round(scaled);
        if (
            upUnits < 1 ||
            Math.abs(scaled - upUnits) > WALK_TOLERANCE * Math.max(1, scaled)
        ) {
            continue;
        }
        const grid: WalkGrid = {
            ddUnits: barrierUnits(dd, downUnits),
            downUnits,
            targetUnits: barrierUnits(target, downUnits),
            upUnits,
        };
        const work =
            (grid.targetUnits + grid.ddUnits) * downUnits * (upUnits + 1);
        return work > MAX_WALK_WORK || walkCells(grid) > MAX_WALK_CELLS
            ? missingQuantity(EconomicsReason.WalkGridTooLarge)
            : quantityOf(grid);
    }
    return missingQuantity(EconomicsReason.UnsupportedRatio);
}

function walkOf(inputs: EvalPaceInputs): Quantity<Walk> {
    const { drawdown, riskPerTrade, rrRatio, target, winrate } = inputs;
    const targetR = requiredR(target, riskPerTrade);
    if (
        targetR.value === null ||
        !isNonNegativeAmount(drawdown) ||
        !isProbability(winrate)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const drawdownR = drawdown / riskPerTrade;
    const grid = walkGrid(rrRatio, targetR.value, drawdownR);
    return grid.value === null
        ? grid
        : quantityOf({ drawdownR, grid: grid.value, targetR: targetR.value });
}
