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

import type * as FirmsModule from '~/lib/prop-calculator/firms';

import { type AccountState, createInitialState } from './AccountState';
import { BUCKET_EPSILON } from './constants';
import {
    DailyLossLimitKind,
    describeDailyLossLimit,
    hasPeakShareDependency,
} from './DailyLossLimit';
import {
    type AffordableRoom,
    type AffordableRoomKind,
    computedDayPolicy,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    type FundedCycleSnapshot,
    placeWholeContractTrade,
    PolicySizing,
    resolveTradeRisk,
    type RungSizing,
    type SizedTrade,
} from './DayPolicy';
import {
    isDrawdownDpEligible,
    splitOntoCushionGrid,
    valueOnCushionGrid,
} from './EvalStateValue';
import { type CouponDiscounts } from './FeeSchedule';
import {
    FundedCushionGrid,
    type FundedCushionGridSummary,
} from './FundedCushionGrid';
import { FundedCycleBaselineGrid } from './FundedCycleBaselineGrid';
import { FundedCycleBestDayGrid } from './FundedCycleBestDayGrid';
import {
    DEFAULT_ACTION_STEP_MULTIPLE,
    DEFAULT_CUSHION_STEP_MULTIPLE,
    DEFAULT_MAX_ACTION_MULTIPLE,
    DEFAULT_MAX_CUSHION_MULTIPLE,
    DEFAULT_MAX_TAIL_CUSHION_MULTIPLE,
    DEFAULT_TAIL_CUSHION_STEP_MULTIPLE,
} from './FundedGridDefaults';
import {
    newFundedCycleTracker,
    PayoutDayGateBasis,
    restoreFundedCycleTracker,
    sessionDaysForCalendarDays,
} from './FundedPayoutCycle';
import {
    canTakeFundedReset,
    fundedResetFee,
    fundedResetsBeforeFirstPayout,
} from './FundedReset';
import { type ContractCount, dollars, type Dollars } from './lib/units';
import {
    awaitWorkerSignal,
    runAndSignal,
    WorkerSignal,
} from './lib/workerSignal';
import { QualifyingDaysMilestonePayoutCap } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type PayoutRequestPolicy } from './PayoutRequestPolicy';
import { type PeakRatchet } from './PeakRatchet';
import { type Plan } from './Plan';
import { type PlanId } from './PlanId';
import { NO_PLAN_OPT_INS, type PlanOptIns, withPlanOptIns } from './PlanOptIns';
import { contractLimitAt, type PositionSizingConfig } from './PositionSizing';
import { TierBasis } from './TierBasis';
import { TradingPhase } from './TradingPhase';

export enum SweepVerdict {
    Continue = 'continue',
    Converged = 'converged',
    Extrapolate = 'extrapolate',
}

export interface CandidateTradeContext {
    readonly actionGrid: readonly number[];
    readonly candidateTradesCache: CandidateTradesCache;
    readonly positionSizing: null | PositionSizingConfig;
    readonly rungSizing: RungSizing;
}

export type CandidateTradesCache = Map<
    AffordableRoomKind,
    Map<number, Map<number, readonly SizedTrade[]>>
>;

export interface FundedCycleBaselineRounding {
    readonly coarseFromDollars: number;
    readonly coarseStepDollars: number;
    readonly topDollars: number;
}

export interface FundedResolvedCushionGrid extends FundedCushionGridSummary {
    readonly lockedTopDollars: number;
}

export interface FundedStateValueConfig {
    readonly actionStepMultiple?: number;
    readonly commission?: Dollars;
    readonly convergenceTolerance?: number;
    readonly cushionStepMultiple?: number;
    readonly cycleBaselineFineRangeMultiple?: number;
    readonly cycleBestDayBucketCount?: number;
    readonly dayCost?: number;
    readonly discounts?: CouponDiscounts;
    readonly evalInitialValue: number;
    readonly feePerAttempt: Dollars;
    readonly maxActionMultiple?: number;
    readonly maxCushionMultiple?: number;
    readonly maxIterationsPerLevel?: number;
    readonly maxPreLockOffsetMultiple?: number;
    readonly maxTailCushionMultiple?: number;
    readonly meanHorizonDays?: number;
    readonly minRetainedCushion?: number;
    readonly payoutRegimeCap?: number;
    readonly payoutRequestPolicy?: PayoutRequestPolicy;
    readonly payoutRequestSize?: Dollars;
    readonly plan: Plan;
    readonly positionSizing?: null | PositionSizingConfig;
    readonly rrRatio: number;
    readonly rungSizing?: RungSizing;
    readonly stopRule?: DayStopRule;
    readonly tailCushionStepMultiple?: number;
    readonly tradesPerDay?: number;
    readonly warmStartValues?: Float64Array;
    readonly winrate: number;
}

export interface FundedStateValueResult {
    readonly bustTerminalValue: number;
    readonly cushionGrid: FundedResolvedCushionGrid;
    readonly cycleBaselineRounding: FundedCycleBaselineRounding | null;
    readonly dayPolicy: DayPolicy;
    readonly initialValue: number;
    readonly isGridSaturated: (
        state: AccountState,
        fundedCycle?: FundedCycleSnapshot,
    ) => boolean;
    readonly reachedStateCount: number;
    readonly stateValues: Float64Array;
    readonly sweepCount: number;
    readonly unconvergedLevelCount: number;
    readonly valueErrorBound: number;
    readonly workerCount: number;
}

export interface SweepStep {
    readonly extrapolationFactor: number;
    readonly verdict: SweepVerdict;
}

export interface SweepToConvergenceOptions {
    readonly extrapolate: (factor: number) => void;
    readonly isMaxIterationsExplicit: boolean;
    readonly maxIterations: number;
    readonly monitor: ValueIterationMonitor;
    readonly sweep: () => number;
}

const DEFAULT_MAX_PRE_LOCK_OFFSET_MULTIPLE = 3;
const DEFAULT_PAYOUT_REGIME_CAP = 6;
const DEFAULT_TRADES_PER_DAY = 4;
const DEFAULT_CONVERGENCE_TOLERANCE = 1;
const DEFAULT_MAX_ITERATIONS_PER_LEVEL = 200;
const DEFAULT_CYCLE_BASELINE_FINE_RANGE_MULTIPLE = 1;
const EXTRAPOLATION_BACKOFF = 4;
const EXTRAPOLATION_RATIO_STABILITY = 0.05;
const EXTRAPOLATION_RATIO_WINDOW = 3;
const MAX_EXTRAPOLATIONS_PER_LEVEL = 64;
const MAX_WORKER_COUNT = 8;
const MIN_PARALLEL_GROUP_COUNT = 2;
const WORKER_DISPATCH_TIMEOUT_MS = 120_000;
const OUTCOME_BUST = -1;
const OUTCOME_FIRST_LOCKOUT = -2;
const TERMINAL_CONTINUATION_KEY = -1;
const UNCOMPUTED_CONTINUATION_KEY = -2;
const BREACH_BEFORE_FIRST_PAYOUT_KEY = -3;
const MAX_CACHED_DAY_CLOSE_CELLS = 4_000_000;
const MAX_CACHED_IDLE_CLOSE_CELLS = 2_000_000;
const CACHED_MAP_ENTRY_CELL_COST = 6;
const CACHED_TABLE_OVERHEAD_CELL_COST = 25;

enum FundedDayTreePurpose {
    Policy = 'policy',
    TradingValue = 'trading-value',
}

enum FundedWorkerMessageKind {
    Configure = 'configure',
    Solve = 'solve',
}

interface FundedContinuationSplit {
    readonly lowerKey: number;
    readonly offsetUpperKey: number;
    readonly offsetUpperWeight: number;
    readonly upperWeight: number;
}

interface FundedDayCloseCells {
    readonly cash: Float64Array;
    readonly credit: Float64Array;
    readonly keys: Int32Array;
    readonly offsetUpperKeys: Int32Array;
    readonly offsetUpperWeights: Float64Array;
    readonly weights: Float64Array;
}

interface FundedDayCloseOutcome {
    readonly cash: number;
    readonly continuationKey: number;
    readonly continuationOffsetUpperKey: number;
    readonly continuationOffsetUpperWeight: number;
    readonly continuationUpperWeight: number;
    readonly horizonCredit: number;
}

interface FundedDayCloseTable {
    idleCells: FundedDayCloseCells | null;
    readonly idleEntries: Map<number, FundedDayCloseOutcome>;
    readonly lockouts: Map<number, FundedDayCloseOutcome>;
    readonly stops: FundedDayCloseCells;
}

interface FundedDaySkeleton {
    readonly closeTables: Map<string, FundedDayCloseTable>;
    readonly lockoutIds: Map<string, number>;
    readonly lockouts: FundedLockout[];
    readonly reachCount: number;
    readonly rows: (FundedSkeletonRow | undefined)[];
    readonly tradesByIndex: (readonly SizedTrade[] | undefined)[];
    readonly workingBucketCount: number;
}

interface FundedDaySkeletonCache {
    closeCellCount: number;
    levelKey: null | string;
    readonly skeletons: Map<string, FundedDaySkeleton>;
}

interface FundedDaySolveScope {
    readonly cellCount: number;
    readonly closeTable: FundedDayCloseTable | null;
    readonly context: FundedSolveContext;
    readonly dayStart: FundedDayStart;
    readonly lockoutValues: number[];
    readonly skeleton: FundedDaySkeleton;
    readonly stopValues: Float64Array;
    readonly workingBucketCount: number;
}

interface FundedDayStart extends FundedLevel, FundedPair {
    readonly cushionAtDayStart: number;
}

interface FundedIdleCloseCache {
    cells: FundedDayCloseCells | null;
    levelKey: null | string;
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

interface FundedLevelSolve {
    readonly reachedStateCount: number;
    readonly resetLayers: ReadonlyMap<number, FundedResetLayer>;
    readonly sweepCount: number;
    readonly unconvergedLevelCount: number;
    readonly valueErrorBound: number;
    readonly workerCount: number;
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

interface FundedPolicyDay {
    readonly idleValues: Float64Array;
    readonly nextTables: readonly (Float64Array | null)[];
    readonly risks: Map<string, number>;
    readonly scope: FundedDaySolveScope;
}

interface FundedResetLayer {
    readonly breachValueBeforeFirstPayout: number;
    readonly regimeZeroValues: Float64Array;
}

interface FundedSkeletonRow {
    readonly losses: Int32Array;
    readonly lossUpperWeights: Float64Array;
    readonly risks: readonly number[];
    readonly wins: Int32Array;
    readonly winUpperWeights: Float64Array;
}

interface FundedSolveContext {
    readonly actionGrid: readonly number[];
    breachValueBeforeFirstPayout: number;
    readonly bustTerminalValue: number;
    readonly candidateTradesCache: CandidateTradesCache;
    readonly commission: Dollars;
    readonly cushionGrid: FundedCushionGrid;
    readonly cushionStepDollars: number;
    readonly cycleBaselineGrid: FundedCycleBaselineGrid;
    readonly cycleBestDayGrid: FundedCycleBestDayGrid;
    readonly dayCost: number;
    readonly daySkeletons: FundedDaySkeletonCache;
    readonly drawdown: Plan['fundedDrawdown'];
    readonly freshStartHorizonCredit: number;
    readonly fundedResetFee: number;
    readonly fundedResetLayerCount: number;
    readonly horizonHazard: number;
    readonly idleCloses: FundedIdleCloseCache;
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
    readonly payoutRequestPolicy: PayoutRequestPolicy | undefined;
    readonly payoutRequestSize: Dollars | undefined;
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

interface FundedTradeOutcome {
    readonly outcome: number;
    readonly upperWeight: number;
}

interface FundedValueRange {
    readonly base: number;
    readonly copyOffset: number;
    readonly length: number;
}

interface FundedWorkerConfigure {
    readonly config: SerializableFundedConfig;
    readonly kind: FundedWorkerMessageKind.Configure;
    readonly snapshotSAB: SharedArrayBuffer;
}

interface FundedWorkerDispatch {
    readonly breachValueBeforeFirstPayout: number;
    readonly cushionBucketCount: number;
    readonly groupIndices: readonly number[];
    readonly isLockedAtStart: boolean;
    readonly kind: FundedWorkerMessageKind.Solve;
    readonly regimeAtStart: number;
    readonly thresholdDollars: number;
    readonly workingBucketCount: number;
}

interface FundedWorkerInit {
    readonly config: SerializableFundedConfig;
    readonly errorPort: MessagePort;
    readonly flagsSAB: SharedArrayBuffer;
    readonly resultsSAB: SharedArrayBuffer;
    readonly role: 'funded-state-value-worker';
    readonly snapshotSAB: SharedArrayBuffer;
    readonly workerIndex: number;
}

type FundedWorkerMessage = FundedWorkerConfigure | FundedWorkerDispatch;

interface FundedWorkerSolver {
    readonly context: FundedSolveContext;
    readonly solve: (dispatch: FundedWorkerDispatch) => void;
}

interface IdleGroupShape {
    readonly cushionBucketCount: number;
    readonly groupCount: number;
    readonly groupIndex: number;
    readonly idleKeyRadix: number;
}

type SerializableFundedConfig = Omit<FundedStateValueConfig, 'plan'> & {
    readonly planId: PlanId;
    readonly planOptIns: PlanOptIns;
};

const registryPlanOptIns = new WeakMap<Plan, PlanOptIns>();

const firmsRegistryCache: {
    module: null | typeof FirmsModule;
    warmPromise: null | Promise<Error | null>;
} = { module: null, warmPromise: null };

export function candidateTrades(
    context: CandidateTradeContext,
    affordable: AffordableRoom,
    contractLimit: ContractCount | null,
): readonly SizedTrade[] {
    let byRoom = context.candidateTradesCache.get(affordable.kind);
    if (byRoom === undefined) {
        byRoom = new Map();
        context.candidateTradesCache.set(affordable.kind, byRoom);
    }
    let byContractLimit = byRoom.get(affordable.room);
    if (byContractLimit === undefined) {
        byContractLimit = new Map();
        byRoom.set(affordable.room, byContractLimit);
    }
    const contractLimitKey = contractLimit ?? -1;
    const cached = byContractLimit.get(contractLimitKey);
    if (cached !== undefined) return cached;
    const computed = computeCandidateTrades(context, affordable, contractLimit);
    byContractLimit.set(contractLimitKey, computed);
    return computed;
}

export function computeCandidateTrades(
    context: Omit<CandidateTradeContext, 'candidateTradesCache'>,
    affordable: AffordableRoom,
    contractLimit: ContractCount | null,
): SizedTrade[] {
    const { positionSizing, rungSizing } = context;
    const maxAction = Math.max(0, ...context.actionGrid);
    const tradesByRisk = new Map<number, SizedTrade>();
    const addTrade = (trade: SizedTrade): void => {
        const risk = Math.max(0, trade.risk);
        if (!tradesByRisk.has(risk)) {
            tradesByRisk.set(risk, { rewardRisk: trade.rewardRisk, risk });
        }
    };
    for (const action of context.actionGrid) {
        if (positionSizing === null) {
            const risk = resolveTradeRisk(action, affordable.room, rungSizing);
            addTrade({ rewardRisk: risk, risk });
            continue;
        }
        const trade = placeWholeContractTrade({
            intendedRisk: action,
            maxContracts: contractLimit,
            positionSizing,
            room: affordable.room,
            roomKind: affordable.kind,
            rungSizing,
        });
        if (trade.rewardRisk <= maxAction) addTrade(trade);
    }
    addTrade({ rewardRisk: 0, risk: 0 });
    return tradesByRisk.values().toArray();
}

export function defaultPayoutRegimeCap(plan: Plan): number {
    return Math.max(
        DEFAULT_PAYOUT_REGIME_CAP,
        plan.maxLifetimePayouts ?? 0,
        plan.payoutLadder?.steps.length ?? 0,
        plan.payoutSplit.stationaryFromPayoutIndex,
    );
}

export function findRegistryPlanId(plan: Plan): null | PlanId {
    return registryPlanOptIns.has(plan) || isRegistryPlan(plan)
        ? plan.id
        : null;
}

export function fundedCalendarWeekInactivityDpGap(plan: Plan): null | string {
    const rule = plan.calendarWeekInactivityFor(TradingPhase.Funded);
    return rule === null
        ? null
        : `${plan.label} closes its funded phase for an empty ${rule.sessionsPerWeek}-session calendar week, which this exact DP does not model (it tracks only Plan.maxConsecutiveIdleDays as a rolling idle-day count): a nonzero idle-day probability closes zero accounts here for inactivity`;
}

export function sweepToConvergence(options: SweepToConvergenceOptions): number {
    const {
        extrapolate,
        isMaxIterationsExplicit,
        maxIterations,
        monitor,
        sweep,
    } = options;
    const sweepCap = (): number =>
        isMaxIterationsExplicit
            ? maxIterations
            : Math.max(maxIterations, monitor.plainSweepDeadline);
    let sweeps = 0;
    while (sweeps < sweepCap()) {
        const step = monitor.record(sweep());
        sweeps++;
        if (step.verdict === SweepVerdict.Converged) break;
        if (step.verdict === SweepVerdict.Extrapolate && sweeps < sweepCap()) {
            extrapolate(step.extrapolationFactor);
        }
    }
    return sweeps;
}

export async function warmFirmsRegistryCache(): Promise<Error | null> {
    firmsRegistryCache.warmPromise ??= (async () => {
        try {
            firmsRegistryCache.module =
                await import('~/lib/prop-calculator/firms');
            return null;
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    })();
    return firmsRegistryCache.warmPromise;
}

export function withRegistryPlanOptIns(plan: Plan, optIns: PlanOptIns): Plan {
    const optedIn = withPlanOptIns(plan, optIns);
    if (optedIn !== plan && isRegistryPlan(plan)) {
        registryPlanOptIns.set(optedIn, optIns);
    }
    return optedIn;
}

function assertFundedCycleSnapshotCounts(
    plan: Plan,
    fundedCycle: FundedCycleSnapshot,
): void {
    for (const [noun, count] of [
        ['reset count', fundedCycle.fundedResetsUsed],
        ['payout count', fundedCycle.payoutsIssued],
        ['day gate progress', fundedCycle.dayGateProgress],
    ] as const) {
        if (!(Number.isSafeInteger(count) && count >= 0)) {
            throw new Error(
                `${plan.label}: FundedStateValue computeRisk needs a non-negative integer ${noun}, got ${count}`,
            );
        }
    }
}

function breachOutcome(
    context: FundedSolveContext,
    regime: number,
): FundedDayCloseOutcome {
    return regime === 0
        ? {
              cash: 0,
              continuationKey: BREACH_BEFORE_FIRST_PAYOUT_KEY,
              continuationOffsetUpperKey: BREACH_BEFORE_FIRST_PAYOUT_KEY,
              continuationOffsetUpperWeight: 0,
              continuationUpperWeight: 0,
              horizonCredit: 0,
          }
        : terminalOutcome(context.bustTerminalValue);
}

function breachValue(context: FundedSolveContext, regime: number): number {
    return regime === 0
        ? context.breachValueBeforeFirstPayout
        : context.bustTerminalValue;
}

function bucketIndex(
    context: FundedSolveContext,
    dollarsValue: number,
    bucketCount: number,
): number {
    return context.cushionGrid.floorIndex(dollarsValue, bucketCount);
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
    const payoutRequestSize = config.payoutRequestSize;
    if (
        payoutRequestSize !== undefined &&
        !(Number.isFinite(payoutRequestSize) && payoutRequestSize > 0)
    ) {
        throw new Error(
            `${plan.label}: payoutRequestSize must be a finite number > 0, got ${payoutRequestSize}`,
        );
    }
    const payoutRequestPolicy = config.payoutRequestPolicy;
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
    const payoutRegimeCap = resolvePayoutRegimeCap(
        plan,
        config.payoutRegimeCap ?? defaultPayoutRegimeCap(plan),
    );
    const fundedResetLayerCount = fundedResetLayerCountOf(
        plan,
        payoutRegimeCap,
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

    const lockedFineCushionBucketCount =
        Math.max(
            1,
            Math.round(
                (maxCushionMultiple * drawdownAmount) / cushionStepDollars,
            ),
        ) + 1;
    const tailCushionStepMultiple =
        config.tailCushionStepMultiple ?? DEFAULT_TAIL_CUSHION_STEP_MULTIPLE;
    const tailCushionStepDollars = tailCushionStepMultiple * drawdownAmount;
    const maxTailCushionMultiple = Math.max(
        maxCushionMultiple,
        config.maxTailCushionMultiple ?? DEFAULT_MAX_TAIL_CUSHION_MULTIPLE,
    );
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
    const cushionGridFineTop =
        (Math.max(
            lockedFineCushionBucketCount,
            unlockedWorkingBucketCount,
            offsetBucketCount,
        ) -
            1) *
        cushionStepDollars;
    const cushionGridTailTop = Math.max(
        cushionGridFineTop,
        maxTailCushionMultiple * drawdownAmount,
    );
    const cushionGrid = new FundedCushionGrid({
        fineStep: cushionStepDollars,
        fineTop: cushionGridFineTop,
        tailStep: tailCushionStepDollars,
        tailTop: cushionGridTailTop,
    });
    const lockedCushionBucketCount =
        cushionGrid.roundToIndex(
            Math.max(
                (lockedFineCushionBucketCount - 1) * cushionStepDollars,
                maxTailCushionMultiple * drawdownAmount,
            ),
        ) + 1;

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
        payoutRequestSize === undefined &&
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
              maxTailCushionMultiple * drawdownAmount -
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
    const lockedTopDollars = cushionGrid.dollarsAt(
        lockedCushionBucketCount - 1,
    );
    const unlockedWorkingTopDollars = cushionGrid.dollarsAt(
        unlockedWorkingBucketCount - 1,
    );
    const maxDayCloseBalance = Math.max(
        lockedThreshold + lockedTopDollars + maxWinDollars,
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
    const maxCycleProfit = maxDayCloseBalance - minCycleBaselineBalance;
    const cycleBestDayGrid = new FundedCycleBestDayGrid({
        cushionStepDollars,
        overflowDollars: maxBestDayShare * maxCycleProfit + cushionStepDollars,
        relevantBestDayDollars: isTrackingFundedConsistency
            ? Math.min(
                  Math.max(lockedTopDollars, unlockedWorkingTopDollars) +
                      maxWinDollars,
                  maxBestDayShare * maxCycleProfit,
                  maxDailySwingDollars + slots * cushionStepDollars,
              )
            : 0,
        requestedBucketCount: isTrackingFundedConsistency
            ? config.cycleBestDayBucketCount
            : 1,
    });

    const regimeKeyRadix = payoutRegimeCap + 1;
    const idleKeyRadix = idleDaysBucketCount;
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
            cycleBestDayGrid.keyRadix *
            qualifyingDayKeyRadix *
            peakRatchet.radix,
        payoutRegimeCap,
        unlockedCushionBucketCount,
    });

    return {
        actionGrid,
        breachValueBeforeFirstPayout: bustTerminalValue,
        bustTerminalValue,
        candidateTradesCache: new Map(),
        commission,
        cushionGrid,
        cushionStepDollars,
        cycleBaselineGrid,
        cycleBestDayGrid,
        dayCost,
        daySkeletons: {
            closeCellCount: 0,
            levelKey: null,
            skeletons: new Map(),
        },
        drawdown,
        freshStartHorizonCredit: freshStartHorizonCreditOf(
            plan,
            retainedCushion,
            payoutRequestSize,
        ),
        fundedResetFee:
            plan.fundedReset === null
                ? 0
                : fundedResetFee(plan.fundedReset, config.discounts),
        fundedResetLayerCount,
        horizonHazard,
        idleCloses: { cells: null, levelKey: null },
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
        payoutRequestPolicy,
        payoutRequestSize,
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

function cachedCellValue(
    scope: FundedDaySolveScope,
    cells: FundedDayCloseCells | null,
    cell: number,
    wasIdleToday: boolean,
): number {
    const { context } = scope;
    if (cells === null) {
        const outcome = cellOutcome(scope, cell, wasIdleToday);
        return dayCloseValue(
            context,
            outcome.cash,
            outcome.continuationKey,
            outcome.continuationUpperWeight,
            outcome.continuationOffsetUpperKey,
            outcome.continuationOffsetUpperWeight,
            outcome.horizonCredit,
        );
    }
    let continuationKeyValue = cells.keys[cell] ?? UNCOMPUTED_CONTINUATION_KEY;
    if (continuationKeyValue === UNCOMPUTED_CONTINUATION_KEY) {
        const outcome = cellOutcome(scope, cell, wasIdleToday);
        cells.cash[cell] = outcome.cash;
        cells.credit[cell] = outcome.horizonCredit;
        cells.keys[cell] = outcome.continuationKey;
        cells.offsetUpperKeys[cell] = outcome.continuationOffsetUpperKey;
        cells.offsetUpperWeights[cell] = outcome.continuationOffsetUpperWeight;
        cells.weights[cell] = outcome.continuationUpperWeight;
        continuationKeyValue = outcome.continuationKey;
    }
    return dayCloseValue(
        context,
        cells.cash[cell] ?? 0,
        continuationKeyValue,
        cells.weights[cell] ?? 0,
        cells.offsetUpperKeys[cell] ?? 0,
        cells.offsetUpperWeights[cell] ?? 0,
        cells.credit[cell] ?? 0,
    );
}

function cachedIdleClose(
    cells: FundedDayCloseCells | null,
    offset: number,
    compute: () => FundedDayCloseOutcome,
): FundedDayCloseOutcome {
    if (cells === null) return compute();
    const cachedKey = cells.keys[offset] ?? UNCOMPUTED_CONTINUATION_KEY;
    if (cachedKey !== UNCOMPUTED_CONTINUATION_KEY) {
        return {
            cash: cells.cash[offset] ?? 0,
            continuationKey: cachedKey,
            continuationOffsetUpperKey: cells.offsetUpperKeys[offset] ?? 0,
            continuationOffsetUpperWeight:
                cells.offsetUpperWeights[offset] ?? 0,
            continuationUpperWeight: cells.weights[offset] ?? 0,
            horizonCredit: cells.credit[offset] ?? 0,
        };
    }
    const outcome = compute();
    cells.cash[offset] = outcome.cash;
    cells.credit[offset] = outcome.horizonCredit;
    cells.keys[offset] = outcome.continuationKey;
    cells.offsetUpperKeys[offset] = outcome.continuationOffsetUpperKey;
    cells.offsetUpperWeights[offset] = outcome.continuationOffsetUpperWeight;
    cells.weights[offset] = outcome.continuationUpperWeight;
    return outcome;
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

function cellOutcome(
    scope: FundedDaySolveScope,
    cell: number,
    wasIdleToday: boolean,
): FundedDayCloseOutcome {
    const reach = Math.floor(cell / scope.workingBucketCount);
    return dayCloseOutcome(
        scope.context,
        scope.dayStart,
        scope.context.cushionGrid.dollarsAt(
            cell - reach * scope.workingBucketCount,
        ),
        wasIdleToday,
        reach,
    );
}

function chargeDayCloseCells(
    context: FundedSolveContext,
    cellCount: number,
): void {
    context.daySkeletons.closeCellCount += cellCount;
}

function clearSolveCaches(context: FundedSolveContext): void {
    context.daySkeletons.skeletons.clear();
    context.daySkeletons.levelKey = null;
    context.daySkeletons.closeCellCount = 0;
    context.idleCloses.cells = null;
    context.idleCloses.levelKey = null;
}

function continuationKey(
    context: FundedSolveContext,
    state: AccountState,
    regime: number,
    pair: FundedPair,
): FundedContinuationSplit {
    const cushion = state.balance - state.threshold;
    if (state.thresholdLocked) {
        const split = splitOntoCushionGrid(
            cushion,
            context.cushionGrid,
            context.lockedCushionBucketCount,
        );
        const key = lockedKey(context, regime, pair, split.lowerIndex);
        return {
            lowerKey: key,
            offsetUpperKey: key,
            offsetUpperWeight: 0,
            upperWeight: split.upperWeight,
        };
    }
    const cushionSplit = splitOntoCushionGrid(
        cushion,
        context.cushionGrid,
        context.unlockedCushionBucketCount,
    );
    const offsetSplit = splitOntoCushionGrid(
        state.threshold - context.initialThreshold,
        context.cushionGrid,
        context.offsetBucketCount,
    );
    const lowerKey = unlockedKey(
        context,
        offsetSplit.lowerIndex,
        regime,
        pair,
        cushionSplit.lowerIndex,
    );
    return {
        lowerKey,
        offsetUpperKey:
            offsetSplit.upperWeight === 0
                ? lowerKey
                : unlockedKey(
                      context,
                      offsetSplit.lowerIndex + 1,
                      regime,
                      pair,
                      cushionSplit.lowerIndex,
                  ),
        offsetUpperWeight: offsetSplit.upperWeight,
        upperWeight: cushionSplit.upperWeight,
    };
}

function continuedValue(
    context: FundedSolveContext,
    cash: number,
    continuation: number,
    horizonCredit: number,
): number {
    return context.horizonHazard === 0
        ? cash + continuation
        : cash +
              (1 - context.horizonHazard) * continuation +
              context.horizonHazard * horizonCredit;
}

function contractionSweepCap(
    firstSweepMaxDelta: number,
    convergenceTolerance: number,
    contraction: number,
): number {
    if (
        !Number.isFinite(firstSweepMaxDelta) ||
        !Number.isFinite(convergenceTolerance) ||
        convergenceTolerance <= 0 ||
        contraction <= 0 ||
        contraction >= 1
    ) {
        return 1;
    }
    const firstErrorBound =
        (contraction / (1 - contraction)) * firstSweepMaxDelta;
    return firstErrorBound <= convergenceTolerance
        ? 1
        : 1 +
              Math.ceil(
                  Math.log(convergenceTolerance / firstErrorBound) /
                      Math.log(contraction),
              );
}

function createFundedWorkerSolver(init: FundedWorkerInit): FundedWorkerSolver {
    const { planId, planOptIns, ...settings } = init.config;
    const config: FundedStateValueConfig = {
        ...settings,
        plan: withPlanOptIns(reconstructPlanFromRegistry(planId), planOptIns),
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
    const results = new Float64Array(init.resultsSAB);
    return {
        context,
        solve: (dispatch) => {
            context.breachValueBeforeFirstPayout =
                dispatch.breachValueBeforeFirstPayout;
            const level: FundedLevel = {
                isLocked: dispatch.isLockedAtStart,
                regime: dispatch.regimeAtStart,
                thresholdDollars: dispatch.thresholdDollars,
            };
            for (const groupIndex of dispatch.groupIndices) {
                solveIdleGroup(
                    context,
                    level,
                    groupIndex,
                    dispatch.cushionBucketCount,
                    dispatch.workingBucketCount,
                    results,
                );
            }
        },
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

function cycleBaselineRoundingOf(
    context: FundedSolveContext,
): FundedCycleBaselineRounding | null {
    const isBaselineTracked = Array.from(
        { length: context.payoutRegimeCap },
        (_, index) => index + 1,
    ).some(
        (regime) =>
            !isLevelSkipped(context, regime, true) ||
            !isLevelSkipped(context, regime, false),
    );
    if (!isBaselineTracked) return null;
    const grid = context.cycleBaselineGrid;
    const topDollars = grid.dollarsAt(grid.size - 1);
    for (let index = 1; index < grid.size; index++) {
        const coarseFromDollars = grid.dollarsAt(index - 1);
        const coarseStepDollars = grid.dollarsAt(index) - coarseFromDollars;
        if (coarseStepDollars > context.cushionStepDollars + BUCKET_EPSILON) {
            return { coarseFromDollars, coarseStepDollars, topDollars };
        }
    }
    return null;
}

function cycleBestDayIndex(
    context: FundedSolveContext,
    dollarsValue: number,
): number {
    return context.cycleBestDayGrid.indexAtOrAbove(dollarsValue);
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
        return breachOutcome(context, dayStart.regime);
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

    const cycleBestDayAtStartDollars = context.cycleBestDayGrid.dollarsAt(
        dayStart.cycleBestDay,
    );
    const cycleBestDayAtEndDollars = Math.max(
        cycleBestDayAtStartDollars,
        todayPnL,
    );
    const cycleBestDayAtEndIndex = cycleBestDayIndex(
        context,
        cycleBestDayAtEndDollars,
    );

    if (
        plan.payoutDayGateBasis ===
        PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
    ) {
        state.consecutiveIdleDays = wasIdleToday ? 1 : 0;
    }
    const tracker = restoreFundedCycleTracker(state, {
        calendarDayGateProgress: dayStart.qualifyingDays,
        cumulativePayout: 0,
        cycleBestDayProfit: cycleBestDayAtEndDollars,
        fundedResetsUsed: 0,
        lastPayoutBalance:
            dayStart.regime === 0
                ? context.startingBalance
                : context.lockedPayoutFloor +
                  context.cycleBaselineGrid.dollarsAt(dayStart.cycleBaseline),
        payoutsIssued: dayStart.regime,
        qualifyingDaysAtLastPayout: 0,
    });

    tracker.recordSessionClose(state);
    const payout = tracker.tryPayout({
        minRetainedCushion: context.retainedCushion,
        payoutRequestPolicy: context.payoutRequestPolicy,
        payoutRequestSize: context.payoutRequestSize,
        plan,
        state,
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
        continuationKey: nextKey.lowerKey,
        continuationOffsetUpperKey: nextKey.offsetUpperKey,
        continuationOffsetUpperWeight: nextKey.offsetUpperWeight,
        continuationUpperWeight: nextKey.upperWeight,
        horizonCredit:
            context.horizonHazard === 0
                ? 0
                : tracker.closeoutCredit({
                      minRetainedCushion: context.retainedCushion,
                      payoutRequestSize: context.payoutRequestSize,
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
    const chargedCellCount = CACHED_TABLE_OVERHEAD_CELL_COST + cellCount;
    if (!hasDayCloseBudget(context, chargedCellCount)) return null;
    chargeDayCloseCells(context, chargedCellCount);
    const table: FundedDayCloseTable = {
        idleCells: null,
        idleEntries: new Map(),
        lockouts: new Map(),
        stops: newDayCloseCells(cellCount),
    };
    skeleton.closeTables.set(tableKey, table);
    return table;
}

function dayCloseValue(
    context: FundedSolveContext,
    cash: number,
    continuationKeyValue: number,
    continuationUpperWeight: number,
    continuationOffsetUpperKey: number,
    continuationOffsetUpperWeight: number,
    horizonCredit: number,
): number {
    switch (continuationKeyValue) {
        case BREACH_BEFORE_FIRST_PAYOUT_KEY: {
            return cash + context.breachValueBeforeFirstPayout;
        }
        case TERMINAL_CONTINUATION_KEY: {
            return cash;
        }
        default: {
            const lowerOffsetValue = valueOnCushionGrid(
                {
                    lowerIndex: continuationKeyValue,
                    upperWeight: continuationUpperWeight,
                },
                (key) => context.readValue(key),
            );
            const continuation =
                continuationOffsetUpperWeight === 0
                    ? lowerOffsetValue
                    : (1 - continuationOffsetUpperWeight) * lowerOffsetValue +
                      continuationOffsetUpperWeight *
                          valueOnCushionGrid(
                              {
                                  lowerIndex: continuationOffsetUpperKey,
                                  upperWeight: continuationUpperWeight,
                              },
                              (key) => context.readValue(key),
                          );
            return continuedValue(context, cash, continuation, horizonCredit);
        }
    }
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
        rows: [],
        tradesByIndex: [],
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
        cycleBestDay: withoutQualifyingDays % context.cycleBestDayGrid.keyRadix,
        idleDays: Math.floor(
            withoutQualifyingDays / context.cycleBestDayGrid.keyRadix,
        ),
        qualifyingDays,
        ratchet,
    };
}

function exactOutcome(outcome: number): FundedTradeOutcome {
    return { outcome, upperWeight: 0 };
}

function freshStartHorizonCreditOf(
    plan: Plan,
    retainedCushion: number,
    payoutRequestSize: Dollars | undefined,
): number {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return newFundedCycleTracker(state).closeoutCredit({
        minRetainedCushion: retainedCushion,
        payoutRequestSize,
        plan,
        state,
    });
}

function fundedResetLayerCountOf(plan: Plan, payoutRegimeCap: number): number {
    for (
        let payoutsIssued = 1;
        payoutsIssued <= Math.max(1, payoutRegimeCap);
        payoutsIssued++
    ) {
        if (
            canTakeFundedReset(plan, {
                closedForInactivity: false,
                payoutsIssued,
                resetsUsed: 0,
            })
        ) {
            throw new Error(
                `${plan.label}: FundedStateValue models a funded reset only before the first payout, but this plan allows one after ${payoutsIssued} payout(s)`,
            );
        }
    }
    return fundedResetsBeforeFirstPayout(plan);
}

function groupCountAt(context: FundedSolveContext, regime: number): number {
    return (
        context.cycleBestDayGrid.keyRadix *
        context.qualifyingDayKeyRadix *
        context.peakRatchet.radix *
        cycleBaselineRadixAt(context, regime)
    );
}

function hasDayCloseBudget(
    context: FundedSolveContext,
    cellCount: number,
): boolean {
    return (
        context.daySkeletons.closeCellCount + cellCount <=
        MAX_CACHED_DAY_CLOSE_CELLS
    );
}

function highestReachWithin(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    reachCount: number,
    highestCushionDollars: number,
): number {
    return context.peakRatchet.isIntraday
        ? Math.min(
              reachCount - 1,
              context.peakRatchet.raise(
                  dayStart.ratchet,
                  dayStart.thresholdDollars +
                      highestCushionDollars -
                      context.startingBalance,
              ) - dayStart.ratchet,
          )
        : reachCount - 1;
}

function idleCloseCellsFor(
    context: FundedSolveContext,
    level: FundedLevel,
    stateCount: number,
): FundedDayCloseCells | null {
    if (stateCount > MAX_CACHED_IDLE_CLOSE_CELLS) return null;
    const cache = context.idleCloses;
    const levelKey = `${level.isLocked}:${level.thresholdDollars}:${level.regime}`;
    if (cache.cells === null || cache.cells.keys.length < stateCount) {
        cache.cells = newDayCloseCells(
            Math.min(MAX_CACHED_IDLE_CLOSE_CELLS, maxLevelStateCount(context)),
        );
    } else if (cache.levelKey !== levelKey) {
        cache.cells.keys.fill(UNCOMPUTED_CONTINUATION_KEY, 0, stateCount);
    }
    cache.levelKey = levelKey;
    return cache.cells;
}

function initialStateKey(context: FundedSolveContext): number {
    return unlockedKey(
        context,
        0,
        0,
        {
            cycleBaseline: 0,
            cycleBestDay: 0,
            idleDays: 0,
            qualifyingDays: 0,
            ratchet: 0,
        },
        bucketIndex(
            context,
            context.drawdown.amount,
            context.unlockedCushionBucketCount,
        ),
    );
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

function isRegistryPlan(plan: Plan): boolean {
    void warmFirmsRegistryCache();
    return (
        firmsRegistryCache.module
            ?.findFirm(plan.id.firm)
            ?.plans.includes(plan) === true
    );
}

function isSolvedEarlierInGroup(
    continuationOffset: number,
    ownOffset: number,
    group: IdleGroupShape,
): boolean {
    const { cushionBucketCount, groupCount, groupIndex } = group;
    const continuationPair = Math.floor(
        continuationOffset / cushionBucketCount,
    );
    if (continuationPair % groupCount !== groupIndex) return false;
    const solveOrder = (offset: number): number => {
        const pairIndex = Math.floor(offset / cushionBucketCount);
        const idleDays = Math.floor(pairIndex / groupCount);
        return (
            (group.idleKeyRadix - 1 - idleDays) * cushionBucketCount +
            (offset - pairIndex * cushionBucketCount)
        );
    };
    return solveOrder(continuationOffset) < solveOrder(ownOffset);
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

function levelBaseKey(context: FundedSolveContext, level: FundedLevel): number {
    if (level.isLocked) {
        return levelBase(
            context,
            context.keyLayout.lockedLevelBases[level.regime],
            level.regime,
            true,
        );
    }
    const offsetIndex = context.cushionGrid.roundToIndex(
        level.thresholdDollars - context.initialThreshold,
    );
    return levelBase(
        context,
        context.keyLayout.unlockedLevelBases[
            offsetIndex * context.regimeKeyRadix + level.regime
        ],
        level.regime,
        false,
    );
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

function maxGroupCount(context: FundedSolveContext): number {
    return groupCountAt(context, Math.min(1, context.payoutRegimeCap));
}

function maxLevelStateCount(context: FundedSolveContext): number {
    return (
        maxGroupCount(context) *
        context.idleKeyRadix *
        Math.max(
            context.lockedCushionBucketCount,
            context.unlockedCushionBucketCount,
        )
    );
}

function newDayCloseCells(cellCount: number): FundedDayCloseCells {
    return {
        cash: new Float64Array(cellCount),
        credit: new Float64Array(cellCount),
        keys: new Int32Array(cellCount).fill(UNCOMPUTED_CONTINUATION_KEY),
        offsetUpperKeys: new Int32Array(cellCount),
        offsetUpperWeights: new Float64Array(cellCount),
        weights: new Float64Array(cellCount),
    };
}

function outcomeDayCloseValue(
    scope: FundedDaySolveScope,
    store: Map<number, FundedDayCloseOutcome> | undefined,
    outcomeId: number,
    cushionAtEnd: number,
    wasIdleToday: boolean,
    reach: number,
): number {
    let outcome = store?.get(outcomeId);
    if (outcome === undefined) {
        outcome = dayCloseOutcome(
            scope.context,
            scope.dayStart,
            cushionAtEnd,
            wasIdleToday,
            reach,
        );
        if (
            store !== undefined &&
            hasDayCloseBudget(scope.context, CACHED_MAP_ENTRY_CELL_COST)
        ) {
            chargeDayCloseCells(scope.context, CACHED_MAP_ENTRY_CELL_COST);
            store.set(outcomeId, outcome);
        }
    }
    return dayCloseValue(
        scope.context,
        outcome.cash,
        outcome.continuationKey,
        outcome.continuationUpperWeight,
        outcome.continuationOffsetUpperKey,
        outcome.continuationOffsetUpperWeight,
        outcome.horizonCredit,
    );
}

function pairOrdinal(
    context: FundedSolveContext,
    regime: number,
    pair: FundedPair,
): number {
    const withCycleBestDay =
        pair.idleDays * context.cycleBestDayGrid.keyRadix + pair.cycleBestDay;
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

function regimeZeroRanges(context: FundedSolveContext): FundedValueRange[] {
    const levels: { cushionBucketCount: number; level: FundedLevel }[] = [
        {
            cushionBucketCount: context.lockedCushionBucketCount,
            level: {
                isLocked: true,
                regime: 0,
                thresholdDollars: context.lockedThreshold,
            },
        },
        ...Array.from({ length: context.offsetBucketCount }, (_, offset) => ({
            cushionBucketCount: context.unlockedCushionBucketCount,
            level: {
                isLocked: false,
                regime: 0,
                thresholdDollars:
                    context.initialThreshold +
                    context.cushionGrid.dollarsAt(offset),
            },
        })),
    ];
    let copyOffset = 0;
    return levels
        .map(({ cushionBucketCount, level }) => {
            const length =
                groupCountAt(context, 0) *
                context.idleKeyRadix *
                cushionBucketCount;
            const range = {
                base: levelBaseKey(context, level),
                copyOffset,
                length,
            };
            copyOffset += length;
            return range;
        })
        .toSorted((a, b) => a.base - b.base);
}

function regimeZeroValuesOf(
    context: FundedSolveContext,
    values: Float64Array,
): Float64Array {
    const ranges = regimeZeroRanges(context);
    const copy = new Float64Array(
        ranges.reduce((total, range) => total + range.length, 0),
    );
    for (const range of ranges) {
        copy.set(
            values.subarray(range.base, range.base + range.length),
            range.copyOffset,
        );
    }
    return copy;
}

function requireFirmsModule(): typeof FirmsModule {
    return tsxRequire('../firms', import.meta.url) as typeof FirmsModule;
}

function resetLayerContext(
    context: FundedSolveContext,
    values: Float64Array,
    resetLayer: FundedResetLayer,
): FundedSolveContext {
    const ranges = regimeZeroRanges(context);
    const { regimeZeroValues } = resetLayer;
    return {
        ...context,
        breachValueBeforeFirstPayout: resetLayer.breachValueBeforeFirstPayout,
        readValue: (key) => {
            const range = valueRangeContaining(ranges, key);
            return range === null
                ? (values[key] ?? 0)
                : (regimeZeroValues[range.copyOffset + key - range.base] ?? 0);
        },
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

function resolvePayoutRegimeCap(plan: Plan, payoutRegimeCap: number): number {
    if (!Number.isSafeInteger(payoutRegimeCap) || payoutRegimeCap < 0) {
        throw new Error(
            `${plan.label}: payoutRegimeCap must be a non-negative safe integer, got ${payoutRegimeCap}`,
        );
    }
    if (payoutRegimeCap > 0) return payoutRegimeCap;
    const conflict =
        plan.payoutDayGateBasis ===
        PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
            ? 'its calendar payout day gate restarts at each payout, and a regime cap of 0 would restore the post-payout gate progress as if no payout had happened'
            : plan.takesOneTimeEarlyWithdrawal
              ? 'it takes the one-time early withdrawal, which a regime cap of 0 would let the trader take again after every payout'
              : fundedResetsBeforeFirstPayout(plan) > 0
                ? 'it takes a funded reset, allowed only before the first payout, and a regime cap of 0 cannot tell a breach before the first payout from one after it'
                : null;
    if (conflict !== null) {
        throw new Error(
            `${plan.label}: payoutRegimeCap 0 is not allowed here: ${conflict}. Use a payoutRegimeCap of at least 1.`,
        );
    }
    return payoutRegimeCap;
}

function riskAtExactCushion(
    policyDay: FundedPolicyDay,
    reach: number,
    cushionDollars: number,
    tradeIndex: number,
): number {
    const { idleValues, nextTables, risks, scope } = policyDay;
    const nextTable = nextTables[tradeIndex];
    if (
        nextTable === undefined ||
        reach < 0 ||
        reach >= scope.skeleton.reachCount
    ) {
        return 0;
    }
    const riskKey = `${tradeIndex}:${reach}:${cushionDollars}`;
    const cached = risks.get(riskKey);
    if (cached !== undefined) return cached;
    const { context, dayStart, skeleton, workingBucketCount } = scope;
    const rowOffset = reach * workingBucketCount;
    const split = splitOntoCushionGrid(
        cushionDollars,
        context.cushionGrid,
        workingBucketCount,
    );
    const outcomeValue = (pnl: number): number => {
        const { outcome, upperWeight } = tradeOutcome(
            context,
            skeleton,
            dayStart,
            cushionDollars + pnl,
            reach,
        );
        return scopedOutcomeValue(scope, nextTable, outcome, upperWeight);
    };
    let bestValue = -Infinity;
    let bestAction = 0;
    for (const { rewardRisk, risk } of tradesAtCushion(
        context,
        dayStart,
        cushionDollars,
    )) {
        const value =
            risk <= 0
                ? valueOnCushionGrid(split, (index) =>
                      tradeIndex === 0
                          ? (idleValues[rowOffset + index] ?? 0)
                          : scopedStopValue(scope, rowOffset + index),
                  )
                : context.winrate *
                      outcomeValue(
                          context.rrRatio * rewardRisk - context.commission,
                      ) +
                  (1 - context.winrate) *
                      outcomeValue(-risk - context.commission);
        if (value <= bestValue) continue;
        bestValue = value;
        bestAction = risk;
    }
    risks.set(riskKey, bestAction);
    return bestAction;
}

function runFundedWorkerBootstrap(): void {
    const init = workerData as FundedWorkerInit;
    const flags = new Int32Array(init.flagsSAB);
    let solver = tryCreateFundedWorkerSolver(init);
    parentPort?.on('message', (message: FundedWorkerMessage) => {
        runAndSignal(flags, init.workerIndex, init.errorPort, () => {
            switch (message.kind) {
                case FundedWorkerMessageKind.Configure: {
                    if (!(solver instanceof Error)) {
                        clearSolveCaches(solver.context);
                    }
                    solver = tryCreateFundedWorkerSolver({
                        ...init,
                        config: message.config,
                        snapshotSAB: message.snapshotSAB,
                    });
                    if (solver instanceof Error) throw solver;
                    return;
                }
                case FundedWorkerMessageKind.Solve: {
                    if (solver instanceof Error) throw solver;
                    solver.solve(message);
                    return;
                }
            }
        });
    });
}

function scopedIdleValue(
    scope: FundedDaySolveScope,
    reach: number,
    index: number,
): number {
    const { closeTable, context } = scope;
    const cell = reach * scope.workingBucketCount + index;
    if (closeTable === null) return cachedCellValue(scope, null, cell, true);
    if (context.isSolvingPerDayStart) {
        return outcomeDayCloseValue(
            scope,
            closeTable.idleEntries,
            cell,
            context.cushionGrid.dollarsAt(index),
            true,
            reach,
        );
    }
    if (
        closeTable.idleCells === null &&
        hasDayCloseBudget(context, scope.cellCount)
    ) {
        chargeDayCloseCells(context, scope.cellCount);
        closeTable.idleCells = newDayCloseCells(scope.cellCount);
    }
    return cachedCellValue(scope, closeTable.idleCells, cell, true);
}

function scopedLockoutValue(
    scope: FundedDaySolveScope,
    lockoutId: number,
): number {
    const memo = scope.lockoutValues[lockoutId];
    if (memo !== undefined) return memo;
    const lockout = scope.skeleton.lockouts[lockoutId];
    const value =
        lockout === undefined
            ? 0
            : outcomeDayCloseValue(
                  scope,
                  scope.closeTable?.lockouts,
                  lockoutId,
                  lockout.cushionAfter,
                  false,
                  lockout.reachAfter,
              );
    scope.lockoutValues[lockoutId] = value;
    return value;
}

function scopedOutcomeValue(
    scope: FundedDaySolveScope,
    nextTable: Float64Array | null,
    outcome: number,
    upperWeight: number,
): number {
    if (outcome >= 0) {
        return valueOnCushionGrid(
            { lowerIndex: outcome, upperWeight },
            (cell) =>
                nextTable === null
                    ? scopedStopValue(scope, cell)
                    : (nextTable[cell] ?? 0),
        );
    }
    return outcome === OUTCOME_BUST
        ? breachValue(scope.context, scope.dayStart.regime)
        : scopedLockoutValue(scope, OUTCOME_FIRST_LOCKOUT - outcome);
}

function scopedStopValue(scope: FundedDaySolveScope, cell: number): number {
    if (cell >= scope.cellCount) return 0;
    const memo = scope.stopValues[cell] ?? NaN;
    if (!Number.isNaN(memo)) return memo;
    const value = cachedCellValue(
        scope,
        scope.closeTable?.stops ?? null,
        cell,
        false,
    );
    scope.stopValues[cell] = value;
    return value;
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
    const cushionNow = context.cushionGrid.dollarsAt(index);
    const trades = skeletonTrades(context, skeleton, dayStart, index);
    const risks = trades.map((trade) => trade.risk);
    const wins = new Int32Array(trades.length);
    const winUpperWeights = new Float64Array(trades.length);
    const losses = new Int32Array(trades.length);
    const lossUpperWeights = new Float64Array(trades.length);
    for (const [riskIndex, { rewardRisk, risk }] of trades.entries()) {
        if (risk <= 0) continue;
        const pnlWin = context.rrRatio * rewardRisk - context.commission;
        const win = tradeOutcome(
            context,
            skeleton,
            dayStart,
            cushionNow + pnlWin,
            reach,
        );
        wins[riskIndex] = win.outcome;
        winUpperWeights[riskIndex] = win.upperWeight;
        const pnlLose = -risk - context.commission;
        const loss = tradeOutcome(
            context,
            skeleton,
            dayStart,
            cushionNow + pnlLose,
            reach,
        );
        losses[riskIndex] = loss.outcome;
        lossUpperWeights[riskIndex] = loss.upperWeight;
    }
    const row: FundedSkeletonRow = {
        losses,
        lossUpperWeights,
        risks,
        wins,
        winUpperWeights,
    };
    skeleton.rows[cell] = row;
    return row;
}

function skeletonTrades(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    index: number,
): readonly SizedTrade[] {
    const cached = skeleton.tradesByIndex[index];
    if (cached !== undefined) return cached;
    const trades = tradesAtCushion(
        context,
        dayStart,
        context.cushionGrid.dollarsAt(index),
    );
    skeleton.tradesByIndex[index] = trades;
    return trades;
}

function solveDayTreeOnce(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    workingBucketCount: number,
    purpose: FundedDayTreePurpose,
): {
    finalTable: Float64Array;
    nextTables: (Float64Array | null)[];
    scope: FundedDaySolveScope;
} {
    const isRecordingPolicy = purpose === FundedDayTreePurpose.Policy;
    const skeleton = daySkeletonFor(context, dayStart, workingBucketCount);
    const { cushionStepDollars, winrate } = context;
    const { reachCount } = skeleton;
    const cellCount = reachCount * workingBucketCount;
    const scope: FundedDaySolveScope = {
        cellCount,
        closeTable: dayCloseTableFor(context, skeleton, dayStart, cellCount),
        context,
        dayStart,
        lockoutValues: [],
        skeleton,
        stopValues: new Float64Array(cellCount).fill(NaN),
        workingBucketCount,
    };

    const isWindowed = context.isSolvingPerDayStart && !isRecordingPolicy;
    const startIndex = context.cushionGrid.roundToIndex(
        dayStart.cushionAtDayStart,
    );
    const maxRisk = Math.max(0, ...context.actionGrid);
    const cellsUpPerTrade =
        Math.ceil((context.rrRatio * maxRisk) / cushionStepDollars) + 1;
    const cellsDownPerTrade =
        Math.ceil((maxRisk + context.commission) / cushionStepDollars) + 1;

    let nextTable: Float64Array | null = null;
    const nextTables: (Float64Array | null)[] = [];
    for (let tradeIndex = context.slots - 1; tradeIndex >= 0; tradeIndex--) {
        nextTables[tradeIndex] = nextTable;
        const lowIndex = isWindowed
            ? Math.max(0, startIndex - tradeIndex * cellsDownPerTrade)
            : 0;
        const highIndex = isWindowed
            ? Math.min(
                  workingBucketCount - 1,
                  startIndex + tradeIndex * cellsUpPerTrade,
              )
            : workingBucketCount - 1;
        const highestReach = isWindowed
            ? highestReachWithin(
                  context,
                  dayStart,
                  reachCount,
                  context.cushionGrid.dollarsAt(
                      Math.min(
                          context.cushionGrid.size - 1,
                          startIndex + tradeIndex * cellsUpPerTrade + 1,
                      ),
                  ),
              )
            : reachCount - 1;
        const currentTable = new Float64Array(cellCount);
        for (let reach = 0; reach <= highestReach; reach++) {
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
                for (const [riskIndex, risk] of row.risks.entries()) {
                    if (!isRecordingPolicy && tradeIndex === 0 && risk <= 0) {
                        continue;
                    }
                    const value =
                        risk <= 0
                            ? tradeIndex === 0
                                ? scopedIdleValue(scope, reach, index)
                                : scopedStopValue(scope, cell)
                            : winrate *
                                  scopedOutcomeValue(
                                      scope,
                                      nextTable,
                                      row.wins[riskIndex] ?? 0,
                                      row.winUpperWeights[riskIndex] ?? 0,
                                  ) +
                              (1 - winrate) *
                                  scopedOutcomeValue(
                                      scope,
                                      nextTable,
                                      row.losses[riskIndex] ?? 0,
                                      row.lossUpperWeights[riskIndex] ?? 0,
                                  );
                    if (value > bestValue) bestValue = value;
                }
                currentTable[cell] = bestValue;
            }
        }
        nextTable = currentTable;
    }
    return {
        finalTable: (nextTable ?? new Float64Array(cellCount)).subarray(
            0,
            workingBucketCount,
        ),
        nextTables,
        scope,
    };
}

function solveFundedLevels(
    config: FundedStateValueConfig,
    mainContext: FundedSolveContext,
    values: Float64Array,
    workers: FundedWorkerSession | null,
): FundedLevelSolve {
    const convergenceTolerance =
        config.convergenceTolerance ?? DEFAULT_CONVERGENCE_TOLERANCE;
    const isMaxIterationsPerLevelExplicit =
        config.maxIterationsPerLevel !== undefined;
    const maxIterationsPerLevel =
        config.maxIterationsPerLevel ?? DEFAULT_MAX_ITERATIONS_PER_LEVEL;
    const contraction = 1 - mainContext.horizonHazard;

    const {
        initialThreshold,
        lockedCushionBucketCount,
        lockedThreshold,
        offsetBucketCount,
        payoutRegimeCap,
        unlockedCushionBucketCount,
        unlockedWorkingBucketCount,
    } = mainContext;
    let unconvergedLevelCount = 0;
    let reachedStateCount = 0;
    let sweepCount = 0;
    let valueErrorBound = 0;
    const resetLayers = new Map<number, FundedResetLayer>();

    const workerPool =
        workers === null
            ? tryCreateWorkerPool(config, mainContext, values)
            : workers.poolFor(config, mainContext, values);
    const levelResults =
        workerPool?.results ??
        new Float64Array(maxLevelStateCount(mainContext));
    const levelDeltas = new Float64Array(levelResults.length);

    try {
        function sweepLevel(
            level: FundedLevel,
            cushionBucketCount: number,
            workingBucketCount: number,
        ): number {
            const groupCount = groupCountAt(mainContext, level.regime);
            if (workerPool !== null && groupCount >= MIN_PARALLEL_GROUP_COUNT) {
                workerPool.runGrid(
                    level,
                    groupCount,
                    cushionBucketCount,
                    workingBucketCount,
                    mainContext.breachValueBeforeFirstPayout,
                );
            } else {
                for (
                    let groupIndex = 0;
                    groupIndex < groupCount;
                    groupIndex++
                ) {
                    solveIdleGroup(
                        mainContext,
                        level,
                        groupIndex,
                        cushionBucketCount,
                        workingBucketCount,
                        levelResults,
                    );
                }
            }
            const levelKey = levelBaseKey(mainContext, level);
            const stateCount =
                groupCount * mainContext.idleKeyRadix * cushionBucketCount;
            let maxDelta = 0;
            for (let offset = 0; offset < stateCount; offset++) {
                const next = levelResults[offset] ?? 0;
                const delta = next - (values[levelKey + offset] ?? 0);
                levelDeltas[offset] = delta;
                maxDelta = Math.max(maxDelta, Math.abs(delta));
                values[levelKey + offset] = next;
            }
            return maxDelta;
        }

        function extrapolateLevel(
            level: FundedLevel,
            stateCount: number,
            factor: number,
        ): void {
            const levelKey = levelBaseKey(mainContext, level);
            for (let offset = 0; offset < stateCount; offset++) {
                values[levelKey + offset] =
                    (values[levelKey + offset] ?? 0) +
                    factor * (levelDeltas[offset] ?? 0);
            }
        }

        function solveLevelToConvergence(
            level: FundedLevel,
            cushionBucketCount: number,
            workingBucketCount: number,
            isColdStart: boolean,
        ): void {
            const stateCount =
                groupCountAt(mainContext, level.regime) *
                mainContext.idleKeyRadix *
                cushionBucketCount;
            if (isColdStart) {
                const levelKey = levelBaseKey(mainContext, level);
                values.fill(0, levelKey, levelKey + stateCount);
            }
            const monitor = new ValueIterationMonitor(
                contraction,
                convergenceTolerance,
            );
            const levelSweeps = sweepToConvergence({
                extrapolate: (factor) => {
                    extrapolateLevel(level, stateCount, factor);
                },
                isMaxIterationsExplicit: isMaxIterationsPerLevelExplicit,
                maxIterations: maxIterationsPerLevel,
                monitor,
                sweep: () =>
                    sweepLevel(level, cushionBucketCount, workingBucketCount),
            });
            sweepCount += levelSweeps;
            if (levelSweeps > 0) reachedStateCount += stateCount;
            if (!monitor.isConverged) unconvergedLevelCount++;
            valueErrorBound += monitor.errorBound;
        }

        function solveRegimes(
            isPreFirstPayout: boolean,
            isColdStart: boolean,
        ): void {
            const isSolved = (regime: number, isLocked: boolean): boolean =>
                (regime === 0) === isPreFirstPayout &&
                !isLevelSkipped(mainContext, regime, isLocked);
            for (let regime = payoutRegimeCap; regime >= 0; regime--) {
                if (!isSolved(regime, true)) continue;
                solveLevelToConvergence(
                    {
                        isLocked: true,
                        regime,
                        thresholdDollars: lockedThreshold,
                    },
                    lockedCushionBucketCount,
                    lockedCushionBucketCount,
                    isColdStart,
                );
            }
            for (
                let offsetIndex = offsetBucketCount - 1;
                offsetIndex >= 0;
                offsetIndex--
            ) {
                const thresholdDollars =
                    initialThreshold +
                    mainContext.cushionGrid.dollarsAt(offsetIndex);
                for (let regime = payoutRegimeCap; regime >= 0; regime--) {
                    if (!isSolved(regime, false)) continue;
                    solveLevelToConvergence(
                        { isLocked: false, regime, thresholdDollars },
                        unlockedCushionBucketCount,
                        unlockedWorkingBucketCount,
                        isColdStart,
                    );
                }
            }
        }

        solveRegimes(false, false);
        const topLayer = mainContext.fundedResetLayerCount;
        for (let layer = topLayer; layer >= 0; layer--) {
            if (layer < topLayer) {
                mainContext.breachValueBeforeFirstPayout = continuedValue(
                    mainContext,
                    -mainContext.fundedResetFee,
                    values[initialStateKey(mainContext)] ?? 0,
                    mainContext.freshStartHorizonCredit,
                );
            }
            solveRegimes(
                true,
                layer < topLayer && mainContext.horizonHazard === 0,
            );
            if (layer > 0) {
                resetLayers.set(layer, {
                    breachValueBeforeFirstPayout:
                        mainContext.breachValueBeforeFirstPayout,
                    regimeZeroValues: regimeZeroValuesOf(mainContext, values),
                });
            }
        }
    } finally {
        if (workers === null) workerPool?.terminate();
    }

    return {
        reachedStateCount,
        resetLayers,
        sweepCount,
        unconvergedLevelCount,
        valueErrorBound,
        workerCount: workerPool?.usedWorkerCount ?? 0,
    };
}

function solveIdleGroup(
    context: FundedSolveContext,
    level: FundedLevel,
    groupIndex: number,
    cushionBucketCount: number,
    workingBucketCount: number,
    results: Float64Array,
): void {
    const { dayCost, horizonHazard } = context;
    const cycleBaselineRadix = cycleBaselineRadixAt(context, level.regime);
    const groupCount = groupCountAt(context, level.regime);
    const tradeValues = tradingDayStartValues(
        context,
        level,
        decodePair(context, groupIndex, cycleBaselineRadix),
        cushionBucketCount,
        workingBucketCount,
    );
    const levelKey = levelBaseKey(context, level);
    const stateCount = groupCount * context.idleKeyRadix * cushionBucketCount;
    const idleCloseCells = idleCloseCellsFor(context, level, stateCount);
    for (let idleDays = context.idleKeyRadix - 1; idleDays >= 0; idleDays--) {
        const pairIndex = idleDays * groupCount + groupIndex;
        const pair = decodePair(context, pairIndex, cycleBaselineRadix);
        for (let index = 0; index < cushionBucketCount; index++) {
            const ownOffset = pairIndex * cushionBucketCount + index;
            const outcome = cachedIdleClose(idleCloseCells, ownOffset, () => {
                const cushionDollars = context.cushionGrid.dollarsAt(index);
                return dayCloseOutcome(
                    context,
                    {
                        ...level,
                        ...pair,
                        cushionAtDayStart: context.isSolvingPerDayStart
                            ? cushionDollars
                            : 0,
                    },
                    cushionDollars,
                    true,
                    0,
                );
            });
            const tradeValue = tradeValues[index] ?? -Infinity;
            const isTerminal =
                outcome.continuationKey === TERMINAL_CONTINUATION_KEY;
            const isStayingInThisLevel =
                outcome.continuationOffsetUpperWeight === 0;
            const lowerOffset = outcome.continuationKey - levelKey;
            const upperWeight = outcome.continuationUpperWeight;
            if (
                !isTerminal &&
                isStayingInThisLevel &&
                upperWeight === 0 &&
                lowerOffset === ownOffset &&
                horizonHazard > 0
            ) {
                results[ownOffset] = Math.max(
                    tradeValue - dayCost,
                    (outcome.cash +
                        horizonHazard * outcome.horizonCredit -
                        dayCost) /
                        horizonHazard,
                );
                continue;
            }
            const idleGroupShape: IdleGroupShape = {
                cushionBucketCount,
                groupCount,
                groupIndex,
                idleKeyRadix: context.idleKeyRadix,
            };
            const isOffsetReady = (offset: number): boolean =>
                offset >= 0 &&
                offset < stateCount &&
                isSolvedEarlierInGroup(offset, ownOffset, idleGroupShape);
            const upperOffset = lowerOffset + 1;
            const isSolvedThisSweep =
                !isTerminal &&
                isStayingInThisLevel &&
                isOffsetReady(lowerOffset) &&
                (upperWeight === 0 || isOffsetReady(upperOffset));
            const idleValue = isSolvedThisSweep
                ? continuedValue(
                      context,
                      outcome.cash,
                      valueOnCushionGrid(
                          { lowerIndex: lowerOffset, upperWeight },
                          (offset) => results[offset] ?? 0,
                      ),
                      outcome.horizonCredit,
                  )
                : dayCloseValue(
                      context,
                      outcome.cash,
                      outcome.continuationKey,
                      outcome.continuationUpperWeight,
                      outcome.continuationOffsetUpperKey,
                      outcome.continuationOffsetUpperWeight,
                      outcome.horizonCredit,
                  );
            results[ownOffset] = Math.max(tradeValue, idleValue) - dayCost;
        }
    }
}

function solvePolicyDay(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    workingBucketCount: number,
): FundedPolicyDay {
    const { nextTables, scope } = solveDayTreeOnce(
        context,
        dayStart,
        workingBucketCount,
        FundedDayTreePurpose.Policy,
    );
    const idleValues = new Float64Array(scope.cellCount);
    for (let cell = 0; cell < scope.cellCount; cell++) {
        const reach = Math.floor(cell / workingBucketCount);
        scopedStopValue(scope, cell);
        idleValues[cell] = scopedIdleValue(
            scope,
            reach,
            cell - reach * workingBucketCount,
        );
    }
    return {
        idleValues,
        nextTables,
        risks: new Map(),
        scope: {
            ...scope,
            closeTable: null,
            lockoutValues: [],
            skeleton: {
                closeTables: new Map(),
                lockoutIds: new Map(),
                lockouts: [],
                reachCount: scope.skeleton.reachCount,
                rows: [],
                tradesByIndex: [],
                workingBucketCount,
            },
        },
    };
}

function terminalOutcome(cash: number): FundedDayCloseOutcome {
    return {
        cash,
        continuationKey: TERMINAL_CONTINUATION_KEY,
        continuationOffsetUpperKey: TERMINAL_CONTINUATION_KEY,
        continuationOffsetUpperWeight: 0,
        continuationUpperWeight: 0,
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
    return {
        ...settings,
        planId: plan.id,
        planOptIns: registryPlanOptIns.get(plan) ?? NO_PLAN_OPT_INS,
        warmStartValues: undefined,
    };
}

function tradeOutcome(
    context: FundedSolveContext,
    skeleton: FundedDaySkeleton,
    dayStart: FundedDayStart,
    cushionAfter: number,
    reach: number,
): FundedTradeOutcome {
    if (cushionAfter <= 0) return exactOutcome(OUTCOME_BUST);
    const { plan } = context;
    const state = buildState(
        context,
        dayStart,
        dayStart.thresholdDollars + cushionAfter,
        todayPnLOf(context, dayStart, cushionAfter),
        0,
    );
    context.drawdown.onTrade(state, 0);
    if (plan.isBust(state, TradingPhase.Funded)) {
        return exactOutcome(OUTCOME_BUST);
    }
    const reachAfter = reachAfterTrade(context, dayStart, reach, state);
    if (plan.isDayLockedOut(state, TradingPhase.Funded)) {
        const lockoutKey = `${reachAfter}:${cushionAfter}`;
        let lockoutId = skeleton.lockoutIds.get(lockoutKey);
        if (lockoutId === undefined) {
            lockoutId = skeleton.lockouts.length;
            skeleton.lockouts.push({ cushionAfter, reachAfter });
            skeleton.lockoutIds.set(lockoutKey, lockoutId);
        }
        return exactOutcome(OUTCOME_FIRST_LOCKOUT - lockoutId);
    }
    const { lowerIndex, upperWeight } = splitOntoCushionGrid(
        cushionAfter,
        context.cushionGrid,
        skeleton.workingBucketCount,
    );
    return {
        outcome: reachAfter * skeleton.workingBucketCount + lowerIndex,
        upperWeight,
    };
}

function tradesAtCushion(
    context: FundedSolveContext,
    dayStart: FundedDayStart,
    cushionNow: number,
): readonly SizedTrade[] {
    const { plan, positionSizing } = context;
    const state = buildState(
        context,
        dayStart,
        dayStart.thresholdDollars + cushionNow,
        todayPnLOf(context, dayStart, cushionNow),
        0,
    );
    return candidateTrades(
        context,
        plan.affordableRoom(state, TradingPhase.Funded, context.commission),
        positionSizing === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Funded,
                  positionSizing.instrument.isMicro,
                  plan.tierProfitContext(state),
              ),
    );
}

function tradingDayStartValues(
    context: FundedSolveContext,
    level: FundedLevel,
    pair: FundedPair,
    cushionBucketCount: number,
    workingBucketCount: number,
): Float64Array {
    if (!context.isSolvingPerDayStart) {
        return solveDayTreeOnce(
            context,
            { ...level, ...pair, cushionAtDayStart: 0 },
            workingBucketCount,
            FundedDayTreePurpose.TradingValue,
        ).finalTable;
    }
    const dayStartValues = new Float64Array(cushionBucketCount);
    for (
        let cushionStartIndex = 0;
        cushionStartIndex < cushionBucketCount;
        cushionStartIndex++
    ) {
        dayStartValues[cushionStartIndex] =
            solveDayTreeOnce(
                context,
                {
                    ...level,
                    ...pair,
                    cushionAtDayStart:
                        context.cushionGrid.dollarsAt(cushionStartIndex),
                },
                workingBucketCount,
                FundedDayTreePurpose.TradingValue,
            ).finalTable[cushionStartIndex] ?? -Infinity;
    }
    return dayStartValues;
}

function tryCreateFundedWorkerSolver(
    init: FundedWorkerInit,
): Error | FundedWorkerSolver {
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

function valueRangeContaining(
    ranges: readonly FundedValueRange[],
    key: number,
): FundedValueRange | null {
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const range = ranges[middle];
        if (range === undefined) return null;
        if (key < range.base) {
            high = middle - 1;
        } else if (key >= range.base + range.length) {
            low = middle + 1;
        } else {
            return range;
        }
    }
    return null;
}

function warmStartValuesFor(
    warmStartValues: Float64Array,
    context: FundedSolveContext,
): Float64Array {
    if (context.horizonHazard === 0) {
        throw new Error(
            `${context.plan.label}: warmStartValues needs meanHorizonDays, since without a horizon hazard the funded fixed point need not be unique and a warm start could settle on a different one than a cold solve`,
        );
    }
    if (warmStartValues.length !== context.keyLayout.length) {
        throw new Error(
            `${context.plan.label}: warmStartValues holds ${warmStartValues.length} values but this solve's grid holds ${context.keyLayout.length}, so they come from a different plan or grid`,
        );
    }
    return warmStartValues;
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
    private readonly workers: Worker[] = [];
    readonly results: Float64Array;

    constructor(
        numberWorkers: number,
        config: FundedStateValueConfig,
        context: FundedSolveContext,
        snapshot: Float64Array,
    ) {
        const snapshotSAB = sharedBufferOf(snapshot);

        const resultsSAB = new SharedArrayBuffer(
            maxLevelStateCount(context) * 8,
        );
        this.results = new Float64Array(resultsSAB);

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
                resultsSAB,
                role: 'funded-state-value-worker',
                snapshotSAB,
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

    private awaitAllWorkers(): void {
        for (const [workerIndex, errorPort] of this.errorPorts.entries()) {
            awaitWorkerSignal(
                this.flags,
                workerIndex,
                errorPort,
                WORKER_DISPATCH_TIMEOUT_MS,
                'FundedStateValue',
            );
        }
    }

    get usedWorkerCount(): number {
        return this.dispatchCount === 0 ? 0 : this.workers.length;
    }

    configure(config: FundedStateValueConfig, snapshot: Float64Array): void {
        this.dispatchCount = 0;
        const message: FundedWorkerConfigure = {
            config: toSerializableConfig(config),
            kind: FundedWorkerMessageKind.Configure,
            snapshotSAB: sharedBufferOf(snapshot),
        };
        for (const [workerIndex, worker] of this.workers.entries()) {
            Atomics.store(this.flags, workerIndex, WorkerSignal.Pending);
            worker.postMessage(message);
        }
        this.awaitAllWorkers();
    }

    fits(context: FundedSolveContext): boolean {
        return (
            this.results.length === maxLevelStateCount(context) &&
            this.workers.length === plannedWorkerCount(context)
        );
    }

    runGrid(
        level: FundedLevel,
        groupCount: number,
        cushionBucketCount: number,
        workingBucketCount: number,
        breachValueBeforeFirstPayout: number,
    ): void {
        this.dispatchCount++;
        const perWorkerGroups: number[][] = Array.from(
            { length: this.workers.length },
            () => [],
        );
        for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
            perWorkerGroups[groupIndex % this.workers.length]?.push(groupIndex);
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
            const groupIndices = perWorkerGroups[workerIndex] ?? [];
            if (groupIndices.length === 0) {
                Atomics.store(this.flags, workerIndex, WorkerSignal.Done);
                continue;
            }
            const dispatch: FundedWorkerDispatch = {
                breachValueBeforeFirstPayout,
                cushionBucketCount,
                groupIndices,
                isLockedAtStart: level.isLocked,
                kind: FundedWorkerMessageKind.Solve,
                regimeAtStart: level.regime,
                thresholdDollars: level.thresholdDollars,
                workingBucketCount,
            };
            this.workers[workerIndex]?.postMessage(dispatch);
        }
        this.awaitAllWorkers();
    }

    terminate(): void {
        for (const worker of this.workers) {
            void worker.terminate();
        }
        for (const errorPort of this.errorPorts) {
            errorPort.close();
        }
    }
}

export class FundedWorkerSession {
    private pool: FundedWorkerPool | null = null;
    private poolStarts = 0;
    private solves = 0;

    get solveCount(): number {
        return this.solves;
    }

    get startedPoolCount(): number {
        return this.poolStarts;
    }

    poolFor(
        config: FundedStateValueConfig,
        context: FundedSolveContext,
        snapshot: Float64Array,
    ): FundedWorkerPool | null {
        this.solves++;
        if (findRegistryPlanId(config.plan) === null) {
            this.release();
            return null;
        }
        if (this.pool?.fits(context)) {
            this.pool.configure(config, snapshot);
            return this.pool;
        }
        this.release();
        this.pool = tryCreateWorkerPool(config, context, snapshot);
        if (this.pool !== null) this.poolStarts++;
        return this.pool;
    }

    release(): void {
        this.pool?.terminate();
        this.pool = null;
    }
}

export class ValueIterationMonitor {
    private deltaBeforeExtrapolation = Infinity;
    private extrapolationCount = 0;
    private readonly isExtrapolating: boolean;
    private lastDelta = Infinity;
    private plainSweepDeadlineCount = 0;
    private ratioStability = EXTRAPOLATION_RATIO_STABILITY;
    private readonly recentRatios: number[] = [];
    private recordedSweepCount = 0;
    private sweepsSinceExtrapolation = 0;

    constructor(
        private readonly contraction: number,
        private readonly tolerance: number,
    ) {
        if (!(contraction >= 0 && contraction <= 1)) {
            throw new RangeError(
                `ValueIterationMonitor: contraction must be within [0, 1], got ${contraction}`,
            );
        }
        if (!(tolerance > 0)) {
            throw new RangeError(
                `ValueIterationMonitor: tolerance must be positive, got ${tolerance}`,
            );
        }
        this.isExtrapolating = contraction < 1;
    }

    get errorBound(): number {
        if (this.lastDelta === 0) return 0;
        return this.contraction >= 1
            ? Infinity
            : (this.contraction / (1 - this.contraction)) * this.lastDelta;
    }

    get plainSweepDeadline(): number {
        return this.plainSweepDeadlineCount;
    }

    get isConverged(): boolean {
        return this.contraction >= 1
            ? this.lastDelta < this.tolerance
            : this.errorBound <= this.tolerance;
    }

    record(maxDelta: number): SweepStep {
        this.recordedSweepCount++;
        this.sweepsSinceExtrapolation++;
        if (this.sweepsSinceExtrapolation === 1) {
            this.plainSweepDeadlineCount = Math.max(
                this.plainSweepDeadlineCount,
                this.recordedSweepCount -
                    1 +
                    contractionSweepCap(
                        maxDelta,
                        this.tolerance,
                        this.contraction,
                    ),
            );
        }
        if (
            this.sweepsSinceExtrapolation === 1 &&
            maxDelta > this.deltaBeforeExtrapolation
        ) {
            this.ratioStability /= EXTRAPOLATION_BACKOFF;
        }
        if (this.sweepsSinceExtrapolation >= 2 && this.lastDelta > 0) {
            this.recentRatios.push(maxDelta / this.lastDelta);
            if (this.recentRatios.length > EXTRAPOLATION_RATIO_WINDOW) {
                this.recentRatios.shift();
            }
        }
        this.lastDelta = maxDelta;
        if (this.isConverged) {
            return { extrapolationFactor: 0, verdict: SweepVerdict.Converged };
        }
        const ratio = this.recentRatios.at(-1) ?? NaN;
        if (
            this.isExtrapolating &&
            this.extrapolationCount < MAX_EXTRAPOLATIONS_PER_LEVEL &&
            this.recentRatios.length === EXTRAPOLATION_RATIO_WINDOW &&
            ratio > 0 &&
            ratio < 1 &&
            this.recentRatios.every(
                (recent) =>
                    Math.abs(recent - ratio) <=
                    this.ratioStability * (1 - ratio),
            )
        ) {
            this.extrapolationCount++;
            this.sweepsSinceExtrapolation = 0;
            this.deltaBeforeExtrapolation = maxDelta;
            this.recentRatios.length = 0;
            return {
                extrapolationFactor: ratio / (1 - ratio),
                verdict: SweepVerdict.Extrapolate,
            };
        }
        return { extrapolationFactor: 0, verdict: SweepVerdict.Continue };
    }
}

export function computeFundedStateValue(
    config: FundedStateValueConfig,
    workers: FundedWorkerSession | null = null,
): FundedStateValueResult {
    const { plan } = config;
    if (!isFundedDpEligible(plan)) {
        throw new Error(
            `${plan.label}: not eligible for FundedStateValue DP (call isFundedDpEligible first): its funded drawdown is intraday-trailing, its funded daily loss limit scales continuously with peak-day-close profit (PeakProfitShare), it has no funded drawdown lock and no ReleaseFloor payout floor effect, or its payoutCapOverride is a QualifyingDaysMilestonePayoutCap (keyed on cumulative qualifying days, which this DP cannot track exactly)`,
        );
    }
    const stopRule: DayStopRule = config.stopRule ?? {
        kind: DayStopRuleKind.None,
    };
    if (stopRule.kind !== DayStopRuleKind.None) {
        throw new Error(
            `${plan.label}: FundedStateValue's shared-per-level cushion grid only supports DayStopRuleKind.None: a within-day P&L-dependent stop rule would need a day-start-relative sub-grid per outer state, out of v1 scope`,
        );
    }

    let values: Float64Array = new Float64Array(0);
    const mainContext = buildFundedSolveContext(
        config,
        (key) => values[key] ?? 0,
    );
    values = new Float64Array(
        new SharedArrayBuffer(mainContext.keyLayout.length * 8),
    );
    if (config.warmStartValues !== undefined) {
        values.set(warmStartValuesFor(config.warmStartValues, mainContext));
    }
    const levelSolve = solveFundedLevels(config, mainContext, values, workers);
    clearSolveCaches(mainContext);

    const {
        initialThreshold,
        lockedCushionBucketCount,
        lockedThreshold,
        offsetBucketCount,
        payoutRegimeCap,
        unlockedCushionBucketCount,
        unlockedWorkingBucketCount,
    } = mainContext;

    const initialValue = values[initialStateKey(mainContext)] ?? 0;

    const layerPolicies = Array.from(
        { length: mainContext.fundedResetLayerCount + 1 },
        (_, layer) => {
            const resetLayer = levelSolve.resetLayers.get(layer);
            return {
                cache: new Map<number, FundedPolicyDay>(),
                context:
                    resetLayer === undefined
                        ? mainContext
                        : resetLayerContext(mainContext, values, resetLayer),
            };
        },
    );

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
        if (fundedCycle !== undefined) {
            assertFundedCycleSnapshotCounts(plan, fundedCycle);
        }
        const regime = Math.min(
            fundedCycle?.payoutsIssued ?? 0,
            payoutRegimeCap,
        );
        const resetLayer =
            regime === 0 && fundedCycle !== undefined
                ? Math.min(
                      fundedCycle.fundedResetsUsed,
                      mainContext.fundedResetLayerCount,
                  )
                : 0;
        const layerPolicy = layerPolicies[resetLayer];
        if (layerPolicy === undefined) {
            throw new Error(
                `${plan.label}: FundedStateValue computeRisk has no policy for reset layer ${resetLayer}`,
            );
        }
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
                fundedCycle?.dayGateProgress ?? 0,
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
                      initialThreshold +
                      mainContext.cushionGrid.dollarsAt(offsetIndex),
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
        let policyDay = layerPolicy.cache.get(cacheKey);
        if (policyDay === undefined) {
            policyDay = solvePolicyDay(
                layerPolicy.context,
                {
                    ...level,
                    ...pair,
                    cushionAtDayStart:
                        mainContext.cushionGrid.dollarsAt(cushionStartIndex),
                },
                workingBucketCount,
            );
            layerPolicy.cache.set(cacheKey, policyDay);
        }
        return riskAtExactCushion(
            policyDay,
            mainContext.peakRatchet.reachBandOf(state) - pair.ratchet,
            cushionDollars,
            tradeIndexToday,
        );
    }

    const dayPolicy = computedDayPolicy(
        computeRisk,
        mainContext.slots,
        stopRule,
        PolicySizing.WholeContracts,
    );

    function isGridSaturated(
        state: AccountState,
        fundedCycle?: FundedCycleSnapshot,
    ): boolean {
        const cushionDollars = state.balance - state.threshold;
        const cushionTopBucketCount = state.thresholdLocked
            ? lockedCushionBucketCount
            : unlockedCushionBucketCount;
        const cushionTopDollars = mainContext.cushionGrid.dollarsAt(
            cushionTopBucketCount - 1,
        );
        if (cushionDollars >= cushionTopDollars - BUCKET_EPSILON) return true;
        const lastPayoutBalance =
            fundedCycle?.lastPayoutBalance ?? mainContext.startingBalance;
        const cycleBaselineDollars =
            lastPayoutBalance - mainContext.lockedPayoutFloor;
        const cycleBaselineTopDollars = mainContext.cycleBaselineGrid.dollarsAt(
            mainContext.cycleBaselineGrid.size - 1,
        );
        return cycleBaselineDollars >= cycleBaselineTopDollars - BUCKET_EPSILON;
    }

    return {
        bustTerminalValue: mainContext.bustTerminalValue,
        cushionGrid: {
            ...mainContext.cushionGrid.summary(),
            lockedTopDollars: mainContext.cushionGrid.dollarsAt(
                lockedCushionBucketCount - 1,
            ),
        },
        cycleBaselineRounding: cycleBaselineRoundingOf(mainContext),
        dayPolicy,
        initialValue,
        isGridSaturated,
        reachedStateCount: levelSolve.reachedStateCount,
        stateValues: values,
        sweepCount: levelSolve.sweepCount,
        unconvergedLevelCount: levelSolve.unconvergedLevelCount,
        valueErrorBound: levelSolve.valueErrorBound,
        workerCount: levelSolve.workerCount,
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

function plannedWorkerCount(context: FundedSolveContext): number {
    return Math.min(
        availableParallelism(),
        MAX_WORKER_COUNT,
        maxGroupCount(context),
    );
}

function sharedBufferOf(snapshot: Float64Array): SharedArrayBuffer {
    const buffer = snapshot.buffer;
    if (!(buffer instanceof SharedArrayBuffer)) {
        throw new TypeError(
            'FundedStateValue: the worker pool needs values backed by a SharedArrayBuffer',
        );
    }
    return buffer;
}

function tryCreateWorkerPool(
    config: FundedStateValueConfig,
    context: FundedSolveContext,
    snapshot: Float64Array,
): FundedWorkerPool | null {
    if (
        maxGroupCount(context) < MIN_PARALLEL_GROUP_COUNT ||
        availableParallelism() <= 1 ||
        findRegistryPlanId(config.plan) === null
    ) {
        return null;
    }

    const numberWorkers = plannedWorkerCount(context);
    try {
        return new FundedWorkerPool(numberWorkers, config, context, snapshot);
    } catch (error) {
        throw new Error(
            `${config.plan.label}: FundedStateValue could not start its worker pool of ${numberWorkers} workers over a ${context.keyLayout.length}-value shared snapshot: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
}
