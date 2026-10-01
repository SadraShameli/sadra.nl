import { EdgeModel } from './EdgeModel';
import { fraction, type Fraction0to1 } from './lib/units';

const MU_SEARCH_BOUND = 100;
const MU_SEARCH_ITERATIONS = 200;
const MU_FIT_TOLERANCE = 1e-6;

export class DriftEdge extends EdgeModel {
    static fittedTo(winrate: number, anchorRrRatio: number): DriftEdge {
        if (!(winrate > 0 && winrate < 1)) {
            throw new DriftEdgeFitError(
                `a win rate to fit must be a number strictly between 0 and 1, got ${winrate}`,
            );
        }
        if (!(anchorRrRatio > 0)) {
            throw new DriftEdgeFitError(
                `the anchor reward-to-risk ratio must be positive, got ${anchorRrRatio}`,
            );
        }
        const mu = solveMu(winrate, anchorRrRatio);
        if (
            Math.abs(driftWinProbability(mu, anchorRrRatio) - winrate) >
            MU_FIT_TOLERANCE
        ) {
            throw new DriftEdgeFitError(
                `could not fit a drift edge to win rate ${winrate} at rr ${anchorRrRatio}`,
            );
        }
        return new DriftEdge(mu);
    }

    static withMu(mu: number): DriftEdge {
        return new DriftEdge(mu);
    }

    private constructor(readonly mu: number) {
        super();
    }

    winProbability(rrRatio: number): Fraction0to1 {
        return fraction(driftWinProbability(this.mu, rrRatio));
    }
}

export class DriftEdgeFitError extends Error {}

function driftWinProbability(mu: number, rrRatio: number): number {
    if (mu === 0) return 1 / (1 + rrRatio);
    const numerator = -Math.expm1(-2 * mu);
    const denominator = -Math.expm1(-2 * mu * (1 + rrRatio));
    return numerator / denominator;
}

function solveMu(targetWinrate: number, rrRatio: number): number {
    let low = -MU_SEARCH_BOUND;
    let high = MU_SEARCH_BOUND;
    for (let iteration = 0; iteration < MU_SEARCH_ITERATIONS; iteration += 1) {
        const mid = (low + high) / 2;
        if (driftWinProbability(mid, rrRatio) < targetWinrate) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return (low + high) / 2;
}
