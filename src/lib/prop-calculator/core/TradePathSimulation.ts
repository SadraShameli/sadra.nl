export interface TradePathResult {
    outcome: 'loss' | 'win';
    peakR: number;
    steps: number;
}

function computeBarriers(
    rrRatio: number,
    stepsPerR: number,
    source: string,
): { down: number; up: number } {
    if (!(rrRatio > 0)) {
        throw new Error(`${source}: rrRatio must be positive, got ${rrRatio}`);
    }
    const down = stepsPerR;
    const up = Math.round(rrRatio * stepsPerR);
    if (up < 1) {
        throw new Error(
            `${source}: rrRatio (${rrRatio}) is too small for stepsPerR (${stepsPerR}); the up barrier rounds to ${up} steps`,
        );
    }
    return { down, up };
}

function validateStepsPerR(stepsPerR: number, source: string): void {
    if (!Number.isSafeInteger(stepsPerR) || stepsPerR <= 0) {
        throw new Error(
            `${source}: stepsPerR must be a positive integer, got ${stepsPerR}`,
        );
    }
}

const calibrationCache = new Map<string, number>();

export function calibrateStepProbability(
    winrate: number,
    rrRatio: number,
    stepsPerR: number,
): number {
    if (!(winrate > 0 && winrate < 1)) {
        throw new Error(
            `calibrateStepProbability: winrate must be in (0, 1) exclusive, got ${winrate}`,
        );
    }
    validateStepsPerR(stepsPerR, 'calibrateStepProbability');
    const { down: a, up: b } = computeBarriers(
        rrRatio,
        stepsPerR,
        'calibrateStepProbability',
    );

    const cacheKey = `${winrate}|${a}|${b}`;
    const cached = calibrationCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let lo = 0;
    let hi = 1;
    for (let index = 0; index < 100; index++) {
        const mid = (lo + hi) / 2;
        if (stepUpProbabilityToWinChance(mid, a, b) < winrate) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const p = (lo + hi) / 2;
    calibrationCache.set(cacheKey, p);
    return p;
}

export function simulateTradePath(
    p: number,
    stepsPerR: number,
    rrRatio: number,
    rng: () => number,
    maxSteps: number,
): TradePathResult {
    if (!(p >= 0 && p <= 1)) {
        throw new Error(`simulateTradePath: p must be in [0, 1], got ${p}`);
    }
    validateStepsPerR(stepsPerR, 'simulateTradePath');
    if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
        throw new Error(
            `simulateTradePath: maxSteps must be a positive integer, got ${maxSteps}`,
        );
    }
    const { down: a, up: b } = computeBarriers(
        rrRatio,
        stepsPerR,
        'simulateTradePath',
    );

    let position = 0;
    let maxPosition = 0;

    for (let index = 0; index < maxSteps; index++) {
        position += rng() < p ? 1 : -1;
        if (position > maxPosition) maxPosition = position;

        if (position >= b) {
            return { outcome: 'win', peakR: rrRatio, steps: index + 1 };
        }
        if (position <= -a) {
            return {
                outcome: 'loss',
                peakR: maxPosition / stepsPerR,
                steps: index + 1,
            };
        }
    }

    const distanceToWin = b - position;
    const distanceToLoss = position + a;
    const outcome: 'loss' | 'win' =
        distanceToWin <= distanceToLoss ? 'win' : 'loss';

    return {
        outcome,
        peakR:
            outcome === 'win' ? rrRatio : Math.min(maxPosition, b) / stepsPerR,
        steps: maxSteps,
    };
}

function stepUpProbabilityToWinChance(p: number, a: number, b: number): number {
    if (p === 0.5) return a / (a + b);
    if (p > 0.5) {
        const r = (1 - p) / p;
        return (1 - r ** a) / (1 - r ** (a + b));
    }
    const s = p / (1 - p);
    return ((s ** a - 1) * s ** b) / (s ** (a + b) - 1);
}
