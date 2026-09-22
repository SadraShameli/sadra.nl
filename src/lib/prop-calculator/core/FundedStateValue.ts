import { availableParallelism } from 'node:os';
import {
    isMainThread,
    parentPort,
    Worker,
    workerData,
} from 'node:worker_threads';
import { require as tsxRequire } from 'tsx/cjs/api';

import type * as FirmsModule from '../firms';

import { type AccountState } from './AccountState';
import {
    describeDailyLossLimit,
    hasPeakShareDependency,
} from './DailyLossLimit';
import {
    computedDayPolicy,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    resolveTradeRisk,
    type RungSizing,
} from './DayPolicy';
import { isDrawdownDpEligible } from './EvalStateValue';
import { newFundedCycleTracker, tryFundedPayout } from './FundedPayoutCycle';
import { type ContractCount, dollars, type Dollars } from './lib/units';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type Plan } from './Plan';
import { type PlanId } from './PlanId';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolveContractLimit,
} from './PositionSizing';
import { TradingPhase } from './TradingPhase';

export interface FundedStateValueConfig {
    readonly actionStepMultiple?: number;
    readonly commission?: Dollars;
    readonly convergenceTolerance?: number;
    readonly cushionStepMultiple?: number;
    readonly cycleBestDayBucketCount?: number;
    readonly evalInitialValue: number;
    readonly feePerAttempt: Dollars;
    readonly maxActionMultiple?: number;
    readonly maxCushionMultiple?: number;
    readonly maxIterationsPerLevel?: number;
    readonly maxPreLockOffsetMultiple?: number;
    readonly minRetainedCushion?: number;
    readonly payoutRegimeCap?: number;
    readonly plan: Plan;
    readonly positionSizing?: null | PositionSizingConfig;
    readonly rrRatio: number;
    readonly rungSizing?: RungSizing;
    readonly stopRule?: DayStopRule;
    readonly tradesPerDay?: number;
    readonly winrate: number;
}

export interface FundedStateValueResult {
    readonly bustTerminalValue: number;
    readonly dayPolicy: DayPolicy;
    readonly initialValue: number;
    readonly reachedStateCount: number;
}

type CushionStartPolicyTables = readonly (readonly number[][])[];

const DEFAULT_ACTION_STEP_MULTIPLE = 0.05;
const DEFAULT_MAX_ACTION_MULTIPLE = 1;
const DEFAULT_CUSHION_STEP_MULTIPLE = 0.1;
const DEFAULT_MAX_CUSHION_MULTIPLE = 6;
const DEFAULT_MAX_PRE_LOCK_OFFSET_MULTIPLE = 3;
const DEFAULT_PAYOUT_REGIME_CAP = 6;
const DEFAULT_TRADES_PER_DAY = 4;
const DEFAULT_CONVERGENCE_TOLERANCE = 1;
const DEFAULT_MAX_ITERATIONS_PER_LEVEL = 200;
const DEFAULT_CYCLE_BEST_DAY_BUCKET_COUNT = 6;
const LARGE_QUALIFYING_DAYS = 1_000_000;
const BUCKET_EPSILON = 1e-9;
const MAX_WORKER_COUNT = 8;
const MIN_PARALLEL_GRID_CELLS = 8;
const WORKER_DISPATCH_TIMEOUT_MS = 120_000;

interface FundedSolveContext {
    readonly actionGrid: readonly number[];
    readonly bustTerminalValue: number;
    readonly candidateRisksCache: Map<
        number,
        Map<number, Map<number, number[]>>
    >;
    readonly commission: Dollars;
    readonly cushionStepDollars: number;
    readonly cycleBestDayKeyRadix: number;
    readonly cycleBestDayStepDollars: number;
    readonly drawdown: Plan['fundedDrawdown'];
    readonly idleKeyRadix: number;
    readonly initialThreshold: number;
    readonly isPerpetualFundedConsistency: boolean;
    readonly isTrackingFundedConsistency: boolean;
    readonly lockedCushionBucketCount: number;
    readonly offsetBucketCount: number;
    readonly payoutRegimeCap: number;
    readonly plan: Plan;
    readonly positionSizing: null | PositionSizingConfig;
    readonly readValue: (key: number) => number;
    readonly regimeKeyRadix: number;
    readonly retainedCushion: number;
    readonly rrRatio: number;
    readonly rungSizing: RungSizing;
    readonly slots: number;
    readonly startingBalance: number;
    readonly unlockedCushionBucketCount: number;
    readonly unlockedWorkingBucketCount: number;
    readonly winrate: number;
}

interface FundedWorkerDispatch {
    readonly cushionBucketCount: number;
    readonly isLockedAtStart: boolean;
    readonly pairIndices: readonly number[];
    readonly regimeAtStart: number;
    readonly resultShape: 'locked' | 'unlocked';
    readonly thresholdDollars: number;
    readonly workingBucketCount: number;
}

interface FundedWorkerInit {
    readonly config: SerializableFundedConfig;
    readonly flagsSAB: SharedArrayBuffer;
    readonly lockedPerPairSize: number;
    readonly lockedResultsSAB: SharedArrayBuffer;
    readonly role: 'funded-state-value-worker';
    readonly snapshotLength: number;
    readonly snapshotSAB: SharedArrayBuffer;
    readonly unlockedPerPairSize: number;
    readonly unlockedResultsSAB: SharedArrayBuffer;
    readonly workerIndex: number;
}

interface SerializableFundedConfig {
    readonly actionStepMultiple?: number;
    readonly commission?: Dollars;
    readonly convergenceTolerance?: number;
    readonly cushionStepMultiple?: number;
    readonly cycleBestDayBucketCount?: number;
    readonly evalInitialValue: number;
    readonly feePerAttempt: Dollars;
    readonly maxActionMultiple?: number;
    readonly maxCushionMultiple?: number;
    readonly maxIterationsPerLevel?: number;
    readonly maxPreLockOffsetMultiple?: number;
    readonly minRetainedCushion?: number;
    readonly payoutRegimeCap?: number;
    readonly planId: PlanId;
    readonly positionSizing?: null | PositionSizingConfig;
    readonly rrRatio: number;
    readonly rungSizing?: RungSizing;
    readonly tradesPerDay?: number;
    readonly winrate: number;
}

const firmsRegistryCache: {
    module: null | typeof FirmsModule;
    warmPromise: null | Promise<void>;
} = { module: null, warmPromise: null };

export function findRegistryPlanId(plan: Plan): null | PlanId {
    void warmFirmsRegistryCache();
    if (firmsRegistryCache.module === null) return null;
    const firm = firmsRegistryCache.module.findFirm(plan.id.firm);
    if (firm === undefined) return null;
    return firm.plans.includes(plan) ? plan.id : null;
}

export async function warmFirmsRegistryCache(): Promise<void> {
    firmsRegistryCache.warmPromise ??= (async () => {
        try {
            firmsRegistryCache.module = await import('../firms');
        } catch {}
    })();
    await firmsRegistryCache.warmPromise;
}

function bestActionAt(
    context: FundedSolveContext,
    cushionNow: number,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    idleDaysAtStart: number,
    tradeIndex: number,
    nextRoundTable: readonly number[],
    cushionBucketCount: number,
    cycleBestDayAtStart: number,
    cushionAtDayStart: number,
    stopValue: number,
    risksAtCushionNow: readonly number[],
): { bestAction: number; bestValue: number } {
    let bestValue = -Infinity;
    let bestAction = 0;
    for (const risk of risksAtCushionNow) {
        const value =
            risk <= 0
                ? tradeIndex === 0
                    ? dayCloseValue(
                          context,
                          cushionNow,
                          thresholdDollars,
                          isLockedAtStart,
                          regimeAtStart,
                          true,
                          idleDaysAtStart,
                          cycleBestDayAtStart,
                          cushionAtDayStart,
                      )
                    : stopValue
                : valueOfRisk(
                      context,
                      risk,
                      cushionNow,
                      thresholdDollars,
                      isLockedAtStart,
                      regimeAtStart,
                      idleDaysAtStart,
                      nextRoundTable,
                      cushionBucketCount,
                      cycleBestDayAtStart,
                      cushionAtDayStart,
                  );
        if (value <= bestValue) continue;
        bestValue = value;
        bestAction = risk;
    }
    return { bestAction, bestValue };
}

function bucketIndex(
    context: FundedSolveContext,
    dollarsValue: number,
    bucketCount: number,
): number {
    const raw = Math.floor(
        (dollarsValue + BUCKET_EPSILON) / context.cushionStepDollars,
    );
    return Math.min(bucketCount - 1, Math.max(0, raw));
}

function buildFundedSolveContext(
    config: FundedStateValueConfig,
    readValue: (key: number) => number,
): FundedSolveContext {
    const { plan } = config;
    const drawdown = plan.fundedDrawdown;
    const lock = drawdown.lock;
    const startingBalance = plan.accountSize;
    const initialThreshold = drawdown.initialThreshold(startingBalance);
    const drawdownAmount = drawdown.amount;

    const rrRatio = config.rrRatio;
    const winrate = config.winrate;
    const commission = config.commission ?? dollars(0);
    const rungSizing = config.rungSizing ?? DEFAULT_RUNG_SIZING;
    const slots = Math.max(
        1,
        Math.floor(config.tradesPerDay ?? DEFAULT_TRADES_PER_DAY),
    );
    const positionSizing = config.positionSizing ?? null;
    const retainedCushion = plan.resolveRetainedCushion(
        config.minRetainedCushion,
    );
    const feePerAttempt = config.feePerAttempt;
    const bustTerminalValue = config.evalInitialValue - feePerAttempt;

    const cushionStepMultiple =
        config.cushionStepMultiple ?? DEFAULT_CUSHION_STEP_MULTIPLE;
    const cushionStepDollars = cushionStepMultiple * drawdownAmount;
    const maxCushionMultiple =
        config.maxCushionMultiple ?? DEFAULT_MAX_CUSHION_MULTIPLE;
    const payoutRegimeCap = Math.max(
        0,
        Math.floor(
            config.payoutRegimeCap ??
                Math.max(
                    DEFAULT_PAYOUT_REGIME_CAP,
                    plan.maxLifetimePayouts ?? 0,
                    plan.payoutLadder?.steps.length ?? 0,
                ),
        ),
    );
    const idleDaysBucketCount = plan.maxConsecutiveIdleDays ?? 1;

    const fundedConsistencyRule = plan.fundedConsistencyRule();
    const isTrackingFundedConsistency = fundedConsistencyRule !== null;
    const isPerpetualFundedConsistency =
        fundedConsistencyRule?.isPerpetual() === true;
    const cycleBestDayBucketCount = isTrackingFundedConsistency
        ? Math.max(
              1,
              config.cycleBestDayBucketCount ??
                  DEFAULT_CYCLE_BEST_DAY_BUCKET_COUNT,
          )
        : 1;
    const cycleBestDayRangeDollars = maxCushionMultiple * drawdownAmount;
    const cycleBestDayStepDollars =
        cycleBestDayBucketCount > 1
            ? cycleBestDayRangeDollars / (cycleBestDayBucketCount - 1)
            : cycleBestDayRangeDollars;

    const lockedCushionBucketCount =
        Math.max(
            1,
            Math.round(
                (maxCushionMultiple * drawdownAmount) / cushionStepDollars,
            ),
        ) + 1;
    const unlockedCushionBucketCount =
        Math.max(1, Math.round(drawdownAmount / cushionStepDollars)) + 1;

    const impliedOffsetMultiple = lock
        ? lock.atProfit / drawdownAmount + cushionStepMultiple
        : 0;
    const maxPreLockOffsetMultiple = Math.max(
        config.maxPreLockOffsetMultiple ?? DEFAULT_MAX_PRE_LOCK_OFFSET_MULTIPLE,
        impliedOffsetMultiple,
    );
    const offsetBucketCount =
        Math.max(
            1,
            Math.round(
                (maxPreLockOffsetMultiple * drawdownAmount) /
                    cushionStepDollars,
            ),
        ) + 1;

    const actionStepDollars =
        (config.actionStepMultiple ?? DEFAULT_ACTION_STEP_MULTIPLE) *
        drawdownAmount;
    const maxActionDollars = Math.max(
        actionStepDollars,
        (config.maxActionMultiple ?? DEFAULT_MAX_ACTION_MULTIPLE) *
            drawdownAmount,
    );
    const actionGrid: number[] = [];
    for (
        let a = actionStepDollars;
        a <= maxActionDollars + BUCKET_EPSILON;
        a += actionStepDollars
    ) {
        actionGrid.push(a);
    }

    const maxDailySwingDollars =
        slots * maxActionDollars * Math.max(1, rrRatio);
    const unlockedWorkingBucketCount =
        unlockedCushionBucketCount +
        Math.max(0, Math.ceil(maxDailySwingDollars / cushionStepDollars));

    const regimeKeyRadix = payoutRegimeCap + 1;
    const idleKeyRadix = idleDaysBucketCount;
    const cycleBestDayKeyRadix = cycleBestDayBucketCount;

    return {
        actionGrid,
        bustTerminalValue,
        candidateRisksCache: new Map(),
        commission,
        cushionStepDollars,
        cycleBestDayKeyRadix,
        cycleBestDayStepDollars,
        drawdown,
        idleKeyRadix,
        initialThreshold,
        isPerpetualFundedConsistency,
        isTrackingFundedConsistency,
        lockedCushionBucketCount,
        offsetBucketCount,
        payoutRegimeCap,
        plan,
        positionSizing,
        readValue,
        regimeKeyRadix,
        retainedCushion,
        rrRatio,
        rungSizing,
        slots,
        startingBalance,
        unlockedCushionBucketCount,
        unlockedWorkingBucketCount,
        winrate,
    };
}

function buildState(
    context: FundedSolveContext,
    balance: number,
    threshold: number,
    isThresholdLocked: boolean,
): AccountState {
    return {
        balance,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        peakDayCloseProfit: 0,
        qualifyingDays: LARGE_QUALIFYING_DAYS,
        startingBalance: context.startingBalance,
        threshold,
        thresholdLocked: isThresholdLocked,
        todayPnL: 0,
        tradingDays: 0,
    };
}

function candidateRisks(
    context: FundedSolveContext,
    cushionNow: number,
    accountProfitNow: number,
    accountProfitAtDayStart: number,
): number[] {
    let byProfitNow = context.candidateRisksCache.get(cushionNow);
    if (byProfitNow === undefined) {
        byProfitNow = new Map();
        context.candidateRisksCache.set(cushionNow, byProfitNow);
    }
    let byProfitStart = byProfitNow.get(accountProfitNow);
    if (byProfitStart === undefined) {
        byProfitStart = new Map();
        byProfitNow.set(accountProfitNow, byProfitStart);
    }
    const cached = byProfitStart.get(accountProfitAtDayStart);
    if (cached !== undefined) return cached;
    const computed = computeCandidateRisks(
        context,
        cushionNow,
        accountProfitNow,
        accountProfitAtDayStart,
    );
    byProfitStart.set(accountProfitAtDayStart, computed);
    return computed;
}

function computeCandidateRisks(
    context: FundedSolveContext,
    cushionNow: number,
    accountProfitNow: number,
    accountProfitAtDayStart: number,
): number[] {
    const { plan, positionSizing } = context;
    const risks = new Set<number>();
    const contractLimit: ContractCount | null =
        positionSizing === null
            ? null
            : resolveContractLimit(
                  plan.contractLimits,
                  TradingPhase.Funded,
                  positionSizing.instrument.isMicro,
                  accountProfitNow,
                  accountProfitAtDayStart,
              );
    for (const action of context.actionGrid) {
        const capped =
            positionSizing === null
                ? action
                : capRiskToContractLimit(action, positionSizing, contractLimit);
        const risk = resolveTradeRisk(capped, cushionNow, context.rungSizing);
        risks.add(Math.max(0, risk));
    }
    risks.add(0);
    return [...risks];
}

function continuationValue(
    context: FundedSolveContext,
    balance: number,
    threshold: number,
    isThresholdLocked: boolean,
    regimeCapped: number,
    idleDays: number,
    cycleBestDay: number,
): number {
    const cushion = balance - threshold;
    if (isThresholdLocked) {
        const index = bucketIndex(
            context,
            cushion,
            context.lockedCushionBucketCount,
        );
        return context.readValue(
            lockedKey(context, regimeCapped, idleDays, cycleBestDay, index),
        );
    }
    const offsetIndex = bucketIndex(
        context,
        threshold - context.initialThreshold,
        context.offsetBucketCount,
    );
    const cushionIndex = bucketIndex(
        context,
        cushion,
        context.unlockedCushionBucketCount,
    );
    return context.readValue(
        unlockedKey(
            context,
            offsetIndex,
            regimeCapped,
            idleDays,
            cycleBestDay,
            cushionIndex,
        ),
    );
}

function cycleBestDayIndex(
    context: FundedSolveContext,
    dollarsValue: number,
): number {
    if (context.cycleBestDayKeyRadix <= 1) return 0;
    const raw = Math.floor(
        (dollarsValue + BUCKET_EPSILON) / context.cycleBestDayStepDollars,
    );
    return Math.min(context.cycleBestDayKeyRadix - 1, Math.max(0, raw));
}

function dayCloseValue(
    context: FundedSolveContext,
    cushionAtEnd: number,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    wasIdleToday: boolean,
    idleDaysAtStart: number,
    cycleBestDayAtStart: number,
    cushionAtDayStart: number,
): number {
    const { plan } = context;
    const state = buildState(
        context,
        thresholdDollars + cushionAtEnd,
        thresholdDollars,
        isLockedAtStart,
    );
    context.drawdown.onDayClose(state);
    plan.recordDayClosePeak(state);
    if (plan.isBust(state, TradingPhase.Funded))
        return context.bustTerminalValue;

    const idleDaysAtEnd =
        plan.maxConsecutiveIdleDays === null
            ? 0
            : wasIdleToday
              ? idleDaysAtStart + 1
              : 0;
    if (
        plan.maxConsecutiveIdleDays !== null &&
        idleDaysAtEnd >= plan.maxConsecutiveIdleDays
    ) {
        return context.bustTerminalValue;
    }

    const cycleBestDayAtStartDollars =
        cycleBestDayAtStart * context.cycleBestDayStepDollars;
    const todayPnL = cushionAtEnd - cushionAtDayStart;
    const cycleBestDayAtEndDollars = Math.max(
        cycleBestDayAtStartDollars,
        todayPnL,
    );
    const cycleBestDayAtEndIndex = cycleBestDayIndex(
        context,
        cycleBestDayAtEndDollars,
    );

    const tracker = newFundedCycleTracker(state);
    tracker.payoutsIssued = regimeAtStart;
    tracker.lastPayoutBalance =
        regimeAtStart === 0
            ? context.startingBalance
            : plan.payoutBalanceFloor(state, context.retainedCushion);
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.cycleBestDayProfit = cycleBestDayAtEndDollars;

    const payout = tryFundedPayout({
        maxPayouts: Infinity,
        minRetainedCushion: context.retainedCushion,
        payoutRequestSize: undefined,
        plan,
        state,
        tracker,
    });
    const receivedCash = payout?.traderReceives ?? 0;

    if (payout?.causesHardBreach) return receivedCash;

    const payoutsIssuedNow = tracker.payoutsIssued;
    if (plan.isAccountConcluded(payoutsIssuedNow)) return receivedCash;

    const regimeNow = Math.min(payoutsIssuedNow, context.payoutRegimeCap);
    const cycleBestDayForContinuation =
        payout === null || context.isPerpetualFundedConsistency
            ? cycleBestDayAtEndIndex
            : 0;
    return (
        receivedCash +
        continuationValue(
            context,
            state.balance,
            state.threshold,
            state.thresholdLocked,
            regimeNow,
            idleDaysAtEnd,
            cycleBestDayForContinuation,
        )
    );
}

function decodePolicyTables(
    source: Float64Array,
    offset: number,
    policyCushionStartCount: number,
    slots: number,
    workingBucketCount: number,
): number[][][] {
    const result: number[][][] = [];
    let cursor = offset;
    for (
        let cushionStart = 0;
        cushionStart < policyCushionStartCount;
        cushionStart++
    ) {
        const policyTables: number[][] = [];
        for (let tradeIndex = 0; tradeIndex < slots; tradeIndex++) {
            const row: number[] = Array.from({ length: workingBucketCount });
            for (let index = 0; index < workingBucketCount; index++) {
                row[index] = source[cursor] ?? 0;
                cursor++;
            }
            policyTables[tradeIndex] = row;
        }
        result.push(policyTables);
    }
    return result;
}

function encodePolicyTables(
    policyTablesByCushionStart: CushionStartPolicyTables,
    slots: number,
    workingBucketCount: number,
    out: Float64Array,
    offset: number,
): void {
    let cursor = offset;
    for (const policyTables of policyTablesByCushionStart) {
        for (let tradeIndex = 0; tradeIndex < slots; tradeIndex++) {
            const row = policyTables[tradeIndex] ?? [];
            for (let index = 0; index < workingBucketCount; index++) {
                out[cursor] = row[index] ?? 0;
                cursor++;
            }
        }
    }
}

function lockedKey(
    context: FundedSolveContext,
    regime: number,
    idleDays: number,
    cycleBestDay: number,
    cushionIndex: number,
): number {
    return (
        (((regime * context.idleKeyRadix + idleDays) *
            context.cycleBestDayKeyRadix +
            cycleBestDay) *
            context.lockedCushionBucketCount +
            cushionIndex) *
        2
    );
}

function maxLockedKeyExclusive(context: FundedSolveContext): number {
    return (
        lockedKey(
            context,
            context.payoutRegimeCap,
            context.idleKeyRadix - 1,
            context.cycleBestDayKeyRadix - 1,
            context.lockedCushionBucketCount - 1,
        ) + 1
    );
}

function maxUnlockedKeyExclusive(context: FundedSolveContext): number {
    return (
        unlockedKey(
            context,
            context.offsetBucketCount - 1,
            context.payoutRegimeCap,
            context.idleKeyRadix - 1,
            context.cycleBestDayKeyRadix - 1,
            context.unlockedCushionBucketCount - 1,
        ) + 1
    );
}

function reconstructPlanFromRegistry(planId: PlanId): Plan {
    const firmsModule = requireFirmsModule();
    const firm = firmsModule.findFirm(planId.firm);
    const plan = firm?.findPlan(planId);
    if (!plan) {
        throw new Error(
            `FundedStateValue worker: could not reconstruct plan for firm "${planId.firm}" from the static registry`,
        );
    }
    return plan;
}

function requireFirmsModule(): typeof FirmsModule {
    return tsxRequire('../firms', import.meta.url) as typeof FirmsModule;
}

function runFundedWorkerBootstrap(): void {
    const init = workerData as FundedWorkerInit;
    const plan = reconstructPlanFromRegistry(init.config.planId);
    const config: FundedStateValueConfig = { ...init.config, plan };
    const snapshot = new Float64Array(init.snapshotSAB, 0, init.snapshotLength);
    const context = buildFundedSolveContext(
        config,
        (key) => snapshot[key] ?? 0,
    );
    const flags = new Int32Array(init.flagsSAB);
    const lockedResults = new Float64Array(init.lockedResultsSAB);
    const unlockedResults = new Float64Array(init.unlockedResultsSAB);

    parentPort?.on('message', (dispatch: FundedWorkerDispatch) => {
        const results =
            dispatch.resultShape === 'locked' ? lockedResults : unlockedResults;
        const perPairSize =
            dispatch.resultShape === 'locked'
                ? init.lockedPerPairSize
                : init.unlockedPerPairSize;
        for (const pairIndex of dispatch.pairIndices) {
            const idleDays = Math.floor(
                pairIndex / context.cycleBestDayKeyRadix,
            );
            const cycleBestDay = pairIndex % context.cycleBestDayKeyRadix;
            const { dayStartValues, policyTablesByCushionStart } = solveDayTree(
                context,
                dispatch.thresholdDollars,
                dispatch.isLockedAtStart,
                dispatch.regimeAtStart,
                idleDays,
                cycleBestDay,
                dispatch.cushionBucketCount,
                dispatch.workingBucketCount,
            );
            const baseOffset = pairIndex * perPairSize;
            for (let index = 0; index < dispatch.cushionBucketCount; index++) {
                results[baseOffset + index] = dayStartValues[index] ?? 0;
            }
            encodePolicyTables(
                policyTablesByCushionStart,
                context.slots,
                dispatch.workingBucketCount,
                results,
                baseOffset + dispatch.cushionBucketCount,
            );
        }
        Atomics.store(flags, init.workerIndex, 1);
        Atomics.notify(flags, init.workerIndex, 1);
    });
}

function solveDayTree(
    context: FundedSolveContext,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    idleDaysAtStart: number,
    cycleBestDayAtStart: number,
    cushionBucketCount: number,
    workingBucketCount: number,
): {
    dayStartValues: number[];
    policyTablesByCushionStart: CushionStartPolicyTables;
} {
    if (!context.isTrackingFundedConsistency) {
        const { finalTable, policyTables } = solveDayTreeOnce(
            context,
            thresholdDollars,
            isLockedAtStart,
            regimeAtStart,
            idleDaysAtStart,
            0,
            0,
            workingBucketCount,
        );
        return {
            dayStartValues: finalTable.slice(0, cushionBucketCount),
            policyTablesByCushionStart: [policyTables],
        };
    }
    const dayStartValues: number[] = Array.from({
        length: cushionBucketCount,
    });
    const policyTablesByCushionStart: number[][][] = Array.from({
        length: cushionBucketCount,
    });
    for (
        let cushionStartIndex = 0;
        cushionStartIndex < cushionBucketCount;
        cushionStartIndex++
    ) {
        const cushionAtDayStart =
            cushionStartIndex * context.cushionStepDollars;
        const { finalTable, policyTables } = solveDayTreeOnce(
            context,
            thresholdDollars,
            isLockedAtStart,
            regimeAtStart,
            idleDaysAtStart,
            cycleBestDayAtStart,
            cushionAtDayStart,
            workingBucketCount,
        );
        dayStartValues[cushionStartIndex] = finalTable[cushionStartIndex] ?? 0;
        policyTablesByCushionStart[cushionStartIndex] = policyTables;
    }
    return { dayStartValues, policyTablesByCushionStart };
}

function solveDayTreeOnce(
    context: FundedSolveContext,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    idleDaysAtStart: number,
    cycleBestDayAtStart: number,
    cushionAtDayStart: number,
    workingBucketCount: number,
): { finalTable: number[]; policyTables: number[][] } {
    const stopTable: number[] = Array.from(
        { length: workingBucketCount },
        (_, index) =>
            dayCloseValue(
                context,
                index * context.cushionStepDollars,
                thresholdDollars,
                isLockedAtStart,
                regimeAtStart,
                false,
                idleDaysAtStart,
                cycleBestDayAtStart,
                cushionAtDayStart,
            ),
    );
    const accountProfitAtDayStart =
        thresholdDollars + cushionAtDayStart - context.startingBalance;
    const risksByIndex: number[][] = Array.from(
        { length: workingBucketCount },
        (_, index) => {
            const cushionNow = index * context.cushionStepDollars;
            return candidateRisks(
                context,
                cushionNow,
                thresholdDollars + cushionNow - context.startingBalance,
                accountProfitAtDayStart,
            );
        },
    );
    let nextRoundTable: number[] = stopTable;
    const policyTables: number[][] = [];
    for (let tradeIndex = context.slots - 1; tradeIndex >= 0; tradeIndex--) {
        const currentTable: number[] = Array.from({
            length: workingBucketCount,
        });
        const currentPolicy: number[] = Array.from({
            length: workingBucketCount,
        });
        for (let index = 0; index < workingBucketCount; index++) {
            const cushionNow = index * context.cushionStepDollars;
            const { bestAction, bestValue } = bestActionAt(
                context,
                cushionNow,
                thresholdDollars,
                isLockedAtStart,
                regimeAtStart,
                idleDaysAtStart,
                tradeIndex,
                nextRoundTable,
                workingBucketCount,
                cycleBestDayAtStart,
                cushionAtDayStart,
                stopTable[index] ?? 0,
                risksByIndex[index] ?? [],
            );
            currentTable[index] = bestValue;
            currentPolicy[index] = bestAction;
        }
        policyTables[tradeIndex] = currentPolicy;
        nextRoundTable = currentTable;
    }
    return { finalTable: nextRoundTable, policyTables };
}

function toSerializableConfig(
    config: FundedStateValueConfig,
    planId: PlanId,
): SerializableFundedConfig {
    return {
        actionStepMultiple: config.actionStepMultiple,
        commission: config.commission,
        convergenceTolerance: config.convergenceTolerance,
        cushionStepMultiple: config.cushionStepMultiple,
        cycleBestDayBucketCount: config.cycleBestDayBucketCount,
        evalInitialValue: config.evalInitialValue,
        feePerAttempt: config.feePerAttempt,
        maxActionMultiple: config.maxActionMultiple,
        maxCushionMultiple: config.maxCushionMultiple,
        maxIterationsPerLevel: config.maxIterationsPerLevel,
        maxPreLockOffsetMultiple: config.maxPreLockOffsetMultiple,
        minRetainedCushion: config.minRetainedCushion,
        payoutRegimeCap: config.payoutRegimeCap,
        planId,
        positionSizing: config.positionSizing,
        rrRatio: config.rrRatio,
        rungSizing: config.rungSizing,
        tradesPerDay: config.tradesPerDay,
        winrate: config.winrate,
    };
}

function unlockedKey(
    context: FundedSolveContext,
    offsetIndex: number,
    regime: number,
    idleDays: number,
    cycleBestDay: number,
    cushionIndex: number,
): number {
    return (
        ((((offsetIndex * context.regimeKeyRadix + regime) *
            context.idleKeyRadix +
            idleDays) *
            context.cycleBestDayKeyRadix +
            cycleBestDay) *
            context.unlockedCushionBucketCount +
            cushionIndex) *
            2 +
        1
    );
}

function valueOfRisk(
    context: FundedSolveContext,
    risk: number,
    cushionNow: number,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    idleDaysAtStart: number,
    nextRoundTable: readonly number[],
    cushionBucketCount: number,
    cycleBestDayAtStart: number,
    cushionAtDayStart: number,
): number {
    const pnlWin = context.rrRatio * risk - context.commission;
    const valueWin = withinDayContinuation(
        context,
        cushionNow + pnlWin,
        thresholdDollars,
        isLockedAtStart,
        regimeAtStart,
        idleDaysAtStart,
        nextRoundTable,
        cushionBucketCount,
        cycleBestDayAtStart,
        cushionAtDayStart,
    );
    const pnlLose = -risk - context.commission;
    const valueLose = withinDayContinuation(
        context,
        cushionNow + pnlLose,
        thresholdDollars,
        isLockedAtStart,
        regimeAtStart,
        idleDaysAtStart,
        nextRoundTable,
        cushionBucketCount,
        cycleBestDayAtStart,
        cushionAtDayStart,
    );
    return context.winrate * valueWin + (1 - context.winrate) * valueLose;
}

function withinDayContinuation(
    context: FundedSolveContext,
    cushionAfter: number,
    thresholdDollars: number,
    isLockedAtStart: boolean,
    regimeAtStart: number,
    idleDaysAtStart: number,
    nextRoundTable: readonly number[],
    cushionBucketCount: number,
    cycleBestDayAtStart: number,
    cushionAtDayStart: number,
): number {
    if (cushionAfter <= 0) return context.bustTerminalValue;
    const { plan } = context;
    const state = buildState(
        context,
        thresholdDollars + cushionAfter,
        thresholdDollars,
        isLockedAtStart,
    );
    context.drawdown.onTrade(state, 0);
    if (plan.isBust(state, TradingPhase.Funded))
        return context.bustTerminalValue;
    if (plan.isDayLockedOut(state, TradingPhase.Funded)) {
        return dayCloseValue(
            context,
            cushionAfter,
            thresholdDollars,
            isLockedAtStart,
            regimeAtStart,
            false,
            idleDaysAtStart,
            cycleBestDayAtStart,
            cushionAtDayStart,
        );
    }
    const index = bucketIndex(context, cushionAfter, cushionBucketCount);
    return nextRoundTable[index] ?? 0;
}

if (!isMainThread) {
    const init = workerData as Partial<FundedWorkerInit> | undefined;
    if (init?.role === 'funded-state-value-worker') {
        runFundedWorkerBootstrap();
    }
}

class FundedWorkerPool {
    private readonly cycleBestDayKeyRadix: number;
    private readonly flags: Int32Array;
    private readonly idleKeyRadix: number;
    private readonly lockedPerPairSize: number;
    private readonly lockedResults: Float64Array;
    private readonly snapshot: Float64Array;
    private readonly slots: number;
    private readonly totalPairs: number;
    private readonly unlockedPerPairSize: number;
    private readonly unlockedResults: Float64Array;
    private readonly workers: Worker[];

    constructor(
        numberWorkers: number,
        config: FundedStateValueConfig,
        planId: PlanId,
        context: FundedSolveContext,
    ) {
        this.slots = context.slots;
        this.idleKeyRadix = context.idleKeyRadix;
        this.cycleBestDayKeyRadix = context.cycleBestDayKeyRadix;
        this.totalPairs = context.idleKeyRadix * context.cycleBestDayKeyRadix;

        const snapshotLength = Math.max(
            maxUnlockedKeyExclusive(context),
            maxLockedKeyExclusive(context),
        );
        const snapshotSAB = new SharedArrayBuffer(snapshotLength * 8);
        this.snapshot = new Float64Array(snapshotSAB);

        const lockedPolicyCushionStartCount =
            context.isTrackingFundedConsistency
                ? context.lockedCushionBucketCount
                : 1;
        const unlockedPolicyCushionStartCount =
            context.isTrackingFundedConsistency
                ? context.unlockedCushionBucketCount
                : 1;
        this.lockedPerPairSize =
            context.lockedCushionBucketCount +
            lockedPolicyCushionStartCount *
                context.slots *
                context.lockedCushionBucketCount;
        this.unlockedPerPairSize =
            context.unlockedCushionBucketCount +
            unlockedPolicyCushionStartCount *
                context.slots *
                context.unlockedWorkingBucketCount;

        const lockedResultsSAB = new SharedArrayBuffer(
            this.totalPairs * this.lockedPerPairSize * 8,
        );
        const unlockedResultsSAB = new SharedArrayBuffer(
            this.totalPairs * this.unlockedPerPairSize * 8,
        );
        this.lockedResults = new Float64Array(lockedResultsSAB);
        this.unlockedResults = new Float64Array(unlockedResultsSAB);

        const flagsSAB = new SharedArrayBuffer(numberWorkers * 4);
        this.flags = new Int32Array(flagsSAB);

        const serializableConfig = toSerializableConfig(config, planId);
        this.workers = Array.from(
            { length: numberWorkers },
            (_, workerIndex) => {
                const init: FundedWorkerInit = {
                    config: serializableConfig,
                    flagsSAB,
                    lockedPerPairSize: this.lockedPerPairSize,
                    lockedResultsSAB,
                    role: 'funded-state-value-worker',
                    snapshotLength,
                    snapshotSAB,
                    unlockedPerPairSize: this.unlockedPerPairSize,
                    unlockedResultsSAB,
                    workerIndex,
                };
                return new Worker(new URL(import.meta.url), {
                    execArgv: ['--import', 'tsx'],
                    workerData: init,
                });
            },
        );
    }

    runGrid(
        value: Map<number, number>,
        thresholdDollars: number,
        isLockedAtStart: boolean,
        regimeAtStart: number,
        cushionBucketCount: number,
        workingBucketCount: number,
        isTrackingFundedConsistency: boolean,
    ): {
        dayStartValuesByIdleDaysByCycleBestDay: number[][][];
        policyTablesByIdleDaysByCycleBestDay: CushionStartPolicyTables[][];
    } {
        for (const [key, value_] of value) {
            this.snapshot[key] = value_;
        }

        const resultShape = isLockedAtStart ? 'locked' : 'unlocked';
        const results = isLockedAtStart
            ? this.lockedResults
            : this.unlockedResults;
        const perPairSize = isLockedAtStart
            ? this.lockedPerPairSize
            : this.unlockedPerPairSize;

        const perWorkerPairs: number[][] = Array.from(
            { length: this.workers.length },
            () => [],
        );
        for (let pairIndex = 0; pairIndex < this.totalPairs; pairIndex++) {
            perWorkerPairs[pairIndex % this.workers.length]?.push(pairIndex);
        }

        for (
            let workerIndex = 0;
            workerIndex < this.workers.length;
            workerIndex++
        ) {
            Atomics.store(this.flags, workerIndex, 0);
        }
        for (
            let workerIndex = 0;
            workerIndex < this.workers.length;
            workerIndex++
        ) {
            const pairIndices = perWorkerPairs[workerIndex] ?? [];
            if (pairIndices.length === 0) {
                Atomics.store(this.flags, workerIndex, 1);
                continue;
            }
            const dispatch: FundedWorkerDispatch = {
                cushionBucketCount,
                isLockedAtStart,
                pairIndices,
                regimeAtStart,
                resultShape,
                thresholdDollars,
                workingBucketCount,
            };
            this.workers[workerIndex]?.postMessage(dispatch);
        }
        for (
            let workerIndex = 0;
            workerIndex < this.workers.length;
            workerIndex++
        ) {
            const outcome = Atomics.wait(
                this.flags,
                workerIndex,
                0,
                WORKER_DISPATCH_TIMEOUT_MS,
            );
            if (outcome === 'timed-out') {
                throw new Error(
                    'FundedStateValue: worker dispatch timed out waiting for a sweepLevel grid cell to solve',
                );
            }
        }

        const policyCushionStartCount = isTrackingFundedConsistency
            ? cushionBucketCount
            : 1;
        const solvedByIdleDays = Array.from(
            { length: this.idleKeyRadix },
            (_, idleDays) =>
                Array.from(
                    { length: this.cycleBestDayKeyRadix },
                    (_cycleBestDayPlaceholder, cycleBestDay) => {
                        const pairIndex =
                            idleDays * this.cycleBestDayKeyRadix + cycleBestDay;
                        const baseOffset = pairIndex * perPairSize;
                        const dayStartValues: number[] = Array.from(
                            { length: cushionBucketCount },
                            (_valuePlaceholder, index) =>
                                results[baseOffset + index] ?? 0,
                        );
                        const policyTablesByCushionStart = decodePolicyTables(
                            results,
                            baseOffset + cushionBucketCount,
                            policyCushionStartCount,
                            this.slots,
                            workingBucketCount,
                        );
                        return { dayStartValues, policyTablesByCushionStart };
                    },
                ),
        );

        return {
            dayStartValuesByIdleDaysByCycleBestDay: solvedByIdleDays.map(
                (row) => row.map((cell) => cell.dayStartValues),
            ),
            policyTablesByIdleDaysByCycleBestDay: solvedByIdleDays.map((row) =>
                row.map((cell) => cell.policyTablesByCushionStart),
            ),
        };
    }

    terminate(): void {
        for (const worker of this.workers) {
            void worker.terminate();
        }
    }
}

export function computeFundedStateValue(
    config: FundedStateValueConfig,
): FundedStateValueResult {
    const { plan } = config;
    if (!isFundedDpEligible(plan)) {
        throw new Error(
            `${plan.label}: not eligible for FundedStateValue DP (call isFundedDpEligible first) — its funded drawdown is intraday-trailing, its funded daily loss limit depends on peak-day-close profit, or it has no funded drawdown lock and no ReleaseFloor payout floor effect`,
        );
    }
    const stopRule: DayStopRule = config.stopRule ?? {
        kind: DayStopRuleKind.None,
    };
    if (stopRule.kind !== DayStopRuleKind.None) {
        throw new Error(
            `${plan.label}: FundedStateValue's shared-per-level cushion grid only supports DayStopRuleKind.None — a within-day P&L-dependent stop rule would need a day-start-relative sub-grid per outer state, out of v1 scope`,
        );
    }

    const drawdown = plan.fundedDrawdown;
    const lock = drawdown.lock;
    const startingBalance = plan.accountSize;
    const initialThreshold = drawdown.initialThreshold(startingBalance);
    const drawdownAmount = drawdown.amount;

    const value = new Map<number, number>();
    const policy = new Map<number, CushionStartPolicyTables>();

    const mainContext = buildFundedSolveContext(
        config,
        (key) => value.get(key) ?? 0,
    );

    const convergenceTolerance =
        config.convergenceTolerance ?? DEFAULT_CONVERGENCE_TOLERANCE;
    const maxIterationsPerLevel =
        config.maxIterationsPerLevel ?? DEFAULT_MAX_ITERATIONS_PER_LEVEL;

    const {
        cycleBestDayKeyRadix,
        idleKeyRadix,
        lockedCushionBucketCount,
        offsetBucketCount,
        payoutRegimeCap,
        unlockedCushionBucketCount,
        unlockedWorkingBucketCount,
    } = mainContext;

    function lockedLevelKey(
        regime: number,
        idleDays: number,
        cycleBestDay: number,
    ): number {
        return (
            ((regime * idleKeyRadix + idleDays) * cycleBestDayKeyRadix +
                cycleBestDay) *
            2
        );
    }

    function unlockedLevelKey(
        offsetIndex: number,
        regime: number,
        idleDays: number,
        cycleBestDay: number,
    ): number {
        return (
            (((offsetIndex * mainContext.regimeKeyRadix + regime) *
                idleKeyRadix +
                idleDays) *
                cycleBestDayKeyRadix +
                cycleBestDay) *
                2 +
            1
        );
    }

    function lockedThresholdDollars(): number {
        if (lock) return lock.lockedThreshold(startingBalance);
        if (plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor) {
            return startingBalance;
        }
        throw new Error(
            `${plan.label}: reached a thresholdLocked funded state with no drawdown lock config and no ReleaseFloor payout effect — this should be unreachable`,
        );
    }

    const workerPool = tryCreateWorkerPool(config, mainContext);

    try {
        function sweepLevel(
            thresholdDollars: number,
            isLockedAtStart: boolean,
            regimeAtStart: number,
            cushionBucketCount: number,
            workingBucketCount: number,
            keyFor: (
                idleDays: number,
                cycleBestDay: number,
                cushionIndex: number,
            ) => number,
        ): {
            maxDelta: number;
            policyTablesByIdleDaysByCycleBestDay: CushionStartPolicyTables[][];
        } {
            const totalPairs = idleKeyRadix * cycleBestDayKeyRadix;
            let dayStartValuesByIdleDaysByCycleBestDay: number[][][];
            let policyTablesByIdleDaysByCycleBestDay: CushionStartPolicyTables[][];

            if (workerPool !== null && totalPairs >= MIN_PARALLEL_GRID_CELLS) {
                const parallelResult = workerPool.runGrid(
                    value,
                    thresholdDollars,
                    isLockedAtStart,
                    regimeAtStart,
                    cushionBucketCount,
                    workingBucketCount,
                    mainContext.isTrackingFundedConsistency,
                );
                dayStartValuesByIdleDaysByCycleBestDay =
                    parallelResult.dayStartValuesByIdleDaysByCycleBestDay;
                policyTablesByIdleDaysByCycleBestDay =
                    parallelResult.policyTablesByIdleDaysByCycleBestDay;
            } else {
                const solvedByIdleDays = Array.from(
                    { length: idleKeyRadix },
                    (_, idleDays) =>
                        Array.from(
                            { length: cycleBestDayKeyRadix },
                            (_cycleBestDayPlaceholder, cycleBestDay) =>
                                solveDayTree(
                                    mainContext,
                                    thresholdDollars,
                                    isLockedAtStart,
                                    regimeAtStart,
                                    idleDays,
                                    cycleBestDay,
                                    cushionBucketCount,
                                    workingBucketCount,
                                ),
                        ),
                );
                dayStartValuesByIdleDaysByCycleBestDay = solvedByIdleDays.map(
                    (row) => row.map((solved) => solved.dayStartValues),
                );
                policyTablesByIdleDaysByCycleBestDay = solvedByIdleDays.map(
                    (row) =>
                        row.map((solved) => solved.policyTablesByCushionStart),
                );
            }

            let maxDelta = 0;
            for (let idleDays = 0; idleDays < idleKeyRadix; idleDays++) {
                for (
                    let cycleBestDay = 0;
                    cycleBestDay < cycleBestDayKeyRadix;
                    cycleBestDay++
                ) {
                    const dayStartValues =
                        dayStartValuesByIdleDaysByCycleBestDay[idleDays]?.[
                            cycleBestDay
                        ] ?? [];
                    for (let index = 0; index < cushionBucketCount; index++) {
                        const key = keyFor(idleDays, cycleBestDay, index);
                        const old = value.get(key) ?? 0;
                        const next = dayStartValues[index] ?? 0;
                        maxDelta = Math.max(maxDelta, Math.abs(next - old));
                    }
                }
            }
            for (let idleDays = 0; idleDays < idleKeyRadix; idleDays++) {
                for (
                    let cycleBestDay = 0;
                    cycleBestDay < cycleBestDayKeyRadix;
                    cycleBestDay++
                ) {
                    const dayStartValues =
                        dayStartValuesByIdleDaysByCycleBestDay[idleDays]?.[
                            cycleBestDay
                        ] ?? [];
                    for (let index = 0; index < cushionBucketCount; index++) {
                        value.set(
                            keyFor(idleDays, cycleBestDay, index),
                            dayStartValues[index] ?? 0,
                        );
                    }
                }
            }
            return {
                maxDelta,
                policyTablesByIdleDaysByCycleBestDay,
            };
        }

        function solveLevelToConvergence(
            thresholdDollars: number,
            isLockedAtStart: boolean,
            regimeAtStart: number,
            cushionBucketCount: number,
            workingBucketCount: number,
            keyFor: (
                idleDays: number,
                cycleBestDay: number,
                cushionIndex: number,
            ) => number,
        ): CushionStartPolicyTables[][] {
            let policyTablesByIdleDaysByCycleBestDay: CushionStartPolicyTables[][] =
                [];
            for (
                let iteration = 0;
                iteration < maxIterationsPerLevel;
                iteration++
            ) {
                const result = sweepLevel(
                    thresholdDollars,
                    isLockedAtStart,
                    regimeAtStart,
                    cushionBucketCount,
                    workingBucketCount,
                    keyFor,
                );
                policyTablesByIdleDaysByCycleBestDay =
                    result.policyTablesByIdleDaysByCycleBestDay;
                if (result.maxDelta < convergenceTolerance) break;
            }
            return policyTablesByIdleDaysByCycleBestDay;
        }

        for (let regime = payoutRegimeCap; regime >= 0; regime--) {
            const policyTablesByIdleDaysByCycleBestDay =
                solveLevelToConvergence(
                    lockedThresholdDollars(),
                    true,
                    regime,
                    lockedCushionBucketCount,
                    lockedCushionBucketCount,
                    (idleDays, cycleBestDay, index) =>
                        lockedKey(
                            mainContext,
                            regime,
                            idleDays,
                            cycleBestDay,
                            index,
                        ),
                );
            for (let idleDays = 0; idleDays < idleKeyRadix; idleDays++) {
                for (
                    let cycleBestDay = 0;
                    cycleBestDay < cycleBestDayKeyRadix;
                    cycleBestDay++
                ) {
                    policy.set(
                        lockedLevelKey(regime, idleDays, cycleBestDay),
                        policyTablesByIdleDaysByCycleBestDay[idleDays]?.[
                            cycleBestDay
                        ] ?? [],
                    );
                }
            }
        }

        for (
            let offsetIndex = offsetBucketCount - 1;
            offsetIndex >= 0;
            offsetIndex--
        ) {
            const thresholdDollars =
                initialThreshold + offsetIndex * mainContext.cushionStepDollars;
            for (let regime = payoutRegimeCap; regime >= 0; regime--) {
                const policyTablesByIdleDaysByCycleBestDay =
                    solveLevelToConvergence(
                        thresholdDollars,
                        false,
                        regime,
                        unlockedCushionBucketCount,
                        unlockedWorkingBucketCount,
                        (idleDays, cycleBestDay, index) =>
                            unlockedKey(
                                mainContext,
                                offsetIndex,
                                regime,
                                idleDays,
                                cycleBestDay,
                                index,
                            ),
                    );
                for (let idleDays = 0; idleDays < idleKeyRadix; idleDays++) {
                    for (
                        let cycleBestDay = 0;
                        cycleBestDay < cycleBestDayKeyRadix;
                        cycleBestDay++
                    ) {
                        policy.set(
                            unlockedLevelKey(
                                offsetIndex,
                                regime,
                                idleDays,
                                cycleBestDay,
                            ),
                            policyTablesByIdleDaysByCycleBestDay[idleDays]?.[
                                cycleBestDay
                            ] ?? [],
                        );
                    }
                }
            }
        }
    } finally {
        workerPool?.terminate();
    }

    const initialCushionIndex = bucketIndex(
        mainContext,
        drawdownAmount,
        unlockedCushionBucketCount,
    );
    const initialValue =
        value.get(unlockedKey(mainContext, 0, 0, 0, 0, initialCushionIndex)) ??
        0;

    function computeRisk(
        state: AccountState,
        tradeIndexToday: number,
        payoutsIssued?: number,
        cycleBestDayProfit?: number,
    ): number {
        const regime = Math.min(payoutsIssued ?? 0, payoutRegimeCap);
        const idleDays = plan.clampedIdleDays(state, TradingPhase.Funded);
        const cushionDollars = state.balance - state.threshold;
        const cycleBestDay = cycleBestDayIndex(
            mainContext,
            cycleBestDayProfit ?? 0,
        );
        const cushionAtDayStartDollars = cushionDollars - state.todayPnL;
        if (state.thresholdLocked) {
            const index = bucketIndex(
                mainContext,
                cushionDollars,
                lockedCushionBucketCount,
            );
            const cushionStartIndex = mainContext.isTrackingFundedConsistency
                ? bucketIndex(
                      mainContext,
                      cushionAtDayStartDollars,
                      lockedCushionBucketCount,
                  )
                : 0;
            const policyTablesByCushionStart = policy.get(
                lockedLevelKey(regime, idleDays, cycleBestDay),
            );
            return (
                policyTablesByCushionStart?.[cushionStartIndex]?.[
                    tradeIndexToday
                ]?.[index] ?? 0
            );
        }
        const offsetIndex = bucketIndex(
            mainContext,
            state.threshold - initialThreshold,
            offsetBucketCount,
        );
        const cushionIndex = bucketIndex(
            mainContext,
            cushionDollars,
            unlockedWorkingBucketCount,
        );
        const cushionStartIndex = mainContext.isTrackingFundedConsistency
            ? bucketIndex(
                  mainContext,
                  cushionAtDayStartDollars,
                  unlockedCushionBucketCount,
              )
            : 0;
        const policyTablesByCushionStart = policy.get(
            unlockedLevelKey(offsetIndex, regime, idleDays, cycleBestDay),
        );
        return (
            policyTablesByCushionStart?.[cushionStartIndex]?.[
                tradeIndexToday
            ]?.[cushionIndex] ?? 0
        );
    }

    const dayPolicy = computedDayPolicy(
        computeRisk,
        mainContext.slots,
        stopRule,
    );

    return {
        bustTerminalValue: mainContext.bustTerminalValue,
        dayPolicy,
        initialValue,
        reachedStateCount: value.size,
    };
}

export function isFundedDpEligible(plan: Plan): boolean {
    return (
        isDrawdownDpEligible(plan.fundedDrawdown.kind) &&
        !hasPeakShareDependency(
            describeDailyLossLimit(plan.fundedDailyLossLimit),
        ) &&
        !plan.isDailyLossLimitTerminating(TradingPhase.Funded) &&
        (plan.fundedDrawdown.lock !== undefined ||
            plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor)
    );
}

function tryCreateWorkerPool(
    config: FundedStateValueConfig,
    context: FundedSolveContext,
): FundedWorkerPool | null {
    const totalPairs = context.idleKeyRadix * context.cycleBestDayKeyRadix;
    if (totalPairs < MIN_PARALLEL_GRID_CELLS) return null;

    const cores = availableParallelism();
    if (cores <= 1) return null;

    try {
        const planId = findRegistryPlanId(config.plan);
        if (planId === null) return null;

        const numberWorkers = Math.max(
            1,
            Math.min(cores, MAX_WORKER_COUNT, totalPairs),
        );
        return numberWorkers <= 1
            ? null
            : new FundedWorkerPool(numberWorkers, config, planId, context);
    } catch {
        return null;
    }
}
