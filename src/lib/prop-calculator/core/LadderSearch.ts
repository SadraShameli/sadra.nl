import { deriveSubSeed, mulberry32 } from '../rng';
import {
    type DailyLossLimitConfig,
    resolveDailyLossLimit,
} from './DailyLossLimit';
import {
    canonicaliseLadder,
    type DayPolicy,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './DayPolicy';
import { type Plan } from './Plan';
import { TradingPhase } from './TradingPhase';

export interface DayDistribution {
    cumulative: readonly number[];
    outcomes: readonly DayOutcome[];
}

export interface DayOutcome {
    finalPnL: number;
    probability: number;
    worstPnL: number;
}

export interface LadderGridConfig {
    lo: number;
    max: number;
    slots: number;
    step: number;
}

export interface LadderScore {
    costPerFunded: number;
    expectedDaysToFunded: number;
    ladder: readonly number[];
    meanDaysOnFail: number;
    meanDaysOnPass: number;
    passRate: number;
}

export interface LadderScoreConfig {
    cushion: number;
    cushionBucketDollars?: number;
    evalPrice: number;
    maxDays: number;
    plan: Plan;
    rrRatio: number;
    rungSizing: RungSizing;
    seedOffset: number;
    sims: number;
    stopRule: DayPolicy['stopRule'];
    winrate: number;
}

const MIN_SCORABLE_PASS_RATE = 0.02;
const DEFAULT_CUSHION_BUCKET_DOLLARS = 50;

export interface LadderSearchOptions {
    grid: LadderGridConfig;
    onProgress?: (progress: LadderSearchProgress) => void;
    progressEvery?: number;
    score: LadderScoreConfig;
    seed: number;
    topN?: number;
}

export interface LadderSearchProgress {
    completed: number;
    total: number;
}

export interface LadderSearchResult {
    byCost: readonly LadderScore[];
    byPassRate: readonly LadderScore[];
    bySpeed: readonly LadderScore[];
    droppedAliasCount: number;
    frontier: readonly LadderScore[];
    gridSize: number;
    laddersScored: number;
    topN: number;
    unscorableCount: number;
}

export function buildLadderGrid(config: LadderGridConfig): number[][] {
    const { lo, max, slots, step } = config;
    const values: number[] = [];
    for (let v = lo; v <= max; v += step) values.push(v);
    if (values.length === 0 || slots < 1) return [];

    const grid: number[][] = [];
    const build = (prefix: number[]): void => {
        if (prefix.length === slots) {
            grid.push([...prefix]);
            return;
        }
        const options = prefix.length === 0 ? values : [0, ...values];
        for (const value of options) {
            if (value === 0) {
                grid.push([...prefix]);
                continue;
            }
            build([...prefix, value]);
        }
    };
    build([]);
    return grid;
}

export function canonicaliseGrid(grid: readonly number[][]): number[][] {
    const seen = new Set<string>();
    const out: number[][] = [];
    for (const ladder of grid) {
        const canonical = canonicaliseLadder(ladder);
        if (canonical.length === 0) continue;
        const key = canonical.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(canonical);
    }
    return out;
}

export function enumerateDay(options: {
    cushion: number;
    dailyLossLimit: null | number;
    dayPolicy: DayPolicy;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: number;
}): DayDistribution {
    const { cushion, dailyLossLimit, dayPolicy, rrRatio, rungSizing, winrate } =
        options;
    const { ladder, maxLossesPerDay, stopRule } = dayPolicy;
    const outcomes: DayOutcome[] = [];

    const walk = (
        index: number,
        dayPnL: number,
        worstPnL: number,
        probability: number,
        losses: number,
        hasWon: boolean,
    ): void => {
        const remaining = cushion + dayPnL;
        const intended = ladder[index];
        const isStopped =
            index >= ladder.length ||
            intended === undefined ||
            remaining <= 0 ||
            (maxLossesPerDay !== null && losses >= maxLossesPerDay) ||
            shouldStopDay(stopRule, hasWon, losses, dayPnL);

        if (isStopped) {
            outcomes.push({ finalPnL: dayPnL, probability, worstPnL });
            return;
        }

        const affordable =
            dailyLossLimit === null
                ? remaining
                : Math.min(remaining, dailyLossLimit + dayPnL);
        const risk = resolveTradeRisk(intended, affordable, rungSizing);
        if (risk <= 0) {
            outcomes.push({ finalPnL: dayPnL, probability, worstPnL });
            return;
        }

        const win = dayPnL + risk * rrRatio;
        walk(
            index + 1,
            win,
            Math.min(worstPnL, win),
            probability * winrate,
            losses,
            true,
        );
        const loss = dayPnL - risk;
        walk(
            index + 1,
            loss,
            Math.min(worstPnL, loss),
            probability * (1 - winrate),
            losses + 1,
            hasWon,
        );
    };

    walk(0, 0, 0, 1, 0, false);

    const cumulative: number[] = [];
    let running = 0;
    for (const outcome of outcomes) {
        running += outcome.probability;
        cumulative.push(running);
    }
    return { cumulative, outcomes };
}

export function scoreLadder(
    ladder: readonly number[],
    config: LadderScoreConfig,
    rng: () => number,
): LadderScore {
    const {
        cushionBucketDollars = DEFAULT_CUSHION_BUCKET_DOLLARS,
        evalPrice,
        maxDays,
        plan,
        rrRatio,
        rungSizing,
        sims,
        stopRule,
        winrate,
    } = config;

    const uncappedThreshold = ladder.reduce((sum, rung) => sum + rung, 0);
    const dailyLossLimitConfig = plan.dailyLossLimitFor(TradingPhase.Eval);
    const distributionCache = new Map<string, DayDistribution>();
    const distributionFor = (
        currentCushion: number,
        dailyLossLimit: null | number,
    ): DayDistribution => {
        const clamped = Math.max(0, currentCushion);
        const bucket =
            clamped >= uncappedThreshold
                ? uncappedThreshold
                : Math.floor(clamped / cushionBucketDollars) *
                  cushionBucketDollars;
        const key = `${bucket}:${dailyLossLimit ?? 'none'}`;
        const cached = distributionCache.get(key);
        if (cached !== undefined) return cached;
        const computed = enumerateDay({
            cushion: bucket,
            dailyLossLimit,
            dayPolicy: { ladder, maxLossesPerDay: null, stopRule },
            rrRatio,
            rungSizing,
            winrate,
        });
        distributionCache.set(key, computed);
        return computed;
    };

    const start = plan.accountSize;
    const mll = plan.drawdown.amount;
    const lock = plan.drawdown.lock;
    const lockTrigger = lock ? start + lock.atProfit : Infinity;
    const lockedFloor = lock ? lock.lockedThreshold(start) : -Infinity;
    const target = plan.profitTarget;
    const minDays = plan.minTradingDays;
    const consistency = plan.evalConsistencyRule()?.maxBestDayShare ?? null;

    let passes = 0;
    let daysOnPassSum = 0;
    let daysOnFailSum = 0;
    let fails = 0;

    for (let sim = 0; sim < sims; sim++) {
        const attempt = runLadderAttempt({
            consistency,
            dailyLossLimitConfig,
            distributionFor,
            lockedFloor,
            lockTrigger,
            maxDays,
            minDays,
            mll,
            rng,
            start,
            target,
        });
        if (attempt.isPassed) {
            passes += 1;
            daysOnPassSum += attempt.endDay;
        } else {
            fails += 1;
            daysOnFailSum += attempt.endDay;
        }
    }

    const passRate = passes / Math.max(1, sims);
    const meanDaysOnPass = passes > 0 ? daysOnPassSum / passes : 0;
    const meanDaysOnFail = fails > 0 ? daysOnFailSum / fails : 0;

    if (passRate < MIN_SCORABLE_PASS_RATE) {
        return {
            costPerFunded: Infinity,
            expectedDaysToFunded: Infinity,
            ladder,
            meanDaysOnFail,
            meanDaysOnPass,
            passRate,
        };
    }

    const attempts = 1 / passRate;
    return {
        costPerFunded: evalPrice * attempts,
        expectedDaysToFunded: meanDaysOnPass + (attempts - 1) * meanDaysOnFail,
        ladder,
        meanDaysOnFail,
        meanDaysOnPass,
        passRate,
    };
}

function runLadderAttempt(options: {
    consistency: null | number;
    dailyLossLimitConfig: DailyLossLimitConfig;
    distributionFor: (
        currentCushion: number,
        dailyLossLimit: null | number,
    ) => DayDistribution;
    lockedFloor: number;
    lockTrigger: number;
    maxDays: number;
    minDays: number;
    mll: number;
    rng: () => number;
    start: number;
    target: number;
}): { endDay: number; isPassed: boolean } {
    const {
        consistency,
        dailyLossLimitConfig,
        distributionFor,
        lockedFloor,
        lockTrigger,
        maxDays,
        minDays,
        mll,
        rng,
        start,
        target,
    } = options;
    let balance = start;
    let peak = start;
    let isLocked = false;
    let bestDay = -Infinity;
    let days = 0;

    for (let day = 1; day <= maxDays; day++) {
        const floor = isLocked
            ? lockedFloor
            : Math.min(peak, lockTrigger) - mll;
        const dailyLossLimit = resolveDailyLossLimit(dailyLossLimitConfig, {
            isThresholdLocked: isLocked,
            peakDayCloseProfit: peak - start,
            profit: balance - start,
        });
        const draw = sampleDay(
            distributionFor(balance - floor, dailyLossLimit),
            rng(),
        );

        if (balance + draw.worstPnL <= floor) {
            return { endDay: day, isPassed: false };
        }

        balance += draw.finalPnL;
        if (draw.finalPnL > bestDay) bestDay = draw.finalPnL;
        days += 1;
        if (balance > peak) peak = balance;
        if (peak >= lockTrigger) isLocked = true;

        const profit = balance - start;
        const isConsistent =
            consistency === null ||
            profit <= 0 ||
            bestDay <= consistency * profit;
        if (isConsistent && days >= minDays && profit >= target) {
            return { endDay: day, isPassed: true };
        }
    }

    return { endDay: maxDays, isPassed: false };
}

function sampleDay(distribution: DayDistribution, u: number): DayOutcome {
    const { cumulative, outcomes } = distribution;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
        const mid = (low + high) >> 1;
        if ((cumulative[mid] ?? 1) < u) low = mid + 1;
        else high = mid;
    }
    return outcomes[low] ?? { finalPnL: 0, probability: 1, worstPnL: 0 };
}

const DEFAULT_TOP_N = 25;
const DEFAULT_PROGRESS_EVERY = 250;

export function ladderFrontier(scores: readonly LadderScore[]): LadderScore[] {
    const scorable = scores.filter(
        (score) =>
            Number.isFinite(score.expectedDaysToFunded) &&
            Number.isFinite(score.costPerFunded),
    );
    const sorted = scorable.toSorted(
        (a, b) =>
            a.expectedDaysToFunded - b.expectedDaysToFunded ||
            a.costPerFunded - b.costPerFunded,
    );
    const frontier: LadderScore[] = [];
    let bestCost = Infinity;
    for (const score of sorted) {
        if (!(score.costPerFunded < bestCost)) {
            continue;
        }

        frontier.push(score);
        bestCost = score.costPerFunded;
    }
    return frontier;
}

export function runLadderSearch(
    options: LadderSearchOptions,
): LadderSearchResult {
    const {
        grid,
        onProgress,
        progressEvery = DEFAULT_PROGRESS_EVERY,
        score,
        seed,
        topN = DEFAULT_TOP_N,
    } = options;

    const raw = buildLadderGrid(grid);
    const ladders = canonicaliseGrid(raw);
    const total = ladders.length;
    const scores: LadderScore[] = [];

    for (const [index, ladder] of ladders.entries()) {
        const streamSeed = deriveSubSeed(seed, index, 0);
        scores.push(scoreLadder(ladder, score, mulberry32(streamSeed)));
        if (onProgress && (index + 1) % progressEvery === 0) {
            onProgress({ completed: index + 1, total });
        }
    }
    onProgress?.({ completed: total, total });

    const scorable = scores.filter((s) =>
        Number.isFinite(s.expectedDaysToFunded),
    );

    return {
        byCost: scorable
            .toSorted((a, b) => a.costPerFunded - b.costPerFunded)
            .slice(0, topN),
        byPassRate: scorable
            .toSorted((a, b) => b.passRate - a.passRate)
            .slice(0, topN),
        bySpeed: scorable
            .toSorted((a, b) => a.expectedDaysToFunded - b.expectedDaysToFunded)
            .slice(0, topN),
        droppedAliasCount: raw.length - total,
        frontier: ladderFrontier(scorable),
        gridSize: raw.length,
        laddersScored: total,
        topN,
        unscorableCount: scores.length - scorable.length,
    };
}
