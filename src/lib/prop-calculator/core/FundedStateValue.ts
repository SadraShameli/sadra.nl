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
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type Plan } from './Plan';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolveContractLimit,
} from './PositionSizing';
import { TradingPhase } from './TradingPhase';
import { type ContractCount, dollars, type Dollars } from './units';

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
    const convergenceTolerance =
        config.convergenceTolerance ?? DEFAULT_CONVERGENCE_TOLERANCE;
    const maxIterationsPerLevel =
        config.maxIterationsPerLevel ?? DEFAULT_MAX_ITERATIONS_PER_LEVEL;
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

    const isTrackingFundedConsistency = plan.fundedConsistencyRule() !== null;
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

    const value = new Map<string, number>();
    const policy = new Map<string, CushionStartPolicyTables>();

    function lockedThresholdDollars(): number {
        if (lock) return lock.lockedThreshold(startingBalance);
        if (plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor) {
            return startingBalance;
        }
        throw new Error(
            `${plan.label}: reached a thresholdLocked funded state with no drawdown lock config and no ReleaseFloor payout effect — this should be unreachable`,
        );
    }

    function bucketIndex(dollarsValue: number, bucketCount: number): number {
        const raw = Math.floor(
            (dollarsValue + BUCKET_EPSILON) / cushionStepDollars,
        );
        return Math.min(bucketCount - 1, Math.max(0, raw));
    }

    function cycleBestDayIndex(dollarsValue: number): number {
        if (cycleBestDayBucketCount <= 1) return 0;
        const raw = Math.floor(
            (dollarsValue + BUCKET_EPSILON) / cycleBestDayStepDollars,
        );
        return Math.min(cycleBestDayBucketCount - 1, Math.max(0, raw));
    }

    function buildState(
        balance: number,
        threshold: number,
        isThresholdLocked: boolean,
    ): AccountState {
        return {
            balance,
            bestDayProfit: 0,
            consecutiveIdleDays: 0,
            peakDayCloseProfit: 0,
            qualifyingDays: LARGE_QUALIFYING_DAYS,
            startingBalance,
            threshold,
            thresholdLocked: isThresholdLocked,
            todayPnL: 0,
            tradingDays: 0,
        };
    }

    function continuationValue(
        balance: number,
        threshold: number,
        isThresholdLocked: boolean,
        regimeCapped: number,
        idleDays: number,
        cycleBestDay: number,
    ): number {
        const cushion = balance - threshold;
        if (isThresholdLocked) {
            const index = bucketIndex(cushion, lockedCushionBucketCount);
            return (
                value.get(
                    lockedKey(regimeCapped, idleDays, cycleBestDay, index),
                ) ?? 0
            );
        }
        const offsetIndex = bucketIndex(
            threshold - initialThreshold,
            offsetBucketCount,
        );
        const cushionIndex = bucketIndex(cushion, unlockedCushionBucketCount);
        return (
            value.get(
                unlockedKey(
                    offsetIndex,
                    regimeCapped,
                    idleDays,
                    cycleBestDay,
                    cushionIndex,
                ),
            ) ?? 0
        );
    }

    function dayCloseValue(
        cushionAtEnd: number,
        thresholdDollars: number,
        isLockedAtStart: boolean,
        regimeAtStart: number,
        wasIdleToday: boolean,
        idleDaysAtStart: number,
        cycleBestDayAtStart: number,
        cushionAtDayStart: number,
    ): number {
        const state = buildState(
            thresholdDollars + cushionAtEnd,
            thresholdDollars,
            isLockedAtStart,
        );
        drawdown.onDayClose(state);
        plan.recordDayClosePeak(state);
        if (plan.isBust(state, TradingPhase.Funded)) return bustTerminalValue;

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
            return bustTerminalValue;
        }

        const cycleBestDayAtStartDollars =
            cycleBestDayAtStart * cycleBestDayStepDollars;
        const todayPnL = cushionAtEnd - cushionAtDayStart;
        const cycleBestDayAtEndDollars = Math.max(
            cycleBestDayAtStartDollars,
            todayPnL,
        );
        const cycleBestDayAtEndIndex = cycleBestDayIndex(
            cycleBestDayAtEndDollars,
        );

        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = regimeAtStart;
        tracker.lastPayoutBalance =
            regimeAtStart === 0
                ? startingBalance
                : plan.payoutBalanceFloor(state, retainedCushion);
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.cycleBestDayProfit = cycleBestDayAtEndDollars;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: retainedCushion,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });
        const receivedCash = payout?.traderReceives ?? 0;
        const payoutsIssuedNow = tracker.payoutsIssued;

        if (plan.isAccountConcluded(payoutsIssuedNow)) return receivedCash;

        const regimeNow = Math.min(payoutsIssuedNow, payoutRegimeCap);
        const cycleBestDayForContinuation =
            payout === null ? cycleBestDayAtEndIndex : 0;
        return (
            receivedCash +
            continuationValue(
                state.balance,
                state.threshold,
                state.thresholdLocked,
                regimeNow,
                idleDaysAtEnd,
                cycleBestDayForContinuation,
            )
        );
    }

    function withinDayContinuation(
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
        if (cushionAfter <= 0) return bustTerminalValue;
        const state = buildState(
            thresholdDollars + cushionAfter,
            thresholdDollars,
            isLockedAtStart,
        );
        drawdown.onTrade(state, 0);
        if (plan.isBust(state, TradingPhase.Funded)) return bustTerminalValue;
        if (plan.isDayLockedOut(state, TradingPhase.Funded)) {
            return dayCloseValue(
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
        const index = bucketIndex(cushionAfter, cushionBucketCount);
        return nextRoundTable[index] ?? 0;
    }

    function candidateRisks(
        cushionNow: number,
        accountProfitNow: number,
    ): number[] {
        const risks = new Set<number>();
        const contractLimit: ContractCount | null =
            positionSizing === null
                ? null
                : resolveContractLimit(
                      plan.contractLimits,
                      TradingPhase.Funded,
                      positionSizing.instrument.isMicro,
                      accountProfitNow,
                  );
        for (const action of actionGrid) {
            const capped =
                positionSizing === null
                    ? action
                    : capRiskToContractLimit(
                          action,
                          positionSizing,
                          contractLimit,
                      );
            const risk = resolveTradeRisk(capped, cushionNow, rungSizing);
            risks.add(Math.max(0, risk));
        }
        risks.add(0);
        return [...risks];
    }

    function valueOfRisk(
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
        const pnlWin = rrRatio * risk - commission;
        const valueWin = withinDayContinuation(
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
        const pnlLose = -risk - commission;
        const valueLose = withinDayContinuation(
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
        return winrate * valueWin + (1 - winrate) * valueLose;
    }

    function bestActionAt(
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
    ): { bestAction: number; bestValue: number } {
        const accountProfitNow =
            thresholdDollars + cushionNow - startingBalance;
        let bestValue = -Infinity;
        let bestAction = 0;
        for (const risk of candidateRisks(cushionNow, accountProfitNow)) {
            const value =
                risk <= 0
                    ? dayCloseValue(
                          cushionNow,
                          thresholdDollars,
                          isLockedAtStart,
                          regimeAtStart,
                          tradeIndex === 0,
                          idleDaysAtStart,
                          cycleBestDayAtStart,
                          cushionAtDayStart,
                      )
                    : valueOfRisk(
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

    function solveDayTreeOnce(
        thresholdDollars: number,
        isLockedAtStart: boolean,
        regimeAtStart: number,
        idleDaysAtStart: number,
        cycleBestDayAtStart: number,
        cushionAtDayStart: number,
        workingBucketCount: number,
    ): { finalTable: number[]; policyTables: number[][] } {
        let nextRoundTable: number[] = Array.from(
            { length: workingBucketCount },
            (_, index) =>
                dayCloseValue(
                    index * cushionStepDollars,
                    thresholdDollars,
                    isLockedAtStart,
                    regimeAtStart,
                    false,
                    idleDaysAtStart,
                    cycleBestDayAtStart,
                    cushionAtDayStart,
                ),
        );
        const policyTables: number[][] = [];
        for (let tradeIndex = slots - 1; tradeIndex >= 0; tradeIndex--) {
            const currentTable: number[] = Array.from({
                length: workingBucketCount,
            });
            const currentPolicy: number[] = Array.from({
                length: workingBucketCount,
            });
            for (let index = 0; index < workingBucketCount; index++) {
                const cushionNow = index * cushionStepDollars;
                const { bestAction, bestValue } = bestActionAt(
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
                );
                currentTable[index] = bestValue;
                currentPolicy[index] = bestAction;
            }
            policyTables[tradeIndex] = currentPolicy;
            nextRoundTable = currentTable;
        }
        return { finalTable: nextRoundTable, policyTables };
    }

    function solveDayTree(
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
        if (!isTrackingFundedConsistency) {
            const { finalTable, policyTables } = solveDayTreeOnce(
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
            const cushionAtDayStart = cushionStartIndex * cushionStepDollars;
            const { finalTable, policyTables } = solveDayTreeOnce(
                thresholdDollars,
                isLockedAtStart,
                regimeAtStart,
                idleDaysAtStart,
                cycleBestDayAtStart,
                cushionAtDayStart,
                workingBucketCount,
            );
            dayStartValues[cushionStartIndex] =
                finalTable[cushionStartIndex] ?? 0;
            policyTablesByCushionStart[cushionStartIndex] = policyTables;
        }
        return { dayStartValues, policyTablesByCushionStart };
    }

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
        ) => string,
    ): {
        maxDelta: number;
        policyTablesByIdleDaysByCycleBestDay: CushionStartPolicyTables[][];
    } {
        const solvedByIdleDays: {
            dayStartValues: number[];
            policyTablesByCushionStart: CushionStartPolicyTables;
        }[][] = [];
        for (let idleDays = 0; idleDays < idleDaysBucketCount; idleDays++) {
            const row: {
                dayStartValues: number[];
                policyTablesByCushionStart: CushionStartPolicyTables;
            }[] = [];
            for (
                let cycleBestDay = 0;
                cycleBestDay < cycleBestDayBucketCount;
                cycleBestDay++
            ) {
                row.push(
                    solveDayTree(
                        thresholdDollars,
                        isLockedAtStart,
                        regimeAtStart,
                        idleDays,
                        cycleBestDay,
                        cushionBucketCount,
                        workingBucketCount,
                    ),
                );
            }
            solvedByIdleDays.push(row);
        }
        let maxDelta = 0;
        for (const [idleDays, row] of solvedByIdleDays.entries()) {
            for (const [cycleBestDay, { dayStartValues }] of row.entries()) {
                for (let index = 0; index < cushionBucketCount; index++) {
                    const key = keyFor(idleDays, cycleBestDay, index);
                    const old = value.get(key) ?? 0;
                    const next = dayStartValues[index] ?? 0;
                    maxDelta = Math.max(maxDelta, Math.abs(next - old));
                }
            }
        }
        for (const [idleDays, row] of solvedByIdleDays.entries()) {
            for (const [cycleBestDay, { dayStartValues }] of row.entries()) {
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
            policyTablesByIdleDaysByCycleBestDay: solvedByIdleDays.map((row) =>
                row.map((solved) => solved.policyTablesByCushionStart),
            ),
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
        ) => string,
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
        const policyTablesByIdleDaysByCycleBestDay = solveLevelToConvergence(
            lockedThresholdDollars(),
            true,
            regime,
            lockedCushionBucketCount,
            lockedCushionBucketCount,
            (idleDays, cycleBestDay, index) =>
                lockedKey(regime, idleDays, cycleBestDay, index),
        );
        for (let idleDays = 0; idleDays < idleDaysBucketCount; idleDays++) {
            for (
                let cycleBestDay = 0;
                cycleBestDay < cycleBestDayBucketCount;
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
            initialThreshold + offsetIndex * cushionStepDollars;
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
                            offsetIndex,
                            regime,
                            idleDays,
                            cycleBestDay,
                            index,
                        ),
                );
            for (let idleDays = 0; idleDays < idleDaysBucketCount; idleDays++) {
                for (
                    let cycleBestDay = 0;
                    cycleBestDay < cycleBestDayBucketCount;
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

    const initialCushionIndex = bucketIndex(
        drawdownAmount,
        unlockedCushionBucketCount,
    );
    const initialValue =
        value.get(unlockedKey(0, 0, 0, 0, initialCushionIndex)) ?? 0;

    function computeRisk(
        state: AccountState,
        tradeIndexToday: number,
        payoutsIssued?: number,
        cycleBestDayProfit?: number,
    ): number {
        const regime = Math.min(payoutsIssued ?? 0, payoutRegimeCap);
        const idleDays = plan.clampedIdleDays(state);
        const cushionDollars = state.balance - state.threshold;
        const cycleBestDay = cycleBestDayIndex(cycleBestDayProfit ?? 0);
        const cushionAtDayStartDollars = cushionDollars - state.todayPnL;
        if (state.thresholdLocked) {
            const index = bucketIndex(cushionDollars, lockedCushionBucketCount);
            const cushionStartIndex = isTrackingFundedConsistency
                ? bucketIndex(
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
            state.threshold - initialThreshold,
            offsetBucketCount,
        );
        const cushionIndex = bucketIndex(
            cushionDollars,
            unlockedWorkingBucketCount,
        );
        const cushionStartIndex = isTrackingFundedConsistency
            ? bucketIndex(cushionAtDayStartDollars, unlockedCushionBucketCount)
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

    const dayPolicy = computedDayPolicy(computeRisk, slots, stopRule);

    return {
        bustTerminalValue,
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
        (plan.fundedDrawdown.lock !== undefined ||
            plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor)
    );
}

function lockedKey(
    regime: number,
    idleDays: number,
    cycleBestDay: number,
    cushionIndex: number,
): string {
    return `L|${regime}|${idleDays}|${cycleBestDay}|${cushionIndex}`;
}

function lockedLevelKey(
    regime: number,
    idleDays: number,
    cycleBestDay: number,
): string {
    return `L|${regime}|${idleDays}|${cycleBestDay}`;
}

function unlockedKey(
    offsetIndex: number,
    regime: number,
    idleDays: number,
    cycleBestDay: number,
    cushionIndex: number,
): string {
    return `U|${offsetIndex}|${regime}|${idleDays}|${cycleBestDay}|${cushionIndex}`;
}

function unlockedLevelKey(
    offsetIndex: number,
    regime: number,
    idleDays: number,
    cycleBestDay: number,
): string {
    return `U|${offsetIndex}|${regime}|${idleDays}|${cycleBestDay}`;
}
