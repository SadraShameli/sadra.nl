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
        if (winProbabilityFrom(mid, a, b) < winrate) {
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

    return resolveTruncatedPath(
        p,
        a,
        b,
        position,
        maxPosition,
        stepsPerR,
        rrRatio,
        rng,
        maxSteps,
    );
}

function lossProbabilityFrom(
    p: number,
    distanceToLoss: number,
    distanceToWin: number,
): number {
    return winProbabilityFrom(1 - p, distanceToWin, distanceToLoss);
}

function resolveTruncatedPath(
    p: number,
    a: number,
    b: number,
    position: number,
    maxPosition: number,
    stepsPerR: number,
    rrRatio: number,
    rng: () => number,
    steps: number,
): TradePathResult {
    const winChance = winProbabilityFrom(p, position + a, b - position);
    if (!(Number.isFinite(winChance) && winChance >= 0 && winChance <= 1)) {
        throw new Error(
            `simulateTradePath: truncated path win chance must be in [0, 1], got ${winChance} (p ${p}, position ${position}, barriers -${a}/+${b})`,
        );
    }
    if (rng() < winChance) {
        return { outcome: 'win', peakR: rrRatio, steps };
    }
    return {
        outcome: 'loss',
        peakR:
            sampleLosingPeak(p, a, b, position, maxPosition, rng) / stepsPerR,
        steps,
    };
}

function sampleLosingPeak(
    p: number,
    a: number,
    b: number,
    position: number,
    maxPosition: number,
    rng: () => number,
): number {
    const draw = rng();
    const lossChance = lossProbabilityFrom(p, position + a, b - position);
    const survival = (peak: number): number =>
        (winProbabilityFrom(p, position + a, peak - position) *
            lossProbabilityFrom(p, peak + a, b - peak)) /
        lossChance;

    let lo = maxPosition;
    let hi = b - 1;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (survival(mid) > draw) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo;
}

function winProbabilityFrom(
    p: number,
    distanceToLoss: number,
    distanceToWin: number,
): number {
    if (p === 0.5) return distanceToLoss / (distanceToLoss + distanceToWin);
    if (p > 0.5) {
        const r = (1 - p) / p;
        return (
            (1 - r ** distanceToLoss) /
            (1 - r ** (distanceToLoss + distanceToWin))
        );
    }
    const s = p / (1 - p);
    return (
        ((s ** distanceToLoss - 1) * s ** distanceToWin) /
        (s ** (distanceToLoss + distanceToWin) - 1)
    );
}
