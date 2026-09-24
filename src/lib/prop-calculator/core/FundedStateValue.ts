import { availableParallelism } from 'node:os';
import {
    isMainThread,
    MessageChannel,
    type MessagePort,
    parentPort,
    Worker,
    workerData,
} from 'node:worker_threads';
import { require as tsxRequire } from 'tsx/cjs/api';

import type * as FirmsModule from '../firms';

import { type AccountState, createInitialState } from './AccountState';
import { BUCKET_EPSILON } from './constants';
import {
    DailyLossLimitKind,
    describeDailyLossLimit,
    hasPeakShareDependency,
} from './DailyLossLimit';
import {
    computedDayPolicy,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    type FundedCycleSnapshot,
    resolveTradeRisk,
    type RungSizing,
} from './DayPolicy';
import { isDrawdownDpEligible } from './EvalStateValue';
import { FundedCycleBaselineGrid } from './FundedCycleBaselineGrid';
import {
    newFundedCycleTracker,
    PayoutDayGateBasis,
    sessionDaysForCalendarDays,
    tryFundedPayout,
} from './FundedPayoutCycle';
import { type ContractCount, dollars, type Dollars } from './lib/units';
import {
    awaitWorkerSignal,
    runAndSignal,
    WorkerSignal,
} from './lib/workerSignal';
import { QualifyingDaysMilestonePayoutCap } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type PeakRatchet } from './PeakRatchet';
import { type Plan } from './Plan';
import { type PlanId } from './PlanId';
import {
    capRiskToContractLimit,
    contractLimitAt,
    type PositionSizingConfig,
} from './PositionSizing';
import { TierBasis } from './TierBasis';
import { TradingPhase } from './TradingPhase';

export interface FundedStateValueConfig {
    readonly actionStepMultiple?: number;
    readonly commission?: Dollars;
    readonly convergenceTolerance?: number;
    readonly cushionStepMultiple?: number;
    readonly cycleBaselineFineRangeMultiple?: number;
    readonly cycleBestDayBucketCount?: number;
    readonly dayCost?: number;
    readonly evalInitialValue: number;
    readonly feePerAttempt: Dollars;
    readonly maxActionMultiple?: number;
    readonly maxCushionMultiple?: number;
    readonly maxIterationsPerLevel?: number;
    readonly maxPreLockOffsetMultiple?: number;
    readonly meanHorizonDays?: number;
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
    readonly unconvergedLevelCount: number;
    readonly workerCount: number;
}

const DEFAULT_ACTION_STEP_MULTIPLE = 0.05;
const DEFAULT_MAX_ACTION_MULTIPLE = 1;
const DEFAULT_CUSHION_STEP_MULTIPLE = 0.1;
export const DEFAULT_MAX_CUSHION_MULTIPLE = 6;
const DEFAULT_MAX_PRE_LOCK_OFFSET_MULTIPLE = 3;
const DEFAULT_PAYOUT_REGIME_CAP = 6;
const DEFAULT_TRADES_PER_DAY = 4;
const DEFAULT_CONVERGENCE_TOLERANCE = 1;
const DEFAULT_MAX_ITERATIONS_PER_LEVEL = 200;
const DEFAULT_CYCLE_BASELINE_FINE_RANGE_MULTIPLE = 1;
const MAX_WORKER_COUNT = 8;
const MIN_PARALLEL_GRID_CELLS = 8;
const WORKER_DISPATCH_TIMEOUT_MS = 120_000;
const OUTCOME_BUST = -1;
const OUTCOME_FIRST_LOCKOUT = -2;
const TERMINAL_CONTINUATION_KEY = -1;
const UNCOMPUTED_CONTINUATION_KEY = -2;
const MAX_CACHED_DAY_CLOSE_CELLS = 4_000_000;

interface FundedDayCloseOutcome {
    readonly cash: number;
    readonly continuationKey: number;
    readonly horizonCredit: number;
}

interface FundedDayCloseTable {
    readonly cash: Float64Array;
    readonly credit: Float64Array;
    readonly idle: Map<number, FundedDayCloseOutcome>;
    readonly keys: Int32Array;
    readonly lockouts: Map<number, FundedDayCloseOutcome>;
}

interface FundedDaySkeleton {
    readonly closeTables: Map<string, FundedDayCloseTable>;
    readonly lockoutIds: Map<string, number>;
    readonly lockouts: FundedLockout[];
    readonly reachCount: number;
    readonly risksByIndex: (readonly number[] | undefined)[];
    readonly rows: (FundedSkeletonRow | undefined)[];
    readonly workingBucketCount: number;
}

interface FundedDaySkeletonCache {
    closeCellCount: number;
    levelKey: null | string;
    readonly skeletons: Map<string, FundedDaySkeleton>;
}

interface FundedDayStart extends FundedLevel, FundedPair {
    readonly cushionAtDayStart: number;
}

interface FundedKeyLayout {
    readonly length: number;
    readonly lockedLevelBases: readonly (null | number)[];
    readonly unlockedLevelBases: readonly (null | number)[];
}

interface FundedKeyLayoutOptions {
    readonly cycleBaselineGridSize: number;
    readonly isSkipped: (regime: number, isLocked: boolean) => boolean;
    readonly lockedCushionBucketCount: number;
    readonly offsetBucketCount: number;
    readonly pairCountWithoutBaseline: number;
    readonly payoutRegimeCap: number;
    readonly unlockedCushionBucketCount: number;
}

interface FundedLevel {
    readonly isLocked: boolean;
    readonly regime: number;
    readonly thresholdDollars: number;
}

interface FundedLockout {
    readonly cushionAfter: number;
    readonly reachAfter: number;
}

interface FundedPair {
    readonly cycleBaseline: number;
    readonly cycleBestDay: number;
    readonly idleDays: number;
    readonly qualifyingDays: number;
    readonly ratchet: number;
}

interface FundedSkeletonRow {
    readonly losses: Int32Array;
    readonly risks: readonly number[];
    readonly wins: Int32Array;
}

interface FundedSolveContext {
    readonly actionGrid: readonly number[];
    readonly bustTerminalValue: number;
    readonly candidateRisksCache: Map<number, Map<number, number[]>>;
    readonly commission: Dollars;
    readonly cushionStepDollars: number;
    readonly cycleBaselineGrid: FundedCycleBaselineGrid;
    readonly cycleBestDayKeyRadix: number;
    readonly cycleBestDayStepDollars: number;
    readonly dayCost: number;
    readonly daySkeletons: FundedDaySkeletonCache;
    readonly drawdown: Plan['fundedDrawdown'];
    readonly horizonHazard: number;
    readonly idleKeyRadix: number;
    readonly initialThreshold: number;
    readonly isPerpetualFundedConsistency: boolean;
    readonly isSolvingPerDayStart: boolean;
    readonly isUnlockedPostPayoutReachable: boolean;
    readonly keyLayout: FundedKeyLayout;
    readonly lockedCushionBucketCount: number;
    readonly lockedPayoutFloor: number;
    readonly lockedThreshold: number;
    readonly offsetBucketCount: number;
    readonly payoutRegimeCap: number;
    readonly peakRatchet: PeakRatchet;
    readonly plan: Plan;
    readonly positionSizing: null | PositionSizingConfig;
    readonly qualifyingDayKeyRadix: number;
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
    readonly cycleBaselineRadix: number;
    readonly isLockedAtStart: boolean;
    readonly pairIndices: readonly number[];
    readonly regimeAtStart: number;
    readonly resultShape: 'locked' | 'unlocked';
    readonly thresholdDollars: number;
    readonly workingBucketCount: number;
}

interface FundedWorkerInit {
    readonly config: SerializableFundedConfig;
    readonly errorPort: MessagePort;
    readonly flagsSAB: SharedArrayBuffer;
    readonly lockedResultsSAB: SharedArrayBuffer;
    readonly role: 'funded-state-value-worker';
    readonly snapshotSAB: SharedArrayBuffer;
    readonly unlockedResultsSAB: SharedArrayBuffer;
    readonly workerIndex: number;
}

type SerializableFundedConfig = Omit<FundedStateValueConfig, 'plan'> & {
    readonly planId: PlanId;
};

const firmsRegistryCache: {
    module: null | typeof FirmsModule;
    warmPromise: null | Promise<void>;
} = { module: null, warmPromise: null };

export function defaultPayoutRegimeCap(plan: Plan): number {
    return Math.max(
        DEFAULT_PAYOUT_REGIME_CAP,
        plan.maxLifetimePayouts ?? 0,
        plan.payoutLadder?.steps.length ?? 0,
        plan.payoutSplit.stationaryFromPayoutIndex,
    );
}

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

    const dayCost = config.dayCost ?? 0;
    if (
        config.meanHorizonDays !== undefined &&
        (!Number.isFinite(config.meanHorizonDays) || config.meanHorizonDays < 1)
    ) {
        throw new Error(
            `${plan.label}: meanHorizonDays must be a finite number >= 1`,
        );
    }
    const horizonHazard =
        config.meanHorizonDays === undefined ? 0 : 1 / config.meanHorizonDays;
    if (dayCost !== 0 && horizonHazard === 0) {
        throw new Error(
            `${plan.label}: dayCost requires meanHorizonDays, since without a horizon a policy that never busts has no terminal branch and the day-cost fixed point would diverge`,
        );
    }
    const cycleBaselineFineRangeMultiple =
        config.cycleBaselineFineRangeMultiple ??
        DEFAULT_CYCLE_BASELINE_FINE_RANGE_MULTIPLE;
    if (
        !Number.isFinite(cycleBaselineFineRangeMultiple) ||
        cycleBaselineFineRangeMultiple < 0
    ) {
        throw new Error(
            `${plan.label}: cycleBaselineFineRangeMultiple must be a finite number >= 0, got ${cycleBaselineFineRangeMultiple}`,
        );
    }

    const cushionStepMultiple =
        config.cushionStepMultiple ?? DEFAULT_CUSHION_STEP_MULTIPLE;
    const cushionStepDollars = cushionStepMultiple * drawdownAmount;
    const maxCushionMultiple =
        config.maxCushionMultiple ?? DEFAULT_MAX_CUSHION_MULTIPLE;
    const payoutRegimeCap = Math.max(
        0,
        Math.floor(config.payoutRegimeCap ?? defaultPayoutRegimeCap(plan)),
    );
    const idleDaysBucketCount = plan.maxConsecutiveIdleDays ?? 1;
    const qualifyingDayKeyRadix = dayGateKeyRadix(plan);

    const fundedConsistencyRule = plan.fundedConsistencyRule();
    const isTrackingFundedConsistency = fundedConsistencyRule !== null;
    const isPerpetualFundedConsistency =
        fundedConsistencyRule?.isPerpetual() === true;

    const contractsAreMicro =
        positionSizing === null ? null : positionSizing.instrument.isMicro;
    const isSolvingPerDayStart =
        isTrackingFundedConsistency ||
        plan.minQualifyingDayProfit !== null ||
        plan.fundedDailyLossLimit.kind !== DailyLossLimitKind.None ||
        (contractsAreMicro !== null &&
            [
                TierBasis.SessionOpenProfit,
                TierBasis.PeakSessionCloseProfit,
                TierBasis.PeakIntradayProfit,
            ].some(
                (basis) =>
                    plan.fundedContractTierBreakpoints(basis, contractsAreMicro)
                        .length > 0,
            ));
    const peakRatchet = plan.peakRatchetFor(
        TradingPhase.Funded,
        contractsAreMicro,
    );

    const lockedCushionBucketCount =
        Math.max(
            1,
            Math.round(
                (maxCushionMultiple * drawdownAmount) / cushionStepDollars,
            ),
        ) + 1;
    const unlockedCushionBucketCount =
        Math.max(1, Math.round(drawdownAmount / cushionStepDollars)) + 1;

    const lockTrigger = lock?.atProfit ?? null;
    const impliedOffsetMultiple =
        lockTrigger === null
            ? 0
            : lockTrigger / drawdownAmount + cushionStepMultiple;
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

    const lockedThreshold = resolveLockedThreshold(plan, startingBalance);
    const isUnlockedPostPayoutReachable = canWithdrawWhileUnlocked(
        plan,
        retainedCushion,
    );
    const lockedPayoutFloor = plan.payoutBalanceFloor(
        thresholdState(startingBalance, lockedThreshold),
        retainedCushion,
    );
    const isBaselineAlwaysTheFloor =
        !plan.canLeaveBalanceAbovePayoutFloor() &&
        lockedPayoutFloor >= startingBalance &&
        !isUnlockedPostPayoutReachable;
    const unlockedPayoutFloorGap =
        plan.payoutBalanceFloor(
            thresholdState(startingBalance, initialThreshold),
            retainedCushion,
        ) - lockedPayoutFloor;
    const cycleBaselineMin = isUnlockedPostPayoutReachable
        ? Math.min(
              0,
              Math.floor(unlockedPayoutFloorGap / cushionStepDollars) *
                  cushionStepDollars,
          )
        : 0;
    const cycleBaselineMax = isBaselineAlwaysTheFloor
        ? cycleBaselineMin
        : Math.max(
              cycleBaselineMin,
              maxCushionMultiple * drawdownAmount -
                  (lockedPayoutFloor - lockedThreshold),
          );
    const cycleBaselineGrid = new FundedCycleBaselineGrid({
        coarseStep: drawdownAmount,
        fineEnd: cycleBaselineFineRangeMultiple * drawdownAmount,
        fineStep: cushionStepDollars,
        max: cycleBaselineMax,
        min: cycleBaselineMin,
    });

    const maxWinDollars = rrRatio * maxActionDollars;
    const maxDayCloseBalance = Math.max(
        lockedThreshold +
            (lockedCushionBucketCount - 1) * cushionStepDollars +
            maxWinDollars,
        initialThreshold +
            (offsetBucketCount - 1 + unlockedWorkingBucketCount - 1) *
                cushionStepDollars +
            maxWinDollars,
    );
    const minCycleBaselineBalance = Math.min(
        startingBalance,
        lockedPayoutFloor + cycleBaselineGrid.dollarsAt(0),
    );
    const maxBestDayShare = Math.max(
        0,
        ...Array.from(
            { length: payoutRegimeCap + 1 },
            (_, regime) =>
                plan.fundedConsistencyRule(regime)?.maxBestDayShare ?? 0,
        ),
    );
    const cycleBestDayGrid = isTrackingFundedConsistency
        ? resolveCycleBestDayGrid({
              cushionStepDollars,
              relevantBestDayDollars: Math.min(
                  (Math.max(
                      lockedCushionBucketCount,
                      unlockedWorkingBucketCount,
                  ) -
                      1) *
                      cushionStepDollars +
                      maxWinDollars,
                  maxBestDayShare *
                      (maxDayCloseBalance - minCycleBaselineBalance),
              ),
              requestedBucketCount: config.cycleBestDayBucketCount,
          })
        : { keyRadix: 1, stepDollars: cushionStepDollars };

    const regimeKeyRadix = payoutRegimeCap + 1;
    const idleKeyRadix = idleDaysBucketCount;
    const cycleBestDayKeyRadix = cycleBestDayGrid.keyRadix;
    const cycleBestDayStepDollars = cycleBestDayGrid.stepDollars;
    const keyLayout = buildKeyLayout({
        cycleBaselineGridSize: cycleBaselineGrid.size,
        isSkipped: (regime, isLocked) =>
            isLevelSkippedFor(
                plan,
                isUnlockedPostPayoutReachable,
                regime,
                isLocked,
            ),
        lockedCushionBucketCount,
        offsetBucketCount,
        pairCountWithoutBaseline:
            idleKeyRadix *
            cycleBestDayKeyRadix *
            qualifyingDayKeyRadix *
            peakRatchet.radix,
        payoutRegimeCap,
        unlockedCushionBucketCount,
    });

    return {
        actionGrid,
        bustTerminalValue,
        candidateRisksCache: new Map(),
        commission,
        cushionStepDollars,
        cycleBaselineGrid,
        cycleBestDayKeyRadix,
        cycleBestDayStepDollars,
        dayCost,
        daySkeletons: {
            closeCellCount: 0,
            levelKey: null,
            skeletons: new Map(),
        },
        drawdown,
        horizonHazard,
        idleKeyRadix,
        initialThreshold,
        isPerpetualFundedConsistency,
        isSolvingPerDayStart,
        isUnlockedPostPayoutReachable,
        keyLayout,
        lockedCushionBucketCount,
        lockedPayoutFloor,
        lockedThreshold,
        offsetBucketCount,
        payoutRegimeCap,
        peakRatchet,
        plan,
        positionSizing,
        qualifyingDayKeyRadix,
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

function buildKeyLayout(options: FundedKeyLayoutOptions): FundedKeyLayout {
    let length = 0;
    const reserve = (
        regime: number,
        isLocked: boolean,
        cushionBucketCount: number,
    ): null | number => {
        if (options.isSkipped(regime, isLocked)) return null;
        const base = length;
        length +=
            options.pairCountWithoutBaseline *
            cycleBaselineRadixFor(regime, options.cycleBaselineGridSize) *
            cushionBucketCount;
        return base;
    };
    const regimeCount = options.payoutRegimeCap + 1;
    const lockedLevelBases = Array.from({ length: regimeCount }, (_, regime) =>
        reserve(regime, true, options.lockedCushionBucketCount),
    );
    const unlockedLevelBases = Array.from(
        { length: options.offsetBucketCount * regimeCount },
        (_, levelIndex) =>
            reserve(
                levelIndex % regimeCount,
                false,
                options.unlockedCushionBucketCount,
            ),
    );
    return { length, lockedLevelBases, unlockedLevelBases };
}

function buildState(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    balance: number,
    todayPnL: number,
    qualifyingDays: number,
    reach = 0,
): AccountState {
    const committedPeak = context.peakRatchet.peakAt(dayStart.ratchet);
    return {
        balance,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: context.peakRatchet.peakAt(
            dayStart.ratchet + reach,
        ),
        peakDayCloseProfit: committedPeak,
        peakIntradayProfit: committedPeak,
        qualifyingDays,
        startingBalance: context.startingBalance,
        threshold: dayStart.thresholdDollars,
        thresholdLocked: dayStart.isLocked,
        todayPnL,
        tradingDays: 0,
    };
}

function cachedStopValue(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    workingBucketCount: number,
    closeTable: FundedDayCloseTable | null,
    cell: number,
): number {
    const reach = Math.floor(cell / workingBucketCount);
    const computeOutcome = (): FundedDayCloseOutcome =>
        dayCloseOutcome(
            context,
            dayStart,
            (cell - reach * workingBucketCount) * context.cushionStepDollars,
            false,
            reach,
        );
    if (closeTable === null) {
        const outcome = computeOutcome();
        return dayCloseValue(
            context,
            outcome.cash,
            outcome.continuationKey,
            outcome.horizonCredit,
        );
    }
    let continuationKeyValue =
        closeTable.keys[cell] ?? UNCOMPUTED_CONTINUATION_KEY;
    if (continuationKeyValue === UNCOMPUTED_CONTINUATION_KEY) {
        const outcome = computeOutcome();
        closeTable.cash[cell] = outcome.cash;
        closeTable.credit[cell] = outcome.horizonCredit;
        closeTable.keys[cell] = outcome.continuationKey;
        continuationKeyValue = outcome.continuationKey;
    }
    return dayCloseValue(
        context,
        closeTable.cash[cell] ?? 0,
        continuationKeyValue,
        closeTable.credit[cell] ?? 0,
    );
}

function candidateRisks(
    context: FundedSolveContext,
    riskBudget: number,
    contractLimit: ContractCount | null,
): number[] {
    let byContractLimit = context.candidateRisksCache.get(riskBudget);
    if (byContractLimit === undefined) {
        byContractLimit = new Map();
        context.candidateRisksCache.set(riskBudget, byContractLimit);
    }
    const contractLimitKey = contractLimit ?? -1;
    const cached = byContractLimit.get(contractLimitKey);
    if (cached !== undefined) return cached;
    const computed = computeCandidateRisks(context, riskBudget, contractLimit);
    byContractLimit.set(contractLimitKey, computed);
    return computed;
}

function canWithdrawWhileUnlocked(
    plan: Plan,
    retainedCushion: number,
): boolean {
    switch (plan.payoutFloorEffect) {
        case PayoutFloorEffect.LockAtPlanFloor:
        case PayoutFloorEffect.MoveToLockedFloor:
        case PayoutFloorEffect.ReleaseFloor: {
            return false;
        }
        case PayoutFloorEffect.None: {
            return plan.fundedDrawdown.allowsWithdrawalWhileUnlocked(
                retainedCushion,
            );
        }
    }
}

function computeCandidateRisks(
    context: FundedSolveContext,
    riskBudget: number,
    contractLimit: ContractCount | null,
): number[] {
    const { positionSizing } = context;
    const risks = new Set<number>();
    for (const action of context.actionGrid) {
        const capped =
            positionSizing === null
                ? action
                : capRiskToContractLimit(action, positionSizing, contractLimit);
        const risk = resolveTradeRisk(capped, riskBudget, context.rungSizing);
        risks.add(Math.max(0, risk));
    }
    risks.add(0);
    return [...risks];
}

function continuationKey(
    context: FundedSolveContext,
    state: AccountState,
    regime: number,
    pair: FundedPair,
): number {
    const cushion = state.balance - state.threshold;
    return state.thresholdLocked
        ? lockedKey(
              context,
              regime,
              pair,
              bucketIndex(context, cushion, context.lockedCushionBucketCount),
          )
        : unlockedKey(
              context,
              bucketIndex(
                  context,
                  state.threshold - context.initialThreshold,
                  context.offsetBucketCount,
              ),
              regime,
              pair,
              bucketIndex(context, cushion, context.unlockedCushionBucketCount),
          );
}

function createFundedWorkerSolver(
    init: FundedWorkerInit,
): (dispatch: FundedWorkerDispatch) => void {
    const { planId, ...settings } = init.config;
    const config: FundedStateValueConfig = {
        ...settings,
        plan: reconstructPlanFromRegistry(planId),
    };
    const snapshot = new Float64Array(init.snapshotSAB);
    const context = buildFundedSolveContext(config, (key) => {
        if (key < 0 || key >= snapshot.length) {
            throw new RangeError(
                `FundedStateValue worker: value key ${key} is outside the shared snapshot (length ${snapshot.length})`,
            );
        }
        return snapshot[key] ?? 0;
    });
    if (context.keyLayout.length !== snapshot.length) {
        throw new Error(
            `FundedStateValue worker: its key layout holds ${context.keyLayout.length} values but the main thread shared ${snapshot.length}, so the worker's config or plan differs from the main thread's`,
        );
    }
    const lockedResults = new Float64Array(init.lockedResultsSAB);
    const unlockedResults = new Float64Array(init.unlockedResultsSAB);
    return (dispatch) => {
        const results =
            dispatch.resultShape === 'locked' ? lockedResults : unlockedResults;
        const level: FundedLevel = {
            isLocked: dispatch.isLockedAtStart,
            regime: dispatch.regimeAtStart,
            thresholdDollars: dispatch.thresholdDollars,
        };
        for (const pairIndex of dispatch.pairIndices) {
            const dayStartValues = solveDayTree(
                context,
                level,
                decodePair(context, pairIndex, dispatch.cycleBaselineRadix),
                dispatch.cushionBucketCount,
                dispatch.workingBucketCount,
            );
            const baseOffset = pairIndex * dispatch.cushionBucketCount;
            for (let index = 0; index < dispatch.cushionBucketCount; index++) {
                results[baseOffset + index] = dayStartValues[index] ?? 0;
            }
        }
    };
}

function cycleBaselineRadixAt(
    context: FundedSolveContext,
    regime: number,
): number {
    return cycleBaselineRadixFor(regime, context.cycleBaselineGrid.size);
}

function cycleBaselineRadixFor(regime: number, gridSize: number): number {
    return regime === 0 ? 1 : gridSize;
}

function cycleBestDayIndex(
    context: FundedSolveContext,
    dollarsValue: number,
): number {
    if (context.cycleBestDayKeyRadix <= 1) return 0;
    const raw = Math.ceil(
        (dollarsValue - BUCKET_EPSILON) / context.cycleBestDayStepDollars,
    );
    return Math.min(context.cycleBestDayKeyRadix - 1, Math.max(0, raw));
}

function dayCloseOutcome(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    cushionAtEnd: number,
    wasIdleToday: boolean,
    reach: number,
): FundedDayCloseOutcome {
    const { plan } = context;
    const todayPnL = todayPnLOf(context, dayStart, cushionAtEnd);
    const isEarnsQualifyingDay =
        !wasIdleToday && todayPnL >= (plan.minQualifyingDayProfit ?? -Infinity);
    const qualifyingDaysAtEnd = Math.min(
        context.qualifyingDayKeyRadix - 1,
        dayStart.qualifyingDays + (isEarnsQualifyingDay ? 1 : 0),
    );
    const state = buildState(
        context,
        dayStart,
        dayStart.thresholdDollars + cushionAtEnd,
        todayPnL,
        qualifyingDaysAtEnd,
        reach,
    );
    context.drawdown.onDayClose(state);
    plan.recordDayClosePeak(state);
    if (plan.isBust(state, TradingPhase.Funded)) {
        return terminalOutcome(context.bustTerminalValue);
    }

    const idleDaysAtEnd =
        plan.maxConsecutiveIdleDays === null
            ? 0
            : wasIdleToday
              ? dayStart.idleDays + 1
              : 0;
    if (
        plan.maxConsecutiveIdleDays !== null &&
        idleDaysAtEnd >= plan.maxConsecutiveIdleDays
    ) {
        return terminalOutcome(context.bustTerminalValue);
    }

    const cycleBestDayAtStartDollars =
        dayStart.cycleBestDay * context.cycleBestDayStepDollars;
    const cycleBestDayAtEndDollars = Math.max(
        cycleBestDayAtStartDollars,
        todayPnL,
    );
    const cycleBestDayAtEndIndex = cycleBestDayIndex(
        context,
        cycleBestDayAtEndDollars,
    );

    const tracker = newFundedCycleTracker(state);
    tracker.payoutsIssued = dayStart.regime;
    tracker.lastPayoutBalance =
        dayStart.regime === 0
            ? context.startingBalance
            : context.lockedPayoutFloor +
              context.cycleBaselineGrid.dollarsAt(dayStart.cycleBaseline);
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.cycleBestDayProfit = cycleBestDayAtEndDollars;
    if (
        plan.payoutDayGateBasis ===
        PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
    ) {
        state.consecutiveIdleDays = wasIdleToday ? 1 : 0;
        tracker.restoreCalendarDayGateProgress(dayStart.qualifyingDays);
    }

    const payout = tryFundedPayout({
        minRetainedCushion: context.retainedCushion,
        payoutRequestSize: undefined,
        plan,
        state,
        tracker,
    });
    if (
        payout !== null &&
        !state.thresholdLocked &&
        !context.isUnlockedPostPayoutReachable
    ) {
        throw new Error(
            `${plan.label}: FundedStateValue paid out while unlocked, a state its reachability proof (DrawdownStrategy.allowsWithdrawalWhileUnlocked with a retained cushion of ${context.retainedCushion}) ruled out, so the skipped unlocked post-payout levels would be read as zero`,
        );
    }
    const receivedCash = payout?.traderReceives ?? 0;

    if (payout?.causesHardBreach) return terminalOutcome(receivedCash);

    const payoutsIssuedNow = tracker.payoutsIssued;
    if (plan.isAccountConcluded(payoutsIssuedNow)) {
        return terminalOutcome(receivedCash);
    }

    const regimeNow = Math.min(payoutsIssuedNow, context.payoutRegimeCap);
    const nextKey = continuationKey(context, state, regimeNow, {
        cycleBaseline:
            cycleBaselineRadixAt(context, regimeNow) === 1
                ? 0
                : payout === null
                  ? dayStart.cycleBaseline
                  : context.cycleBaselineGrid.indexAtOrAbove(
                        state.balance - context.lockedPayoutFloor,
                    ),
        cycleBestDay:
            payout === null || context.isPerpetualFundedConsistency
                ? cycleBestDayAtEndIndex
                : 0,
        idleDays: idleDaysAtEnd,
        qualifyingDays: Math.min(
            context.qualifyingDayKeyRadix - 1,
            tracker.dayGateProgress(plan, state),
        ),
        ratchet: context.peakRatchet.committedBandOf(state),
    });
    return {
        cash: receivedCash,
        continuationKey: nextKey,
        horizonCredit:
            context.horizonHazard === 0
                ? 0
                : tracker.closeoutCredit({
                      minRetainedCushion: context.retainedCushion,
                      plan,
                      state,
                  }),
    };
}

function dayCloseTableFor(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    cellCount: number,
): FundedDayCloseTable | null {
    const tableKey = `${dayStart.idleDays}:${dayStart.cycleBestDay}:${dayStart.qualifyingDays}:${dayStart.cycleBaseline}`;
    const cached = skeleton.closeTables.get(tableKey);
    if (cached !== undefined) return cached;
    const cache = context.daySkeletons;
    if (cache.closeCellCount + cellCount > MAX_CACHED_DAY_CLOSE_CELLS) {
        return null;
    }
    cache.closeCellCount += cellCount;
    const table: FundedDayCloseTable = {
        cash: new Float64Array(cellCount),
        credit: new Float64Array(cellCount),
        idle: new Map(),
        keys: new Int32Array(cellCount).fill(UNCOMPUTED_CONTINUATION_KEY),
        lockouts: new Map(),
    };
    skeleton.closeTables.set(tableKey, table);
    return table;
}

function dayCloseValue(
    context: FundedSolveContext,
    cash: number,
    continuationKeyValue: number,
    horizonCredit: number,
): number {
    if (continuationKeyValue === TERMINAL_CONTINUATION_KEY) return cash;
    const continuation = context.readValue(continuationKeyValue);
    return context.horizonHazard === 0
        ? cash + continuation
        : cash +
              (1 - context.horizonHazard) * continuation +
              context.horizonHazard * horizonCredit;
}

function dayGateKeyRadix(plan: Plan): number {
    const requiredDaysCap = Math.max(
        plan.minDaysAfterPassForPayout,
        plan.minDaysAfterPassForPayoutPerCycle ??
            plan.minDaysAfterPassForPayout,
    );
    switch (plan.payoutDayGateBasis) {
        case PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout: {
            return sessionDaysForCalendarDays(requiredDaysCap) + 2;
        }
        case PayoutDayGateBasis.QualifyingDaysSincePassOrPayout: {
            return requiredDaysCap + 1;
        }
    }
}

function daySkeletonFor(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    workingBucketCount: number,
): FundedDaySkeleton {
    const cache = context.daySkeletons;
    const levelKey = `${dayStart.isLocked}:${dayStart.thresholdDollars}:${dayStart.regime}:${workingBucketCount}`;
    if (cache.levelKey !== levelKey) {
        cache.skeletons.clear();
        cache.levelKey = levelKey;
        cache.closeCellCount = 0;
    }
    const skeletonKey = `${dayStart.ratchet}:${dayStart.cushionAtDayStart}`;
    const cached = cache.skeletons.get(skeletonKey);
    if (cached !== undefined) return cached;
    const skeleton: FundedDaySkeleton = {
        closeTables: new Map(),
        lockoutIds: new Map(),
        lockouts: [],
        reachCount: reachCountAt(context, dayStart),
        risksByIndex: [],
        rows: [],
        workingBucketCount,
    };
    cache.skeletons.set(skeletonKey, skeleton);
    return skeleton;
}

function decodePair(
    context: FundedSolveContext,
    pairIndex: number,
    cycleBaselineRadix: number,
): FundedPair {
    const cycleBaseline = pairIndex % cycleBaselineRadix;
    const withoutBaseline = Math.floor(pairIndex / cycleBaselineRadix);
    const ratchet = withoutBaseline % context.peakRatchet.radix;
    const withoutRatchet = Math.floor(
        withoutBaseline / context.peakRatchet.radix,
    );
    const qualifyingDays = withoutRatchet % context.qualifyingDayKeyRadix;
    const withoutQualifyingDays = Math.floor(
        withoutRatchet / context.qualifyingDayKeyRadix,
    );
    return {
        cycleBaseline,
        cycleBestDay: withoutQualifyingDays % context.cycleBestDayKeyRadix,
        idleDays: Math.floor(
            withoutQualifyingDays / context.cycleBestDayKeyRadix,
        ),
        qualifyingDays,
        ratchet,
    };
}

function hazardConvergenceSweepCap(
    firstSweepMaxDelta: number,
    convergenceTolerance: number,
    horizonHazard: number,
): number {
    if (
        !Number.isFinite(firstSweepMaxDelta) ||
        !Number.isFinite(convergenceTolerance) ||
        convergenceTolerance <= 0 ||
        firstSweepMaxDelta <= convergenceTolerance
    ) {
        return 1;
    }
    const continuingBranchContraction = 1 - horizonHazard;
    if (continuingBranchContraction <= 0) return 1;
    const additionalSweepsToShrinkBelowTolerance = Math.ceil(
        Math.log(convergenceTolerance / firstSweepMaxDelta) /
            Math.log(continuingBranchContraction),
    );
    return 1 + Math.max(0, additionalSweepsToShrinkBelowTolerance);
}

function isLevelSkipped(
    context: FundedSolveContext,
    regime: number,
    isLocked: boolean,
): boolean {
    return isLevelSkippedFor(
        context.plan,
        context.isUnlockedPostPayoutReachable,
        regime,
        isLocked,
    );
}

function isLevelSkippedFor(
    plan: Plan,
    isUnlockedPostPayoutReachable: boolean,
    regime: number,
    isLocked: boolean,
): boolean {
    return (
        regime > 0 &&
        (plan.isAccountConcluded(regime) ||
            (!isLocked && !isUnlockedPostPayoutReachable))
    );
}

function levelBase(
    context: FundedSolveContext,
    base: null | number | undefined,
    regime: number,
    isLocked: boolean,
): number {
    if (base === undefined || base === null) {
        throw new Error(
            `${context.plan.label}: FundedStateValue keeps no values for the ${isLocked ? 'locked' : 'unlocked'} level after ${regime} payout(s), a level it skips as unreachable or outside its grid`,
        );
    }
    return base;
}

function lockedKey(
    context: FundedSolveContext,
    regime: number,
    pair: FundedPair,
    cushionIndex: number,
): number {
    return (
        levelBase(
            context,
            context.keyLayout.lockedLevelBases[regime],
            regime,
            true,
        ) +
        pairOrdinal(context, regime, pair) * context.lockedCushionBucketCount +
        cushionIndex
    );
}

function maxPairCount(context: FundedSolveContext): number {
    return (
        pairCountAt(context, 0) *
        (context.payoutRegimeCap === 0 ? 1 : context.cycleBaselineGrid.size)
    );
}

function outcomeDayCloseValue(
    context: FundedSolveContext,
    store: Map<number, FundedDayCloseOutcome> | undefined,
    outcomeId: number,
    computeOutcome: () => FundedDayCloseOutcome,
): number {
    let outcome = store?.get(outcomeId);
    if (outcome === undefined) {
        outcome = computeOutcome();
        store?.set(outcomeId, outcome);
    }
    return dayCloseValue(
        context,
        outcome.cash,
        outcome.continuationKey,
        outcome.horizonCredit,
    );
}

function pairCountAt(context: FundedSolveContext, regime: number): number {
    return (
        context.idleKeyRadix *
        context.cycleBestDayKeyRadix *
        context.qualifyingDayKeyRadix *
        context.peakRatchet.radix *
        cycleBaselineRadixAt(context, regime)
    );
}

function pairOrdinal(
    context: FundedSolveContext,
    regime: number,
    pair: FundedPair,
): number {
    const withCycleBestDay =
        pair.idleDays * context.cycleBestDayKeyRadix + pair.cycleBestDay;
    const withQualifyingDays =
        withCycleBestDay * context.qualifyingDayKeyRadix + pair.qualifyingDays;
    const withRatchet =
        withQualifyingDays * context.peakRatchet.radix + pair.ratchet;
    return (
        withRatchet * cycleBaselineRadixAt(context, regime) + pair.cycleBaseline
    );
}

function reachAfterTrade(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    reach: number,
    state: AccountState,
): number {
    return context.peakRatchet.isIntraday
        ? context.peakRatchet.raise(
              dayStart.ratchet + reach,
              context.plan.accountProfit(state),
          ) - dayStart.ratchet
        : 0;
}

function reachCountAt(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
): number {
    return context.peakRatchet.isIntraday
        ? context.peakRatchet.radix - dayStart.ratchet
        : 1;
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

function resolveCycleBestDayGrid(options: {
    readonly cushionStepDollars: number;
    readonly relevantBestDayDollars: number;
    readonly requestedBucketCount: number | undefined;
}): { keyRadix: number; stepDollars: number } {
    const { cushionStepDollars, requestedBucketCount } = options;
    const exactBucketCount =
        Math.floor(
            Math.max(0, options.relevantBestDayDollars) / cushionStepDollars +
                BUCKET_EPSILON,
        ) + 2;
    if (requestedBucketCount === undefined) {
        return { keyRadix: exactBucketCount, stepDollars: cushionStepDollars };
    }
    const keyRadix = Math.max(1, Math.floor(requestedBucketCount));
    if (keyRadix === 1) {
        return { keyRadix, stepDollars: cushionStepDollars };
    }
    return {
        keyRadix,
        stepDollars:
            cushionStepDollars *
            Math.max(1, Math.ceil((exactBucketCount - 1) / (keyRadix - 1))),
    };
}

function resolveLockedThreshold(plan: Plan, startingBalance: number): number {
    const lock = plan.fundedDrawdown.lock;
    if (lock) return lock.lockedThreshold(startingBalance);
    if (plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor) {
        return startingBalance;
    }
    throw new Error(
        `${plan.label}: a thresholdLocked funded state needs a drawdown lock config or a ReleaseFloor payout effect, and this plan has neither`,
    );
}

function runFundedWorkerBootstrap(): void {
    const init = workerData as FundedWorkerInit;
    const flags = new Int32Array(init.flagsSAB);
    const solveDispatch = tryCreateFundedWorkerSolver(init);
    parentPort?.on('message', (dispatch: FundedWorkerDispatch) => {
        runAndSignal(flags, init.workerIndex, init.errorPort, () => {
            if (solveDispatch instanceof Error) throw solveDispatch;
            solveDispatch(dispatch);
        });
    });
}

function skeletonRisks(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    index: number,
): readonly number[] {
    const cached = skeleton.risksByIndex[index];
    if (cached !== undefined) return cached;
    const { plan, positionSizing } = context;
    const cushionNow = index * context.cushionStepDollars;
    const state = buildState(
        context,
        dayStart,
        dayStart.thresholdDollars + cushionNow,
        todayPnLOf(context, dayStart, cushionNow),
        0,
    );
    const risks = candidateRisks(
        context,
        plan.affordableRisk(state, TradingPhase.Funded, context.commission),
        positionSizing === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Funded,
                  positionSizing.instrument.isMicro,
                  plan.tierProfitContext(state),
              ),
    );
    skeleton.risksByIndex[index] = risks;
    return risks;
}

function skeletonRow(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    reach: number,
    index: number,
): FundedSkeletonRow {
    const cell = reach * skeleton.workingBucketCount + index;
    const cached = skeleton.rows[cell];
    if (cached !== undefined) return cached;
    const cushionNow = index * context.cushionStepDollars;
    const risks = skeletonRisks(context, skeleton, dayStart, index);
    const wins = new Int32Array(risks.length);
    const losses = new Int32Array(risks.length);
    for (const [riskIndex, risk] of risks.entries()) {
        if (risk <= 0) continue;
        const pnlWin = context.rrRatio * risk - context.commission;
        wins[riskIndex] = tradeOutcome(
            context,
            skeleton,
            dayStart,
            cushionNow + pnlWin,
            reach,
        );
        const pnlLose = -risk - context.commission;
        losses[riskIndex] = tradeOutcome(
            context,
            skeleton,
            dayStart,
            cushionNow + pnlLose,
            reach,
        );
    }
    const row: FundedSkeletonRow = { losses, risks, wins };
    skeleton.rows[cell] = row;
    return row;
}

function solveDayTree(
    context: FundedSolveContext,
    level: FundedLevel,
    pair: FundedPair,
    cushionBucketCount: number,
    workingBucketCount: number,
): number[] {
    if (!context.isSolvingPerDayStart) {
        return Array.from(
            solveDayTreeOnce(
                context,
                { ...level, ...pair, cushionAtDayStart: 0 },
                workingBucketCount,
                false,
            ).finalTable.subarray(0, cushionBucketCount),
        );
    }
    return Array.from(
        { length: cushionBucketCount },
        (_, cushionStartIndex) =>
            solveDayTreeOnce(
                context,
                {
                    ...level,
                    ...pair,
                    cushionAtDayStart:
                        cushionStartIndex * context.cushionStepDollars,
                },
                workingBucketCount,
                false,
            ).finalTable[cushionStartIndex] ?? 0,
    );
}

function solveDayTreeOnce(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    workingBucketCount: number,
    isRecordingPolicy: boolean,
): { finalTable: Float64Array; policyTables: number[][][] } {
    const skeleton = daySkeletonFor(context, dayStart, workingBucketCount);
    const { cushionStepDollars, winrate } = context;
    const { reachCount } = skeleton;
    const cellCount = reachCount * workingBucketCount;
    const closeTable = dayCloseTableFor(context, skeleton, dayStart, cellCount);
    const stopValues = new Float64Array(cellCount).fill(NaN);
    const lockoutValues: number[] = [];
    const stopValueAt = (cell: number): number => {
        if (cell >= cellCount) return 0;
        const memo = stopValues[cell] ?? NaN;
        if (!Number.isNaN(memo)) return memo;
        const value = cachedStopValue(
            context,
            dayStart,
            workingBucketCount,
            closeTable,
            cell,
        );
        stopValues[cell] = value;
        return value;
    };
    const lockoutValueAt = (lockoutId: number): number => {
        const memo = lockoutValues[lockoutId];
        if (memo !== undefined) return memo;
        const lockout = skeleton.lockouts[lockoutId];
        const value =
            lockout === undefined
                ? 0
                : outcomeDayCloseValue(
                      context,
                      closeTable?.lockouts,
                      lockoutId,
                      () =>
                          dayCloseOutcome(
                              context,
                              dayStart,
                              lockout.cushionAfter,
                              false,
                              lockout.reachAfter,
                          ),
                  );
        lockoutValues[lockoutId] = value;
        return value;
    };
    const idleValueAt = (reach: number, index: number): number =>
        outcomeDayCloseValue(
            context,
            closeTable?.idle,
            reach * workingBucketCount + index,
            () =>
                dayCloseOutcome(
                    context,
                    dayStart,
                    index * cushionStepDollars,
                    true,
                    reach,
                ),
        );

    const isWindowed = context.isSolvingPerDayStart && !isRecordingPolicy;
    const startIndex = Math.round(
        dayStart.cushionAtDayStart / cushionStepDollars,
    );
    const maxRisk = Math.max(0, ...context.actionGrid);
    const cellsUpPerTrade =
        Math.ceil((context.rrRatio * maxRisk) / cushionStepDollars) + 1;
    const cellsDownPerTrade =
        Math.ceil((maxRisk + context.commission) / cushionStepDollars) + 1;

    let nextTable: Float64Array | null = null;
    const policyTables: number[][][] = [];
    for (let tradeIndex = context.slots - 1; tradeIndex >= 0; tradeIndex--) {
        const readNext = nextTable;
        const outcomeValue = (outcome: number): number => {
            if (outcome >= 0) {
                return readNext === null
                    ? stopValueAt(outcome)
                    : (readNext[outcome] ?? 0);
            }
            return outcome === OUTCOME_BUST
                ? context.bustTerminalValue
                : lockoutValueAt(OUTCOME_FIRST_LOCKOUT - outcome);
        };
        const lowIndex = isWindowed
            ? Math.max(0, startIndex - tradeIndex * cellsDownPerTrade)
            : 0;
        const highIndex = isWindowed
            ? Math.min(
                  workingBucketCount - 1,
                  startIndex + tradeIndex * cellsUpPerTrade,
              )
            : workingBucketCount - 1;
        const currentTable = new Float64Array(cellCount);
        const currentPolicies: number[][] = [];
        for (let reach = 0; reach < reachCount; reach++) {
            const currentPolicy: number[] = isRecordingPolicy
                ? Array.from({ length: workingBucketCount })
                : [];
            for (let index = lowIndex; index <= highIndex; index++) {
                const cell = reach * workingBucketCount + index;
                const row = skeletonRow(
                    context,
                    skeleton,
                    dayStart,
                    reach,
                    index,
                );
                let bestValue = -Infinity;
                let bestAction = 0;
                for (const [riskIndex, risk] of row.risks.entries()) {
                    const value =
                        risk <= 0
                            ? tradeIndex === 0
                                ? idleValueAt(reach, index)
                                : stopValueAt(cell)
                            : winrate * outcomeValue(row.wins[riskIndex] ?? 0) +
                              (1 - winrate) *
                                  outcomeValue(row.losses[riskIndex] ?? 0);
                    if (value <= bestValue) continue;
                    bestValue = value;
                    bestAction = risk;
                }
                currentTable[cell] = bestValue;
                if (isRecordingPolicy) currentPolicy[index] = bestAction;
            }
            currentPolicies.push(currentPolicy);
        }
        policyTables[tradeIndex] = currentPolicies;
        nextTable = currentTable;
    }
    const dayStartTable = (nextTable ?? new Float64Array(cellCount)).subarray(
        0,
        workingBucketCount,
    );
    const finalTable =
        context.dayCost === 0
            ? dayStartTable
            : dayStartTable.map((entry) => entry - context.dayCost);
    return { finalTable, policyTables };
}

function terminalOutcome(cash: number): FundedDayCloseOutcome {
    return {
        cash,
        continuationKey: TERMINAL_CONTINUATION_KEY,
        horizonCredit: 0,
    };
}

function thresholdState(
    startingBalance: number,
    threshold: number,
): AccountState {
    const state = createInitialState(startingBalance, threshold);
    state.balance = threshold;
    return state;
}

function todayPnLOf(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    cushionNow: number,
): number {
    return context.isSolvingPerDayStart
        ? cushionNow - dayStart.cushionAtDayStart
        : 0;
}

function toSerializableConfig(
    config: FundedStateValueConfig,
): SerializableFundedConfig {
    const { plan, ...settings } = config;
    return { ...settings, planId: plan.id };
}

function tradeOutcome(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    cushionAfter: number,
    reach: number,
): number {
    if (cushionAfter <= 0) return OUTCOME_BUST;
    const { plan } = context;
    const state = buildState(
        context,
        dayStart,
        dayStart.thresholdDollars + cushionAfter,
        todayPnLOf(context, dayStart, cushionAfter),
        0,
    );
    context.drawdown.onTrade(state, 0);
    if (plan.isBust(state, TradingPhase.Funded)) return OUTCOME_BUST;
    const reachAfter = reachAfterTrade(context, dayStart, reach, state);
    if (plan.isDayLockedOut(state, TradingPhase.Funded)) {
        const lockoutKey = `${reachAfter}:${cushionAfter}`;
        let lockoutId = skeleton.lockoutIds.get(lockoutKey);
        if (lockoutId === undefined) {
            lockoutId = skeleton.lockouts.length;
            skeleton.lockouts.push({ cushionAfter, reachAfter });
            skeleton.lockoutIds.set(lockoutKey, lockoutId);
        }
        return OUTCOME_FIRST_LOCKOUT - lockoutId;
    }
    return (
        reachAfter * skeleton.workingBucketCount +
        bucketIndex(context, cushionAfter, skeleton.workingBucketCount)
    );
}

function tryCreateFundedWorkerSolver(
    init: FundedWorkerInit,
): ((dispatch: FundedWorkerDispatch) => void) | Error {
    try {
        return createFundedWorkerSolver(init);
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }
}

function unlockedKey(
    context: FundedSolveContext,
    offsetIndex: number,
    regime: number,
    pair: FundedPair,
    cushionIndex: number,
): number {
    return (
        levelBase(
            context,
            context.keyLayout.unlockedLevelBases[
                offsetIndex * context.regimeKeyRadix + regime
            ],
            regime,
            false,
        ) +
        pairOrdinal(context, regime, pair) *
            context.unlockedCushionBucketCount +
        cushionIndex
    );
}

if (!isMainThread) {
    const init = workerData as Partial<FundedWorkerInit> | undefined;
    if (init?.role === 'funded-state-value-worker') {
        runFundedWorkerBootstrap();
    }
}

class FundedWorkerPool {
    private dispatchCount = 0;
    private readonly errorPorts: MessagePort[] = [];
    private readonly flags: Int32Array;
    private readonly lockedResults: Float64Array;
    private readonly snapshot: Float64Array;
    private readonly unlockedResults: Float64Array;
    private readonly workers: Worker[] = [];

    constructor(
        numberWorkers: number,
        config: FundedStateValueConfig,
        context: FundedSolveContext,
    ) {
        const totalPairs = maxPairCount(context);
        const snapshotSAB = new SharedArrayBuffer(context.keyLayout.length * 8);
        this.snapshot = new Float64Array(snapshotSAB);

        const lockedResultsSAB = new SharedArrayBuffer(
            totalPairs * context.lockedCushionBucketCount * 8,
        );
        const unlockedResultsSAB = new SharedArrayBuffer(
            totalPairs * context.unlockedCushionBucketCount * 8,
        );
        this.lockedResults = new Float64Array(lockedResultsSAB);
        this.unlockedResults = new Float64Array(unlockedResultsSAB);

        const flagsSAB = new SharedArrayBuffer(numberWorkers * 4);
        this.flags = new Int32Array(flagsSAB);

        const serializableConfig = toSerializableConfig(config);
        for (let workerIndex = 0; workerIndex < numberWorkers; workerIndex++) {
            const { port1, port2 } = new MessageChannel();
            this.errorPorts.push(port1);
            const init: FundedWorkerInit = {
                config: serializableConfig,
                errorPort: port2,
                flagsSAB,
                lockedResultsSAB,
                role: 'funded-state-value-worker',
                snapshotSAB,
                unlockedResultsSAB,
                workerIndex,
            };
            try {
                this.workers.push(
                    new Worker(new URL(import.meta.url), {
                        execArgv: ['--import', 'tsx'],
                        transferList: [port2],
                        workerData: init,
                    }),
                );
            } catch (error) {
                port2.close();
                this.terminate();
                throw error;
            }
        }
    }

    get usedWorkerCount(): number {
        return this.dispatchCount === 0 ? 0 : this.workers.length;
    }

    runGrid(
        level: FundedLevel,
        pairCount: number,
        cycleBaselineRadix: number,
        cushionBucketCount: number,
        workingBucketCount: number,
    ): number[][] {
        this.dispatchCount++;
        const resultShape = level.isLocked ? 'locked' : 'unlocked';
        const results = level.isLocked
            ? this.lockedResults
            : this.unlockedResults;

        const perWorkerPairs: number[][] = Array.from(
            { length: this.workers.length },
            () => [],
        );
        for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
            perWorkerPairs[pairIndex % this.workers.length]?.push(pairIndex);
        }

        for (
            let workerIndex = 0;
            workerIndex < this.workers.length;
            workerIndex++
        ) {
            Atomics.store(this.flags, workerIndex, WorkerSignal.Pending);
        }
        for (
            let workerIndex = 0;
            workerIndex < this.workers.length;
            workerIndex++
        ) {
            const pairIndices = perWorkerPairs[workerIndex] ?? [];
            if (pairIndices.length === 0) {
                Atomics.store(this.flags, workerIndex, WorkerSignal.Done);
                continue;
            }
            const dispatch: FundedWorkerDispatch = {
                cushionBucketCount,
                cycleBaselineRadix,
                isLockedAtStart: level.isLocked,
                pairIndices,
                regimeAtStart: level.regime,
                resultShape,
                thresholdDollars: level.thresholdDollars,
                workingBucketCount,
            };
            this.workers[workerIndex]?.postMessage(dispatch);
        }
        for (const [workerIndex, errorPort] of this.errorPorts.entries()) {
            awaitWorkerSignal(
                this.flags,
                workerIndex,
                errorPort,
                WORKER_DISPATCH_TIMEOUT_MS,
                'FundedStateValue',
            );
        }

        return Array.from({ length: pairCount }, (_, pairIndex) =>
            Array.from(
                { length: cushionBucketCount },
                (_valuePlaceholder, index) =>
                    results[pairIndex * cushionBucketCount + index] ?? 0,
            ),
        );
    }

    terminate(): void {
        for (const worker of this.workers) {
            void worker.terminate();
        }
        for (const errorPort of this.errorPorts) {
            errorPort.close();
        }
    }

    write(key: number, next: number): void {
        this.snapshot[key] = next;
    }
}

export function computeFundedStateValue(
    config: FundedStateValueConfig,
): FundedStateValueResult {
    const { plan } = config;
    if (!isFundedDpEligible(plan)) {
        throw new Error(
            `${plan.label}: not eligible for FundedStateValue DP (call isFundedDpEligible first) -- its funded drawdown is intraday-trailing, its funded daily loss limit scales continuously with peak-day-close profit (PeakProfitShare), it has no funded drawdown lock and no ReleaseFloor payout floor effect, or its payoutCapOverride is a QualifyingDaysMilestonePayoutCap (keyed on cumulative qualifying days, which this DP cannot track exactly)`,
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

    const value = new Map<number, number>();
    let unconvergedLevelCount = 0;

    const mainContext = buildFundedSolveContext(
        config,
        (key) => value.get(key) ?? 0,
    );

    const convergenceTolerance =
        config.convergenceTolerance ?? DEFAULT_CONVERGENCE_TOLERANCE;
    const isMaxIterationsPerLevelExplicit =
        config.maxIterationsPerLevel !== undefined;
    const maxIterationsPerLevel =
        config.maxIterationsPerLevel ?? DEFAULT_MAX_ITERATIONS_PER_LEVEL;

    const {
        cushionStepDollars,
        drawdown,
        initialThreshold,
        lockedCushionBucketCount,
        lockedThreshold,
        offsetBucketCount,
        payoutRegimeCap,
        unlockedCushionBucketCount,
        unlockedWorkingBucketCount,
    } = mainContext;

    const workerPool = tryCreateWorkerPool(config, mainContext);

    try {
        function sweepLevel(
            level: FundedLevel,
            cushionBucketCount: number,
            workingBucketCount: number,
            keyFor: (pair: FundedPair, cushionIndex: number) => number,
        ): number {
            const cycleBaselineRadix = cycleBaselineRadixAt(
                mainContext,
                level.regime,
            );
            const pairCount = pairCountAt(mainContext, level.regime);
            const dayStartValuesByPair =
                workerPool !== null && pairCount >= MIN_PARALLEL_GRID_CELLS
                    ? workerPool.runGrid(
                          level,
                          pairCount,
                          cycleBaselineRadix,
                          cushionBucketCount,
                          workingBucketCount,
                      )
                    : Array.from({ length: pairCount }, (_, pairIndex) =>
                          solveDayTree(
                              mainContext,
                              level,
                              decodePair(
                                  mainContext,
                                  pairIndex,
                                  cycleBaselineRadix,
                              ),
                              cushionBucketCount,
                              workingBucketCount,
                          ),
                      );

            let maxDelta = 0;
            const updates: [number, number][] = [];
            for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
                const pair = decodePair(
                    mainContext,
                    pairIndex,
                    cycleBaselineRadix,
                );
                const dayStartValues = dayStartValuesByPair[pairIndex] ?? [];
                for (let index = 0; index < cushionBucketCount; index++) {
                    const key = keyFor(pair, index);
                    const next = dayStartValues[index] ?? 0;
                    maxDelta = Math.max(
                        maxDelta,
                        Math.abs(next - (value.get(key) ?? 0)),
                    );
                    updates.push([key, next]);
                }
            }
            for (const [key, next] of updates) {
                value.set(key, next);
                workerPool?.write(key, next);
            }
            return maxDelta;
        }

        function solveLevelToConvergence(
            level: FundedLevel,
            cushionBucketCount: number,
            workingBucketCount: number,
            keyFor: (pair: FundedPair, cushionIndex: number) => number,
        ): void {
            let lastMaxDelta = Infinity;
            let sweepCapForThisLevel = maxIterationsPerLevel;
            for (
                let iteration = 0;
                iteration < sweepCapForThisLevel;
                iteration++
            ) {
                lastMaxDelta = sweepLevel(
                    level,
                    cushionBucketCount,
                    workingBucketCount,
                    keyFor,
                );
                if (
                    iteration === 0 &&
                    !isMaxIterationsPerLevelExplicit &&
                    mainContext.horizonHazard > 0
                ) {
                    sweepCapForThisLevel = Math.max(
                        sweepCapForThisLevel,
                        hazardConvergenceSweepCap(
                            lastMaxDelta,
                            convergenceTolerance,
                            mainContext.horizonHazard,
                        ),
                    );
                }
                if (lastMaxDelta < convergenceTolerance) break;
            }
            if (lastMaxDelta >= convergenceTolerance) unconvergedLevelCount++;
        }

        for (let regime = payoutRegimeCap; regime >= 0; regime--) {
            if (isLevelSkipped(mainContext, regime, true)) continue;
            solveLevelToConvergence(
                { isLocked: true, regime, thresholdDollars: lockedThreshold },
                lockedCushionBucketCount,
                lockedCushionBucketCount,
                (pair, index) => lockedKey(mainContext, regime, pair, index),
            );
        }

        for (
            let offsetIndex = offsetBucketCount - 1;
            offsetIndex >= 0;
            offsetIndex--
        ) {
            const thresholdDollars =
                initialThreshold + offsetIndex * cushionStepDollars;
            for (let regime = payoutRegimeCap; regime >= 0; regime--) {
                if (isLevelSkipped(mainContext, regime, false)) continue;
                solveLevelToConvergence(
                    { isLocked: false, regime, thresholdDollars },
                    unlockedCushionBucketCount,
                    unlockedWorkingBucketCount,
                    (pair, index) =>
                        unlockedKey(
                            mainContext,
                            offsetIndex,
                            regime,
                            pair,
                            index,
                        ),
                );
            }
        }
    } finally {
        workerPool?.terminate();
    }

    const startingPair: FundedPair = {
        cycleBaseline: 0,
        cycleBestDay: 0,
        idleDays: 0,
        qualifyingDays: 0,
        ratchet: 0,
    };
    const initialValue =
        value.get(
            unlockedKey(
                mainContext,
                0,
                0,
                startingPair,
                bucketIndex(
                    mainContext,
                    drawdown.amount,
                    unlockedCushionBucketCount,
                ),
            ),
        ) ?? 0;

    const policyCache = new Map<number, number[][][]>();

    function cycleBaselineIndexFor(
        regime: number,
        lastPayoutBalance: number,
    ): number {
        return cycleBaselineRadixAt(mainContext, regime) === 1
            ? 0
            : mainContext.cycleBaselineGrid.indexAtOrAbove(
                  lastPayoutBalance - mainContext.lockedPayoutFloor,
              );
    }

    function computeRisk(
        state: AccountState,
        tradeIndexToday: number,
        fundedCycle?: FundedCycleSnapshot,
    ): number {
        const regime = Math.min(
            fundedCycle?.payoutsIssued ?? 0,
            payoutRegimeCap,
        );
        if (isLevelSkipped(mainContext, regime, state.thresholdLocked)) {
            throw new Error(
                `${plan.label}: FundedStateValue computeRisk was asked for a ${state.thresholdLocked ? 'locked' : 'unlocked'} state after ${regime} payout(s), which this plan can never reach (the account concludes there, or a payout always locks it), so no policy was solved for it`,
            );
        }
        const pair: FundedPair = {
            cycleBaseline: cycleBaselineIndexFor(
                regime,
                fundedCycle?.lastPayoutBalance ?? mainContext.startingBalance,
            ),
            cycleBestDay: cycleBestDayIndex(
                mainContext,
                fundedCycle?.cycleBestDayProfit ?? 0,
            ),
            idleDays: plan.clampedIdleDays(state, TradingPhase.Funded),
            qualifyingDays: Math.min(
                mainContext.qualifyingDayKeyRadix - 1,
                Math.max(0, Math.floor(fundedCycle?.dayGateProgress ?? 0)),
            ),
            ratchet: mainContext.peakRatchet.committedBandOf(state),
        };
        const cushionDollars = state.balance - state.threshold;
        const cushionAtDayStartDollars = cushionDollars - state.todayPnL;
        const offsetIndex = state.thresholdLocked
            ? 0
            : bucketIndex(
                  mainContext,
                  state.threshold - initialThreshold,
                  offsetBucketCount,
              );
        const cushionBucketCount = state.thresholdLocked
            ? lockedCushionBucketCount
            : unlockedCushionBucketCount;
        const workingBucketCount = state.thresholdLocked
            ? lockedCushionBucketCount
            : unlockedWorkingBucketCount;
        const cushionStartIndex = mainContext.isSolvingPerDayStart
            ? bucketIndex(
                  mainContext,
                  cushionAtDayStartDollars,
                  cushionBucketCount,
              )
            : 0;
        const level: FundedLevel = state.thresholdLocked
            ? { isLocked: true, regime, thresholdDollars: lockedThreshold }
            : {
                  isLocked: false,
                  regime,
                  thresholdDollars:
                      initialThreshold + offsetIndex * cushionStepDollars,
              };
        const cacheKey = state.thresholdLocked
            ? lockedKey(mainContext, regime, pair, cushionStartIndex)
            : unlockedKey(
                  mainContext,
                  offsetIndex,
                  regime,
                  pair,
                  cushionStartIndex,
              );
        let policyTables = policyCache.get(cacheKey);
        if (policyTables === undefined) {
            policyTables = solveDayTreeOnce(
                mainContext,
                {
                    ...level,
                    ...pair,
                    cushionAtDayStart:
                        cushionStartIndex * mainContext.cushionStepDollars,
                },
                workingBucketCount,
                true,
            ).policyTables;
            policyCache.set(cacheKey, policyTables);
        }
        const reach = mainContext.peakRatchet.reachBandOf(state) - pair.ratchet;
        return (
            policyTables[tradeIndexToday]?.[reach]?.[
                bucketIndex(mainContext, cushionDollars, workingBucketCount)
            ] ?? 0
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
        unconvergedLevelCount,
        workerCount: workerPool?.usedWorkerCount ?? 0,
    };
}

export function isFundedDpEligible(plan: Plan): boolean {
    return (
        isDrawdownDpEligible(plan.fundedDrawdown.kind) &&
        !hasPeakShareDependency(
            describeDailyLossLimit(plan.fundedDailyLossLimit),
        ) &&
        (plan.fundedDrawdown.lock !== undefined ||
            plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor) &&
        !(plan.payoutCapOverride instanceof QualifyingDaysMilestonePayoutCap)
    );
}

function tryCreateWorkerPool(
    config: FundedStateValueConfig,
    context: FundedSolveContext,
): FundedWorkerPool | null {
    const totalPairs = maxPairCount(context);
    if (totalPairs < MIN_PARALLEL_GRID_CELLS) return null;

    const cores = availableParallelism();
    if (cores <= 1 || findRegistryPlanId(config.plan) === null) return null;

    const numberWorkers = Math.min(cores, MAX_WORKER_COUNT, totalPairs);
    try {
        return new FundedWorkerPool(numberWorkers, config, context);
    } catch (error) {
        throw new Error(
            `${config.plan.label}: FundedStateValue could not start its worker pool of ${numberWorkers} workers over a ${context.keyLayout.length}-value shared snapshot: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
}
