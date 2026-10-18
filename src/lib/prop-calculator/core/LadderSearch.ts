import { z } from 'zod';

import { deriveSubSeed, mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    binomialStandardError,
    type Estimate,
    meanStandardError,
    propagatedStandardError,
} from '~/lib/prop-calculator/stats';

import { type AccountState, resetForNewDay } from './AccountState';
import { TRADING_DAYS_PER_MONTH } from './constants';
import { DailyLossLimitKind, resolveDailyLossLimit } from './DailyLossLimit';
import {
    canonicaliseLadder,
    type DayPolicy,
    PolicySizing,
    resolveAffordableRisk,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './DayPolicy';
import { type DrawdownStrategy } from './DrawdownStrategy';
import {
    remainingEvalSessions,
    subscriptionElapsedDaysIssue,
} from './EvalStartState';
import { type CouponDiscounts, monthlySubscriptionFee } from './FeeSchedule';
import { CENTS_PER_DOLLAR, type ContractCount } from './lib/units';
import { type Plan } from './Plan';
import {
    capRiskToContractLimit,
    evalContractLimit,
    type PositionSizingConfig,
} from './PositionSizing';
import {
    type AttemptDaySamples,
    replacementEconomics,
    replacementEconomicsFromState,
} from './Replacement';
import { applyTrade, closeTradingDay, recordBestDay } from './TradingDayLedger';
import { TradingPhase } from './TradingPhase';

export interface DayDistribution {
    cumulative: readonly number[];
    outcomes: readonly DayOutcome[];
}

export interface DayOutcome {
    finalPnL: number;
    probability: number;
    tradePnLs: readonly number[];
    worstPnL: number;
}

export interface LadderAttemptStats {
    meanDaysOnFail: number;
    meanDaysOnPass: number;
    passRate: number;
    passRateStandardError: number;
}

export interface LadderGridConfig {
    lo: number;
    max: number;
    slots: number;
    step: number;
}

export interface LadderScore {
    costPerFunded: number;
    costPerFundedStandardError: number;
    expectedDaysToFunded: number;
    expectedDaysToFundedStandardError: number;
    freshAttempt?: LadderAttemptStats;
    ladder: readonly number[];
    meanDaysOnFail: number;
    meanDaysOnPass: number;
    passRate: number;
    passRateStandardError: number;
}

export interface LadderScoreConfig {
    commission: number;
    cushion: number;
    cushionBucketDollars?: number;
    discounts?: CouponDiscounts;
    maxDays: number;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    rrRatio: number;
    rungSizing: RungSizing;
    seedOffset: number;
    sims: number;
    startState?: AccountState;
    stopRule: DayPolicy['stopRule'];
    subscriptionElapsedDays?: number;
    winrate: number;
}

export const LADDER_EVAL_PASS_FLOOR = 0.02;
const DEFAULT_CUSHION_BUCKET_DOLLARS = 50;
const LADDER_TRIAL_SUBSTREAM = 0;

interface AttemptSummary {
    estimates: readonly Estimate[];
    samples: AttemptDaySamples;
    stats: LadderAttemptStats;
}

interface AttemptTally {
    daysOnFailSquaredSum: number;
    daysOnFailSum: number;
    daysOnPassSquaredSum: number;
    daysOnPassSum: number;
    failDays: number[];
    passDays: number[];
}

interface LadderAttempt {
    endDay: number;
    isPassed: boolean;
}

interface LadderCosting {
    discounts: CouponDiscounts | undefined;
    plan: Plan;
}

interface ResolvedStart {
    remainingSessions: number;
    state: AccountState;
    subscriptionElapsedDays: number;
}

const UNSCORABLE_COSTS = {
    costPerFunded: Infinity,
    costPerFundedStandardError: Infinity,
    expectedDaysToFunded: Infinity,
    expectedDaysToFundedStandardError: Infinity,
} as const;

export interface LadderScoreRanking {
    byCost: readonly LadderScore[];
    byPassRate: readonly LadderScore[];
    bySpeed: readonly LadderScore[];
    frontier: readonly LadderScore[];
    unscorableCount: number;
}

export interface LadderSearchOptions {
    grid: LadderGridConfig;
    maxGridSize?: number;
    onProgress?: (progress: LadderSearchProgress) => void;
    progressEvery?: number;
    score: LadderScoreConfig;
    seed: number;
    topN?: number;
    transformLadder?: (ladder: readonly number[]) => readonly number[];
}

export interface LadderSearchProgress {
    completed: number;
    total: number;
}

export interface LadderSearchResult extends LadderScoreRanking {
    droppedAliasCount: number;
    gridSize: number;
    laddersScored: number;
    topN: number;
}

export const MAX_LADDER_GRID_SIZE = 1_000_000;

export const MAX_LADDER_SLOTS = 20;

const DEFAULT_MAX_RUNG_SHARE_OF_CUSHION = 0.4;
const GRID_VALUE_PRECISION = 12;
export const GRID_COUNT_TOLERANCE = 1e-9;

export const ladderGridConfigSchema = z
    .object({
        lo: z.number('must be a finite number').positive('must be > 0'),
        max: z.number('must be a finite number'),
        slots: z
            .number('must be a finite number')
            .int('must be a whole number')
            .positive('must be >= 1')
            .max(MAX_LADDER_SLOTS, `must be <= ${MAX_LADDER_SLOTS}`),
        step: z.number('must be a finite number').positive('must be > 0'),
    })
    .refine((config) => config.max >= config.lo, {
        message: 'must be >=',
        params: { bound: 'lo' },
        path: ['max'],
    });

const ladderGridFieldSchema = ladderGridConfigSchema.keyof();

const ladderGridLimitSchema = z
    .number('must be a finite number')
    .int('must be a whole number')
    .positive('must be >= 1');

export interface LadderGridLabels extends Readonly<
    Record<keyof LadderGridConfig, string>
> {
    readonly limit?: string;
}

const LADDER_GRID_FIELD_NAMES: LadderGridLabels = {
    lo: 'lo',
    max: 'max',
    slots: 'slots',
    step: 'step',
};

export abstract class LadderGridError extends RangeError {
    abstract describe(labels: LadderGridLabels): string;
}

export class LadderGridFieldError extends LadderGridError {
    readonly bound: keyof LadderGridConfig | undefined;
    readonly field: keyof LadderGridConfig;
    readonly requirement: string;
    readonly value: number;

    constructor(options: {
        bound?: keyof LadderGridConfig;
        field: keyof LadderGridConfig;
        requirement: string;
        value: number;
    }) {
        super('');
        this.name = 'LadderGridFieldError';
        this.bound = options.bound;
        this.field = options.field;
        this.requirement = options.requirement;
        this.value = options.value;
        this.message = `ladder grid ${this.describe(LADDER_GRID_FIELD_NAMES)}`;
    }

    describe(labels: LadderGridLabels): string {
        const requirement =
            this.bound === undefined
                ? this.requirement
                : `${this.requirement} ${labels[this.bound]}`;
        return `${labels[this.field]} ${requirement}, got "${String(this.value)}"`;
    }
}

export class LadderGridSizeError extends LadderGridError {
    readonly limit: number;
    readonly size: number;

    constructor(size: number, limit: number) {
        super(
            `ladder grid has ${size.toLocaleString('en-US')} ladders, above the ${limit.toLocaleString('en-US')} limit`,
        );
        this.name = 'LadderGridSizeError';
        this.limit = limit;
        this.size = size;
    }

    describe(labels: LadderGridLabels): string {
        const remedies = [
            `raise ${labels.step}`,
            `lower ${labels.slots}`,
            `narrow ${labels.lo}/${labels.max}`,
            ...(labels.limit === undefined ? [] : [`raise ${labels.limit}`]),
        ];
        return `${this.message}: ${remedies.slice(0, -1).join(', ')} or ${remedies.at(-1) ?? ''}`;
    }
}

export function assertLadderGridSize(
    config: LadderGridConfig,
    limit: number = MAX_LADDER_GRID_SIZE,
): number {
    const parsedLimit = ladderGridLimitSchema.safeParse(limit);
    if (!parsedLimit.success) {
        throw new RangeError(
            `ladder grid limit ${parsedLimit.error.issues[0]?.message ?? 'is invalid'}, got ${String(limit)}`,
        );
    }
    const size = ladderGridSize(config);
    if (size > limit) throw new LadderGridSizeError(size, limit);
    return size;
}

export function buildLadderGrid(
    config: LadderGridConfig,
    limit: number = MAX_LADDER_GRID_SIZE,
): number[][] {
    assertLadderGridSize(config, limit);
    const { lo, slots, step } = config;
    const values = Array.from(
        { length: ladderGridValueCount(config) },
        (_, index) =>
            Number((lo + index * step).toPrecision(GRID_VALUE_PRECISION)),
    );

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

export function defaultLadderGridMax(cushion: number): number {
    return Math.round(cushion * DEFAULT_MAX_RUNG_SHARE_OF_CUSHION);
}

export function enumerateDay(options: {
    commission: number;
    contractLimit: ContractCount | null;
    dailyLossLimit: null | number;
    dayPolicy: DayPolicy;
    dayStart: AccountState;
    drawdown: DrawdownStrategy;
    positionSizing: null | PositionSizingConfig;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: number;
}): DayDistribution {
    const {
        commission,
        contractLimit,
        dailyLossLimit,
        dayPolicy,
        dayStart,
        drawdown,
        positionSizing,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const { ladder, maxLossesPerDay, stopRule } = dayPolicy;
    const outcomes: DayOutcome[] = [];

    const walk = (
        state: AccountState,
        index: number,
        worstPnL: number,
        probability: number,
        losses: number,
        hasWon: boolean,
        tradePnLs: readonly number[],
    ): void => {
        const dayPnL = state.todayPnL;
        const remaining = state.balance - state.threshold;
        const intended = ladder[index];
        const isStopped =
            index >= ladder.length ||
            intended === undefined ||
            remaining <= 0 ||
            (maxLossesPerDay !== null && losses >= maxLossesPerDay) ||
            shouldStopDay(stopRule, hasWon, losses, dayPnL);
        const risk = isStopped
            ? 0
            : resolveTradeRisk(
                  positionSizing === null
                      ? intended
                      : capRiskToContractLimit(
                            intended,
                            positionSizing,
                            contractLimit,
                        ),
                  resolveAffordableRisk(
                      remaining,
                      dailyLossLimit,
                      dayPnL,
                      commission,
                  ),
                  rungSizing,
              );
        if (risk <= 0) {
            outcomes.push({
                finalPnL: dayPnL,
                probability,
                tradePnLs,
                worstPnL,
            });
            return;
        }

        const trade = (
            pnl: number,
            branchProbability: number,
            branchLosses: number,
            hasBranchWon: boolean,
        ): void => {
            const next: AccountState = {
                ...state,
                balance: state.balance + pnl,
                todayPnL: dayPnL + pnl,
            };
            drawdown.onTrade(next, pnl);
            walk(
                next,
                index + 1,
                Math.min(worstPnL, next.todayPnL),
                branchProbability,
                branchLosses,
                hasBranchWon,
                [...tradePnLs, pnl],
            );
        };
        trade(risk * rrRatio - commission, probability * winrate, losses, true);
        trade(
            -risk - commission,
            probability * (1 - winrate),
            losses + 1,
            hasWon,
        );
    };

    walk({ ...dayStart, todayPnL: 0 }, 0, 0, 1, 0, false, []);

    const cumulative: number[] = [];
    let running = 0;
    for (const outcome of outcomes) {
        running += outcome.probability;
        cumulative.push(running);
    }
    return { cumulative, outcomes };
}

export function ladderGridSize(config: LadderGridConfig): number {
    const { slots } = validateLadderGrid(config);
    const valueCount = ladderGridValueCount(config);
    if (valueCount === 1) return slots;
    let total = 0;
    let ladders = 1;
    for (let length = 1; length <= slots; length++) {
        ladders *= valueCount;
        total += ladders;
        if (total > Number.MAX_SAFE_INTEGER) return total;
    }
    return total;
}

export function ladderTrialStreams(seed: number): (trial: number) => Rng {
    return (trial) =>
        mulberry32(deriveSubSeed(seed, trial, LADDER_TRIAL_SUBSTREAM));
}

export function scoreLadder(
    ladder: readonly number[],
    config: LadderScoreConfig,
    trialRng: (trial: number) => Rng,
): LadderScore {
    const {
        commission,
        cushionBucketDollars = DEFAULT_CUSHION_BUCKET_DOLLARS,
        discounts,
        maxDays,
        plan,
        positionSizing,
        rrRatio,
        rungSizing,
        sims,
        stopRule,
        winrate,
    } = config;
    const start = resolveStart(config);
    const evalDayCap = plan.evalDayCap(maxDays);
    const drawdown = plan.drawdownFor(TradingPhase.Eval);
    const contractLimit =
        positionSizing === null
            ? null
            : evalContractLimit(
                  plan.contractLimits,
                  positionSizing.instrument.isMicro,
              );

    const uncappedThreshold = ladder.reduce(
        (sum, rung) => sum + rung + commission,
        0,
    );
    const lockBucketCap = uncappedThreshold * rrRatio + cushionBucketDollars;
    const lockAtProfit = drawdown.lock?.atProfit ?? 0;
    const uncappedCushionIndex =
        Math.ceil(uncappedThreshold * CENTS_PER_DOLLAR) + 1;
    const cappedLockIndex = Math.ceil(lockBucketCap / cushionBucketDollars);
    const distributionCaches = new Map<
        null | number,
        Map<number, DayDistribution>
    >();
    const distributionFor = (
        state: AccountState,
        dailyLossLimit: null | number,
    ): DayDistribution => {
        const cushion = Math.max(0, state.balance - state.threshold);
        const cushionIndex =
            cushion >= uncappedThreshold
                ? uncappedCushionIndex
                : cushionCents(cushion);
        const lockDistance = Math.max(0, drawdown.intradayLockDistance(state));
        const lockIndex = Math.min(
            Math.floor(lockDistance / cushionBucketDollars),
            cappedLockIndex,
        );
        const key =
            (lockIndex * (uncappedCushionIndex + 1) + cushionIndex) * 2 +
            (state.thresholdLocked ? 1 : 0);
        let cache = distributionCaches.get(dailyLossLimit);
        if (cache === undefined) {
            cache = new Map<number, DayDistribution>();
            distributionCaches.set(dailyLossLimit, cache);
        }
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const cushionBucket =
            cushionIndex === uncappedCushionIndex
                ? uncappedThreshold
                : cushionIndex / CENTS_PER_DOLLAR;
        const lockBucket =
            lockIndex === cappedLockIndex
                ? lockBucketCap
                : lockIndex * cushionBucketDollars;
        const balance = plan.accountSize + lockAtProfit - lockBucket;
        const computed = enumerateDay({
            commission,
            contractLimit,
            dailyLossLimit,
            dayPolicy: {
                ladder,
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule,
            },
            dayStart: {
                ...state,
                balance,
                startingBalance: plan.accountSize,
                threshold: balance - cushionBucket,
            },
            drawdown,
            positionSizing,
            rrRatio,
            rungSizing,
            winrate,
        });
        cache.set(key, computed);
        return computed;
    };

    const fresh = summarizeAttempts(
        tallyAttempts(sims, (sim) =>
            runLadderAttempt(
                plan,
                evalDayCap,
                distributionFor,
                trialRng(sim),
                plan.initialState(),
            ),
        ),
        sims,
    );
    const costing: LadderCosting = { discounts, plan };
    if (start === null) return freshLadderScore(ladder, costing, fresh);
    const current = summarizeAttempts(
        tallyAttempts(sims, (trial) =>
            runLadderAttempt(
                plan,
                start.remainingSessions,
                distributionFor,
                trialRng(sims + trial),
                { ...start.state },
            ),
        ),
        sims,
    );
    return fromStateLadderScore(ladder, costing, {
        current,
        fresh,
        subscriptionElapsedDays: start.subscriptionElapsedDays,
    });
}

export function validateLadderGrid(config: LadderGridConfig): LadderGridConfig {
    const parsed = ladderGridConfigSchema.safeParse(config);
    if (!parsed.success) {
        const [issue] = parsed.error.issues;
        const field = ladderGridFieldSchema.parse(issue?.path[0]);
        const bound =
            issue?.code === 'custom'
                ? ladderGridFieldSchema.parse(issue.params?.bound)
                : undefined;
        throw new LadderGridFieldError({
            bound,
            field,
            requirement: issue?.message ?? 'is invalid',
            value: config[field],
        });
    }
    return config;
}

function cushionCents(cushion: number): number {
    return cushion > 0
        ? Math.max(1, Math.round(cushion * CENTS_PER_DOLLAR))
        : 0;
}

function freshLadderScore(
    ladder: readonly number[],
    costing: LadderCosting,
    fresh: AttemptSummary,
): LadderScore {
    const { discounts, plan } = costing;
    const { estimates, samples, stats } = fresh;
    const { meanDaysOnFail, meanDaysOnPass, passRate } = stats;

    if (passRate < LADDER_EVAL_PASS_FLOOR) {
        return { ...UNSCORABLE_COSTS, ladder, ...stats };
    }

    const daysAt = (values: readonly number[]) =>
        replacementEconomics({
            discounts,
            evalPassRate: Math.min(1, values[0] ?? passRate),
            fees: plan.fees,
            meanDaysOnFail: values[2] ?? meanDaysOnFail,
            meanDaysOnPass: values[1] ?? meanDaysOnPass,
        }).daysPerFundedAccount;
    const billedCosts = new Map<number, number>();
    const billedCostAt = (evalPassRate: number): number => {
        const cached = billedCosts.get(evalPassRate);
        if (cached !== undefined) return cached;
        const cost = replacementEconomics({
            attemptDays: samples,
            discounts,
            evalPassRate,
            fees: plan.fees,
            meanDaysOnFail,
            meanDaysOnPass,
        }).costPerFundedAccount;
        billedCosts.set(evalPassRate, cost);
        return cost;
    };
    const subscriptionPerDay = subscriptionFeePerDay(costing);
    const costAt = (values: readonly number[]): number => {
        const evalPassRate = Math.min(1, values[0] ?? passRate);
        return (
            billedCostAt(evalPassRate) +
            subscriptionPerDay *
                (daysAt(values) -
                    daysAt([evalPassRate, meanDaysOnPass, meanDaysOnFail]))
        );
    };
    return {
        costPerFunded: billedCostAt(passRate),
        costPerFundedStandardError: propagatedStandardError(costAt, estimates),
        expectedDaysToFunded: daysAt([passRate]),
        expectedDaysToFundedStandardError: propagatedStandardError(
            daysAt,
            estimates,
        ),
        ladder,
        ...stats,
    };
}

function fromStateLadderScore(
    ladder: readonly number[],
    costing: LadderCosting,
    attempts: {
        current: AttemptSummary;
        fresh: AttemptSummary;
        subscriptionElapsedDays: number;
    },
): LadderScore {
    const { discounts, plan } = costing;
    const { current, fresh, subscriptionElapsedDays } = attempts;
    const reported = { freshAttempt: fresh.stats, ladder, ...current.stats };
    if (
        current.stats.passRate < 1 &&
        fresh.stats.passRate < LADDER_EVAL_PASS_FLOOR
    ) {
        return { ...UNSCORABLE_COSTS, ...reported };
    }

    const estimates = [...current.estimates, ...fresh.estimates];
    const center = estimates.map((estimate) => estimate.value);
    const economicsAt = (values: readonly number[], isSampled: boolean) => {
        const at = (index: number) => values[index] ?? center[index] ?? 0;
        return replacementEconomicsFromState({
            current: {
                attemptDays: isSampled ? current.samples : undefined,
                meanDaysOnFail: at(2),
                meanDaysOnPass: at(1),
                passRate: Math.min(1, at(0)),
                subscriptionElapsedDays,
            },
            fresh: {
                attemptDays: isSampled ? fresh.samples : undefined,
                discounts,
                evalPassRate: Math.min(1, at(3)),
                fees: plan.fees,
                meanDaysOnFail: at(5),
                meanDaysOnPass: at(4),
            },
        });
    };
    const daysAt = (values: readonly number[]) =>
        economicsAt(values, false).daysPerFundedAccount;
    const billedCosts = new Map<string, number>();
    const billedCostAt = (values: readonly number[]): number => {
        const key = `${String(values[0])},${String(values[3])}`;
        const cached = billedCosts.get(key);
        if (cached !== undefined) return cached;
        const cost = economicsAt(values, true).costPerFundedAccount;
        billedCosts.set(key, cost);
        return cost;
    };
    const subscriptionPerDay = subscriptionFeePerDay(costing);
    const costAt = (values: readonly number[]): number => {
        const probabilities = center.map((value, index) =>
            index === 0 || index === 3
                ? Math.min(1, values[index] ?? value)
                : value,
        );
        return (
            billedCostAt(probabilities) +
            subscriptionPerDay * (daysAt(values) - daysAt(probabilities))
        );
    };
    return {
        costPerFunded: billedCostAt(center),
        costPerFundedStandardError: propagatedStandardError(costAt, estimates),
        expectedDaysToFunded: daysAt(center),
        expectedDaysToFundedStandardError: propagatedStandardError(
            daysAt,
            estimates,
        ),
        ...reported,
    };
}

function ladderGridValueCount(config: LadderGridConfig): number {
    return (
        Math.floor(
            (config.max - config.lo) / config.step + GRID_COUNT_TOLERANCE,
        ) + 1
    );
}

function resolveStart(config: LadderScoreConfig): null | ResolvedStart {
    const { maxDays, plan, startState, subscriptionElapsedDays } = config;
    if (startState === undefined) {
        if (subscriptionElapsedDays !== undefined) {
            throw new RangeError('subscriptionElapsedDays needs a startState');
        }
        return null;
    }
    const remainingSessions = remainingEvalSessions(plan, startState, maxDays);
    const billedDays = subscriptionElapsedDays ?? startState.elapsedDays ?? 0;
    const issue = subscriptionElapsedDaysIssue(startState, billedDays);
    if (issue !== null) {
        throw new RangeError(`invalid eval start state: ${issue}`);
    }
    return {
        remainingSessions,
        state: startState,
        subscriptionElapsedDays: billedDays,
    };
}

function runLadderAttempt(
    plan: Plan,
    dayCap: number,
    distributionFor: (
        state: AccountState,
        dailyLossLimit: null | number,
    ) => DayDistribution,
    rng: Rng,
    state: AccountState,
): LadderAttempt {
    const phase = TradingPhase.Eval;
    const dailyLossLimitConfig = plan.dailyLossLimitFor(phase);
    const hasDailyLossLimit =
        dailyLossLimitConfig.kind !== DailyLossLimitKind.None;

    for (let day = 1; day <= dayCap; day++) {
        resetForNewDay(state);
        const dailyLossLimit = hasDailyLossLimit
            ? resolveDailyLossLimit(
                  dailyLossLimitConfig,
                  plan.dailyLossLimitContext(state),
              )
            : null;
        const { tradePnLs } = sampleDay(
            distributionFor(state, dailyLossLimit),
            rng(),
        );
        for (const pnl of tradePnLs) {
            applyTrade(plan, phase, state, pnl);
            if (plan.isBust(state, phase)) {
                return { endDay: day, isPassed: false };
            }
        }
        closeTradingDay(plan, phase, state, tradePnLs.length > 0);
        recordBestDay(state);
        if (plan.isBust(state, phase)) return { endDay: day, isPassed: false };
        if (plan.isPassed(state)) return { endDay: day, isPassed: true };
    }

    return { endDay: dayCap, isPassed: false };
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
    return (
        outcomes[low] ?? {
            finalPnL: 0,
            probability: 1,
            tradePnLs: [],
            worstPnL: 0,
        }
    );
}

function subscriptionFeePerDay(costing: LadderCosting): number {
    return (
        monthlySubscriptionFee(costing.plan.fees, costing.discounts) /
        TRADING_DAYS_PER_MONTH
    );
}

function summarizeAttempts(tally: AttemptTally, sims: number): AttemptSummary {
    const {
        daysOnFailSquaredSum,
        daysOnFailSum,
        daysOnPassSquaredSum,
        daysOnPassSum,
        failDays,
        passDays,
    } = tally;
    const passes = passDays.length;
    const fails = failDays.length;
    const passRate = passes / Math.max(1, sims);
    const meanDaysOnPass = passes > 0 ? daysOnPassSum / passes : 0;
    const meanDaysOnFail = fails > 0 ? daysOnFailSum / fails : 0;
    const passRateStandardError = binomialStandardError(passRate, sims);
    return {
        estimates: [
            { standardError: passRateStandardError, value: passRate },
            {
                standardError: meanStandardError(
                    daysOnPassSum,
                    daysOnPassSquaredSum,
                    passes,
                ),
                value: meanDaysOnPass,
            },
            {
                standardError: meanStandardError(
                    daysOnFailSum,
                    daysOnFailSquaredSum,
                    fails,
                ),
                value: meanDaysOnFail,
            },
        ],
        samples: { failDays, passDays },
        stats: {
            meanDaysOnFail,
            meanDaysOnPass,
            passRate,
            passRateStandardError,
        },
    };
}

function tallyAttempts(
    count: number,
    attempt: (index: number) => LadderAttempt,
): AttemptTally {
    const tally: AttemptTally = {
        daysOnFailSquaredSum: 0,
        daysOnFailSum: 0,
        daysOnPassSquaredSum: 0,
        daysOnPassSum: 0,
        failDays: [],
        passDays: [],
    };
    for (let index = 0; index < count; index++) {
        const { endDay, isPassed } = attempt(index);
        if (isPassed) {
            tally.passDays.push(endDay);
            tally.daysOnPassSum += endDay;
            tally.daysOnPassSquaredSum += endDay ** 2;
        } else {
            tally.failDays.push(endDay);
            tally.daysOnFailSum += endDay;
            tally.daysOnFailSquaredSum += endDay ** 2;
        }
    }
    return tally;
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

export function rankLadderScores(
    scores: readonly LadderScore[],
    topN: number,
): LadderScoreRanking {
    const scorable = scores.filter((score) =>
        Number.isFinite(score.expectedDaysToFunded),
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
        frontier: ladderFrontier(scorable),
        unscorableCount: scores.length - scorable.length,
    };
}

export function runLadderSearch(
    options: LadderSearchOptions,
): LadderSearchResult {
    const {
        grid,
        maxGridSize = MAX_LADDER_GRID_SIZE,
        onProgress,
        progressEvery = DEFAULT_PROGRESS_EVERY,
        score,
        seed,
        topN = DEFAULT_TOP_N,
        transformLadder,
    } = options;

    const raw = buildLadderGrid(grid, maxGridSize);
    const ladders = canonicaliseGrid(
        transformLadder === undefined
            ? raw
            : raw.map((ladder) => [...transformLadder(ladder)]),
    );
    const total = ladders.length;
    const scores: LadderScore[] = [];

    const trialRng = ladderTrialStreams(seed);
    for (const [index, ladder] of ladders.entries()) {
        scores.push(scoreLadder(ladder, score, trialRng));
        if (onProgress && (index + 1) % progressEvery === 0) {
            onProgress({ completed: index + 1, total });
        }
    }
    onProgress?.({ completed: total, total });

    return {
        ...rankLadderScores(scores, topN),
        droppedAliasCount: raw.length - total,
        gridSize: raw.length,
        laddersScored: total,
        topN,
    };
}
