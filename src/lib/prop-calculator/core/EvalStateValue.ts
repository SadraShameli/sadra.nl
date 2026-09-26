import { type AccountState } from './AccountState';
import { ConsistencyViolationEffect } from './ConsistencyRule';
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
    PNL_ONLY_STOP_RULE_KINDS,
    PolicySizing,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './DayPolicy';
import { DrawdownKind } from './DrawdownStrategy';
import {
    type ContractCount,
    dollars,
    type Dollars,
    type Fraction0to1,
} from './lib/units';
import { type Plan } from './Plan';
import {
    capRiskToContractLimit,
    contractLimitAt,
    type PositionSizingConfig,
} from './PositionSizing';
import { TradingPhase } from './TradingPhase';

export interface EvalStateValueConfig {
    readonly actionStepDollars?: number;
    readonly commission?: Dollars;
    readonly cushionStepDollars?: number;
    readonly dayCost?: (day: number) => number;
    readonly maxActionDollars?: number;
    readonly maxEvalDays: number;
    readonly plan: Plan;
    readonly positionSizing?: null | PositionSizingConfig;
    readonly profitStepDollars?: number;
    readonly rrRatio: number;
    readonly rungSizing?: RungSizing;
    readonly stopRule?: DayStopRule;
    readonly terminalValueAtFail?: (failedAttemptDays: number) => number;
    readonly terminalValueAtPass?: number;
    readonly tradesPerDay?: number;
    readonly winrate: Fraction0to1;
}

export interface EvalStateValueResult {
    readonly dayPolicy: DayPolicy;
    readonly initialValue: number;
    readonly reachedStateCount: number;
    readonly riskAtReachedState: (
        state: AccountState,
        tradeIndexToday: number,
    ) => null | number;
}

interface OuterState {
    readonly bestDay: number;
    readonly cushion: number;
    readonly day: number;
    readonly idleDays: number;
    readonly isLocked: boolean;
    readonly peakBand: number;
    readonly thresholdOffset: number;
    readonly tradingDays: number;
}

const DEFAULT_ACTION_STEP_DOLLARS = 50;
const DEFAULT_CUSHION_STEP_DOLLARS = 100;
const DEFAULT_PROFIT_STEP_DOLLARS = 300;
const DEFAULT_TERMINAL_VALUE_AT_FAIL = 0;
const DEFAULT_TERMINAL_VALUE_AT_PASS = 1;
const DEFAULT_TRADES_PER_DAY = 4;
export function computeEvalStateValue(
    config: EvalStateValueConfig,
): EvalStateValueResult {
    const { plan } = config;
    if (!isEvalDpEligible(plan)) {
        throw new Error(
            `${plan.label}: not eligible for EvalStateValue DP (call isEvalDpEligible first): its eval drawdown is intraday-trailing, its eval daily loss limit scales continuously with peak-day-close profit (PeakProfitShare), or an eval tier is keyed on TierBasis.PeakIntradayProfit (the eval DP tracks no intraday reach)`,
        );
    }

    const stopRule: DayStopRule = config.stopRule ?? {
        kind: DayStopRuleKind.None,
    };
    if (!PNL_ONLY_STOP_RULE_KINDS[stopRule.kind]) {
        throw new Error(
            `${plan.label}: EvalStateValue's cushion-gridded within-day solve only supports stop rules whose trigger depends solely on today's running P&L (none/day-green/after-target): "${stopRule.kind}" depends on the day's loss/win sequence, which the grid does not track per-bucket`,
        );
    }

    const drawdown = plan.drawdownFor(TradingPhase.Eval);
    const lock = drawdown.lock;
    const initialThreshold = drawdown.initialThreshold(plan.accountSize);
    const evalConsistencyRule = plan.evalConsistencyRule();
    const isTrackingConsistency = evalConsistencyRule !== null;
    const canDoubleTarget =
        evalConsistencyRule?.violationEffect ===
        ConsistencyViolationEffect.DoubleTarget;
    const dayCap = plan.evalDayCap(config.maxEvalDays);

    const rrRatio = config.rrRatio;
    const winrate = config.winrate;
    const commission = config.commission ?? dollars(0);
    const dayCost = config.dayCost ?? (() => 0);
    const rungSizing = config.rungSizing ?? DEFAULT_RUNG_SIZING;
    const slots = Math.max(
        1,
        Math.floor(config.tradesPerDay ?? DEFAULT_TRADES_PER_DAY),
    );
    const terminalValueAtFail =
        config.terminalValueAtFail ?? (() => DEFAULT_TERMINAL_VALUE_AT_FAIL);
    const terminalValueAtPass =
        config.terminalValueAtPass ?? DEFAULT_TERMINAL_VALUE_AT_PASS;
    const positionSizing = config.positionSizing ?? null;
    const actionStepDollars =
        config.actionStepDollars ?? DEFAULT_ACTION_STEP_DOLLARS;
    const cushionStepDollars =
        config.cushionStepDollars ?? DEFAULT_CUSHION_STEP_DOLLARS;
    const profitStepDollars =
        config.profitStepDollars ?? DEFAULT_PROFIT_STEP_DOLLARS;
    const maxActionDollars = Math.max(
        actionStepDollars,
        config.maxActionDollars ?? Math.round(drawdown.amount * 0.4),
    );
    const actionGrid: number[] = [];
    for (
        let a = actionStepDollars;
        a <= maxActionDollars;
        a += actionStepDollars
    ) {
        actionGrid.push(a);
    }
    const maxTrackedProfitLike =
        (canDoubleTarget ? plan.profitTarget * 2 : plan.profitTarget) +
        drawdown.amount +
        maxActionDollars * Math.max(1, rrRatio);
    const cushionBucketCount =
        Math.round(maxTrackedProfitLike / cushionStepDollars) + 1;
    const contractLimit: ContractCount | null =
        positionSizing === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Eval,
                  positionSizing.instrument.isMicro,
                  plan.tierProfitContext(plan.initialState()),
              );

    const memo = new Map<number, number>();
    const policy = new Map<number, number[][]>();

    const cushionKeyRadix = cushionBucketCount + 1;
    const profitLikeKeyRadix =
        Math.ceil(maxTrackedProfitLike / profitStepDollars) + 2;
    const idleKeyRadix =
        (plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval) ?? 0) + 1;
    const tradingKeyRadix = plan.minTradingDays + 1;
    const peakRatchet = plan.peakRatchetFor(TradingPhase.Eval, null);

    function outerKey(state: OuterState): number {
        const cushionIndex = Math.round(state.cushion / cushionStepDollars);
        const offsetIndex = Math.round(
            state.thresholdOffset / profitStepDollars,
        );
        const bestDayIndex = Math.round(state.bestDay / profitStepDollars);
        return (
            ((((((state.day * cushionKeyRadix + cushionIndex) *
                profitLikeKeyRadix +
                offsetIndex) *
                profitLikeKeyRadix +
                bestDayIndex) *
                idleKeyRadix +
                state.idleDays) *
                tradingKeyRadix +
                state.tradingDays) *
                peakRatchet.radix +
                state.peakBand) *
                2 +
            (state.isLocked ? 1 : 0)
        );
    }

    function resolveThreshold(
        isLocked: boolean,
        thresholdOffset: number,
    ): number {
        if (!isLocked) return initialThreshold + thresholdOffset;
        if (!lock) {
            throw new Error(
                `${plan.label}: thresholdLocked is true but eval drawdown has no lock config`,
            );
        }
        return lock.lockedThreshold(plan.accountSize);
    }

    function applyContractCap(action: number): number {
        return positionSizing === null
            ? action
            : capRiskToContractLimit(action, positionSizing, contractLimit);
    }

    const candidateRisksByBudget = new Map<number, readonly number[]>();

    function candidateRisks(budget: number): readonly number[] {
        const cached = candidateRisksByBudget.get(budget);
        if (cached !== undefined) return cached;
        const risks = new Set<number>([0]);
        for (const action of actionGrid) {
            const capped = applyContractCap(action);
            const risk = resolveTradeRisk(capped, budget, rungSizing);
            risks.add(Math.max(0, risk));
        }
        const computed = [...risks];
        candidateRisksByBudget.set(budget, computed);
        return computed;
    }

    function cushionBucketIndex(cushion: number): number {
        const raw = Math.floor(cushion / cushionStepDollars);
        return Math.min(cushionBucketCount - 1, Math.max(0, raw));
    }

    function risksAt(
        dayStartState: AccountState,
        cushionNow: number,
        pnlSoFarNow: number,
    ): readonly number[] {
        return candidateRisks(
            plan.affordableRisk(
                {
                    ...dayStartState,
                    balance: dayStartState.threshold + cushionNow,
                    todayPnL: pnlSoFarNow,
                },
                TradingPhase.Eval,
                commission,
            ),
        );
    }

    function lookupGrid(
        table: readonly number[],
        exactCushion: number,
    ): number {
        return table[cushionBucketIndex(exactCushion)] ?? 0;
    }

    function bucketOuterState(
        state: AccountState,
        cushion: number,
    ): {
        bestDay: number;
        cushion: number;
        idleDays: number;
        peakBand: number;
        thresholdOffset: number;
        tradingDays: number;
    } {
        return {
            bestDay: isTrackingConsistency
                ? ceilStep(
                      clampRange(state.bestDayProfit, maxTrackedProfitLike),
                      profitStepDollars,
                  )
                : 0,
            cushion: floorStep(
                clampRange(cushion, maxTrackedProfitLike),
                cushionStepDollars,
            ),
            idleDays: plan.clampedIdleDays(state, TradingPhase.Eval),
            peakBand: peakRatchet.bandOf(state.peakDayCloseProfit),
            thresholdOffset: state.thresholdLocked
                ? 0
                : floorStep(
                      clampRange(
                          state.threshold - initialThreshold,
                          maxTrackedProfitLike,
                      ),
                      profitStepDollars,
                  ),
            tradingDays: plan.clampedTradingDays(state),
        };
    }

    function onDayComplete(
        cushionAtEnd: number,
        pnlAtEnd: number,
        dayStartState: AccountState,
        day: number,
        wasIdleToday: boolean,
    ): number {
        const state: AccountState = {
            ...dayStartState,
            balance: dayStartState.threshold + cushionAtEnd,
            todayPnL: pnlAtEnd,
        };
        drawdown.onDayClose(state);
        plan.recordDayClosePeak(state);
        if (plan.isBust(state, TradingPhase.Eval)) {
            return terminalValueAtFail(day + 1);
        }

        const idleDaysAtEnd = wasIdleToday
            ? dayStartState.consecutiveIdleDays + 1
            : 0;
        const maxConsecutiveIdleDays = plan.maxConsecutiveIdleDaysFor(
            TradingPhase.Eval,
        );
        if (
            maxConsecutiveIdleDays !== null &&
            idleDaysAtEnd >= maxConsecutiveIdleDays
        ) {
            return terminalValueAtFail(day + 1);
        }
        state.consecutiveIdleDays = idleDaysAtEnd;

        state.bestDayProfit = Math.max(dayStartState.bestDayProfit, pnlAtEnd);
        state.tradingDays = wasIdleToday
            ? dayStartState.tradingDays
            : dayStartState.tradingDays + 1;

        if (plan.isPassed(state)) return terminalValueAtPass;

        const {
            bestDay: bestDayNext,
            cushion: cushionNext,
            idleDays: idleDaysNext,
            peakBand: peakBandNext,
            thresholdOffset: thresholdOffsetNext,
            tradingDays: tradingDaysNext,
        } = bucketOuterState(state, state.balance - state.threshold);

        return dayCloseValue({
            bestDay: bestDayNext,
            cushion: cushionNext,
            day: day + 1,
            idleDays: idleDaysNext,
            isLocked: state.thresholdLocked,
            peakBand: peakBandNext,
            thresholdOffset: thresholdOffsetNext,
            tradingDays: tradingDaysNext,
        });
    }

    function continuationValue(
        cushionExact: number,
        pnlSoFarExact: number,
        pnlDelta: number,
        hasWonThisTrade: boolean,
        dayStartState: AccountState,
        day: number,
        nextTable: readonly number[],
    ): number {
        if (cushionExact <= 0) return terminalValueAtFail(day + 1);
        const state: AccountState = {
            ...dayStartState,
            balance: dayStartState.threshold + cushionExact,
            todayPnL: pnlSoFarExact,
        };
        drawdown.onTrade(state, pnlDelta);
        if (plan.isBust(state, TradingPhase.Eval)) {
            return terminalValueAtFail(day + 1);
        }
        if (plan.isDayLockedOut(state, TradingPhase.Eval)) {
            return onDayComplete(
                cushionExact,
                pnlSoFarExact,
                dayStartState,
                day,
                false,
            );
        }
        return shouldStopDay(stopRule, hasWonThisTrade, 0, pnlSoFarExact)
            ? onDayComplete(
                  cushionExact,
                  pnlSoFarExact,
                  dayStartState,
                  day,
                  false,
              )
            : lookupGrid(nextTable, cushionExact);
    }

    function valueOfRisk(
        risk: number,
        cushionNow: number,
        pnlSoFarNow: number,
        dayStartState: AccountState,
        day: number,
        nextTable: readonly number[],
    ): number {
        const pnlWin = rrRatio * risk - commission;
        const valueWin = continuationValue(
            cushionNow + pnlWin,
            pnlSoFarNow + pnlWin,
            pnlWin,
            true,
            dayStartState,
            day,
            nextTable,
        );
        const pnlLose = -risk - commission;
        const valueLose = continuationValue(
            cushionNow + pnlLose,
            pnlSoFarNow + pnlLose,
            pnlLose,
            false,
            dayStartState,
            day,
            nextTable,
        );
        return winrate * valueWin + (1 - winrate) * valueLose;
    }

    function bestActionAt(
        cushionNow: number,
        pnlSoFarNow: number,
        dayStartState: AccountState,
        day: number,
        tradeIndex: number,
        nextTable: readonly number[],
        stopValue: number,
        risksAtCushionNow: readonly number[],
    ): { bestAction: number; bestValue: number } {
        let bestValue = -Infinity;
        let bestAction = 0;
        for (const risk of risksAtCushionNow) {
            const value =
                risk <= 0
                    ? tradeIndex === 0
                        ? onDayComplete(
                              cushionNow,
                              pnlSoFarNow,
                              dayStartState,
                              day,
                              true,
                          )
                        : stopValue
                    : valueOfRisk(
                          risk,
                          cushionNow,
                          pnlSoFarNow,
                          dayStartState,
                          day,
                          nextTable,
                      );
            if (value <= bestValue) {
                continue;
            }
            bestValue = value;
            bestAction = risk;
        }
        return { bestAction, bestValue };
    }

    function solveDayGrid(
        dayStartState: AccountState,
        day: number,
        cushionAtDayStart: number,
    ): { policyTables: number[][]; value: number } {
        const stopTable: number[] = Array.from(
            { length: cushionBucketCount },
            (_, index) => {
                const cushionEnd = index * cushionStepDollars;
                const pnlEnd = cushionEnd - cushionAtDayStart;
                return onDayComplete(
                    cushionEnd,
                    pnlEnd,
                    dayStartState,
                    day,
                    false,
                );
            },
        );

        const risksByIndex = Array.from(
            { length: cushionBucketCount },
            (_, index) => {
                const cushionNow = index * cushionStepDollars;
                return risksAt(
                    dayStartState,
                    cushionNow,
                    cushionNow - cushionAtDayStart,
                );
            },
        );

        let nextTable: number[] = stopTable;
        const policyTables: number[][] = [];
        for (let tradeIndex = slots - 1; tradeIndex >= 0; tradeIndex--) {
            const currentTable: number[] = Array.from(
                { length: cushionBucketCount },
                () => 0,
            );
            const currentPolicy: number[] = Array.from(
                { length: cushionBucketCount },
                () => 0,
            );
            for (let index = 0; index < cushionBucketCount; index++) {
                const cushionNow = index * cushionStepDollars;
                const pnlSoFarNow = cushionNow - cushionAtDayStart;
                const { bestAction, bestValue } = bestActionAt(
                    cushionNow,
                    pnlSoFarNow,
                    dayStartState,
                    day,
                    tradeIndex,
                    nextTable,
                    stopTable[index] ?? 0,
                    risksByIndex[index] ?? [0],
                );
                currentTable[index] = bestValue;
                currentPolicy[index] = bestAction;
            }
            policyTables[tradeIndex] = currentPolicy;
            nextTable = currentTable;
        }

        return {
            policyTables,
            value: lookupGrid(nextTable, cushionAtDayStart),
        };
    }

    function dayCloseValue(outerState: OuterState): number {
        const {
            bestDay,
            cushion,
            day,
            idleDays,
            isLocked,
            peakBand,
            thresholdOffset,
            tradingDays,
        } = outerState;
        const key = outerKey(outerState);
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        if (day >= dayCap) {
            const timeoutValue = terminalValueAtFail(day);
            memo.set(key, timeoutValue);
            return timeoutValue;
        }

        const threshold = resolveThreshold(isLocked, thresholdOffset);
        const dayStartState: AccountState = {
            balance: threshold + cushion,
            bestDayProfit: bestDay,
            consecutiveIdleDays: idleDays,
            elapsedDays: day,
            intradayHighProfit: peakRatchet.peakAt(peakBand),
            peakDayCloseProfit: peakRatchet.peakAt(peakBand),
            peakIntradayProfit: peakRatchet.peakAt(peakBand),
            qualifyingDays: 0,
            startingBalance: plan.accountSize,
            threshold,
            thresholdLocked: isLocked,
            todayPnL: 0,
            tradingDays,
        };

        const { policyTables, value } = solveDayGrid(
            dayStartState,
            day,
            cushion,
        );

        const charged = value - dayCost(day);
        memo.set(key, charged);
        policy.set(key, policyTables);
        return charged;
    }

    const initialState = plan.initialState();
    const initialCushion = floorStep(
        initialState.balance - initialState.threshold,
        cushionStepDollars,
    );
    const initialValue = dayCloseValue({
        bestDay: 0,
        cushion: initialCushion,
        day: 0,
        idleDays: 0,
        isLocked: false,
        peakBand: 0,
        thresholdOffset: 0,
        tradingDays: 0,
    });

    function dayStartKey(state: AccountState, day: number): number {
        const dayStart = lastDayCloseOf(state);
        return outerKey({
            ...bucketOuterState(
                dayStart,
                dayStart.balance - dayStart.threshold,
            ),
            day,
            isLocked: state.thresholdLocked,
        });
    }

    function riskFromTables(
        policyTables: readonly (readonly number[])[],
        state: AccountState,
        tradeIndexToday: number,
    ): number {
        return (
            policyTables[tradeIndexToday]?.[
                cushionBucketIndex(state.balance - state.threshold)
            ] ?? 0
        );
    }

    function computeRisk(state: AccountState, tradeIndexToday: number): number {
        const policyTables = policy.get(
            dayStartKey(state, state.elapsedDays ?? 0),
        );
        return policyTables
            ? riskFromTables(policyTables, state, tradeIndexToday)
            : 0;
    }

    function riskAtReachedState(
        state: AccountState,
        tradeIndexToday: number,
    ): null | number {
        const day = state.elapsedDays;
        if (day === undefined || !Number.isSafeInteger(day) || day < 0) {
            throw new Error(
                `${plan.label}: riskAtReachedState needs the state's elapsedDays (the eval DP day index) as a non-negative integer, got ${String(day)}`,
            );
        }
        if (!Number.isSafeInteger(tradeIndexToday) || tradeIndexToday < 0) {
            throw new Error(
                `${plan.label}: riskAtReachedState needs a non-negative integer trade index, got ${String(tradeIndexToday)}`,
            );
        }
        if (
            plan.isBust(state, TradingPhase.Eval) ||
            plan.isPassed(lastDayCloseOf(state))
        ) {
            return null;
        }
        const policyTables = policy.get(dayStartKey(state, day));
        return policyTables === undefined
            ? null
            : riskFromTables(policyTables, state, tradeIndexToday);
    }

    const dayPolicy = computedDayPolicy(
        computeRisk,
        slots,
        stopRule,
        PolicySizing.ContractCapped,
    );

    return {
        dayPolicy,
        initialValue,
        reachedStateCount: memo.size,
        riskAtReachedState,
    };
}

export function isDrawdownDpEligible(kind: DrawdownKind): boolean {
    switch (kind) {
        case DrawdownKind.EodTrailing:
        case DrawdownKind.Static: {
            return true;
        }
        case DrawdownKind.IntradayTrailing: {
            return false;
        }
    }
}

export function isEvalDpEligible(plan: Plan): boolean {
    const drawdown = plan.drawdownFor(TradingPhase.Eval);
    return (
        isDrawdownDpEligible(drawdown.kind) &&
        !hasPeakShareDependency(
            describeDailyLossLimit(plan.evalDailyLossLimit),
        ) &&
        plan.peakIntradayBreakpoints(TradingPhase.Eval, null).length === 0
    );
}

function ceilStep(value: number, step: number): number {
    return step <= 0 ? value : Math.ceil(value / step) * step;
}

function clampRange(value: number, max: number): number {
    return value < 0 ? 0 : Math.min(value, max);
}

function floorStep(value: number, step: number): number {
    return step <= 0 ? value : Math.floor(value / step) * step;
}

function lastDayCloseOf(state: AccountState): AccountState {
    return { ...state, balance: state.balance - state.todayPnL, todayPnL: 0 };
}
