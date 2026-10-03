import { type AccountState } from './AccountState';
import { ConsistencyViolationEffect } from './ConsistencyRule';
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
    PNL_ONLY_STOP_RULE_KINDS,
    PolicySizing,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './DayPolicy';
import { DrawdownKind } from './DrawdownStrategy';
import {
    centsOf,
    EvalDayTopology,
    EvalTradeOutcomeKind,
    type EvalTradeResult,
} from './EvalDayTopology';
import {
    type CushionGridSplit,
    type FundedCushionGrid,
} from './FundedCushionGrid';
import {
    CENTS_PER_DOLLAR,
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

export type { CushionGridSplit } from './FundedCushionGrid';

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
    readonly policyPassProbability: () => number;
    readonly reachedStateCount: number;
    readonly riskAtReachedState: (
        state: AccountState,
        tradeIndexToday: number,
    ) => null | number;
}

interface DayBuffers {
    readonly nodeValues: Float64Array;
    readonly stopValues: Float64Array;
}

interface DayRecursion {
    readonly decisions: readonly Map<number, number>[];
    readonly outerState: null | OuterState;
    readonly stops: Map<number, number>;
}

type EvalPolicyOracle = (
    outerState: OuterState,
    tradeIndex: number,
    cushionNow: number,
    pnlSoFarNow: number,
) => number;

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

interface ReplayDay {
    readonly dayStartState: AccountState;
    readonly recursion: DayRecursion;
}

const DEFAULT_ACTION_STEP_DOLLARS = 50;
const DEFAULT_PROFIT_STEP_DOLLARS = 300;
const DEFAULT_TERMINAL_VALUE_AT_FAIL = 0;
const DEFAULT_TERMINAL_VALUE_AT_PASS = 1;
const DEFAULT_TRADES_PER_DAY = 4;
const MAX_REPLAY_DAYS_CACHED = 4096;

export function computeEvalStateValue(
    config: EvalStateValueConfig,
): EvalStateValueResult {
    return solveEvalDp(config, null);
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

export function splitOntoCushionGrid(
    cushionDollars: number,
    grid: FundedCushionGrid,
    bucketCount: number = grid.size,
): CushionGridSplit {
    return grid.split(cushionDollars, bucketCount);
}

export function valueOnCushionGrid(
    split: CushionGridSplit,
    valueAt: (index: number) => number,
): number {
    const lowerValue = valueAt(split.lowerIndex);
    return split.upperWeight === 0
        ? lowerValue
        : (1 - split.upperWeight) * lowerValue +
              split.upperWeight * valueAt(split.lowerIndex + 1);
}

function ceilStep(dollarAmount: number, stepDollars: number): number {
    const stepCents = centsOf(stepDollars);
    return stepCents <= 0
        ? dollarAmount
        : (Math.ceil(centsOf(dollarAmount) / stepCents) * stepCents) /
              CENTS_PER_DOLLAR;
}

function clampRange(value: number, max: number): number {
    return value < 0 ? 0 : Math.min(value, max);
}

function lastDayCloseOf(state: AccountState): AccountState {
    return { ...state, balance: state.balance - state.todayPnL, todayPnL: 0 };
}

function outerKey(state: OuterState): string {
    return [
        state.day,
        centsOf(state.cushion),
        centsOf(state.thresholdOffset),
        centsOf(state.bestDay),
        state.idleDays,
        state.tradingDays,
        state.peakBand,
        state.isLocked ? 1 : 0,
    ].join(':');
}

function solveEvalDp(
    config: EvalStateValueConfig,
    policyOracle: EvalPolicyOracle | null,
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
    const untrackedCeiling =
        plan.profitTarget +
        drawdown.amount +
        maxActionDollars * Math.max(1, rrRatio);
    const maxTrackedProfitLike = canDoubleTarget
        ? untrackedCeiling * 2
        : untrackedCeiling;
    const contractLimit: ContractCount | null =
        positionSizing === null
            ? null
            : contractLimitAt(
                  plan.contractLimits,
                  TradingPhase.Eval,
                  positionSizing.instrument.isMicro,
                  plan.tierProfitContext(plan.initialState()),
              );

    const memo = new Map<string, number>();
    const replayDays = new Map<string, ReplayDay>();
    const dayTopologies = new Map<number, EvalDayTopology>();
    const dayBuffers: DayBuffers[] = [];
    const isTopologySolve =
        policyOracle === null &&
        stopRule.kind === DayStopRuleKind.None &&
        plan.dailyLossLimitFor(TradingPhase.Eval).kind ===
            DailyLossLimitKind.None;
    let scratchState: AccountState | null = null;
    let scratchOwner: AccountState | null = null;

    function scratchStateAt(
        dayStartState: AccountState,
        balance: number,
        todayPnL: number,
    ): AccountState {
        if (scratchState === null || scratchOwner !== dayStartState) {
            scratchState = { ...dayStartState };
            scratchOwner = dayStartState;
        }
        scratchState.balance = balance;
        scratchState.todayPnL = todayPnL;
        return scratchState;
    }

    const peakRatchet = plan.peakRatchetFor(TradingPhase.Eval, null);

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

    function risksAt(
        dayStartState: AccountState,
        cushionNow: number,
        pnlSoFarNow: number,
    ): readonly number[] {
        return candidateRisks(
            plan.affordableRisk(
                scratchStateAt(
                    dayStartState,
                    dayStartState.threshold + cushionNow,
                    pnlSoFarNow,
                ),
                TradingPhase.Eval,
                commission,
            ),
        );
    }

    function trackedOuterState(
        state: AccountState,
        day: number,
        isBestDayBucketed: boolean,
    ): OuterState {
        const trackedBestDay = clampRange(
            state.bestDayProfit,
            maxTrackedProfitLike,
        );
        return {
            bestDay: isTrackingConsistency
                ? isBestDayBucketed
                    ? ceilStep(trackedBestDay, profitStepDollars)
                    : trackedBestDay
                : 0,
            cushion: clampRange(
                state.balance - state.threshold,
                maxTrackedProfitLike,
            ),
            day,
            idleDays: plan.clampedIdleDays(state, TradingPhase.Eval),
            isLocked: state.thresholdLocked,
            peakBand: peakRatchet.bandOf(state.peakDayCloseProfit),
            thresholdOffset: state.thresholdLocked
                ? 0
                : clampRange(
                      state.threshold - initialThreshold,
                      maxTrackedProfitLike,
                  ),
            tradingDays: plan.clampedTradingDays(state),
        };
    }

    function dayStartStateOf(outerState: OuterState): AccountState {
        const threshold = resolveThreshold(
            outerState.isLocked,
            outerState.thresholdOffset,
        );
        return {
            balance: threshold + outerState.cushion,
            bestDayProfit: outerState.bestDay,
            consecutiveIdleDays: outerState.idleDays,
            elapsedDays: outerState.day,
            intradayHighProfit: peakRatchet.peakAt(outerState.peakBand),
            peakDayCloseProfit: peakRatchet.peakAt(outerState.peakBand),
            peakIntradayProfit: peakRatchet.peakAt(outerState.peakBand),
            qualifyingDays: 0,
            startingBalance: plan.accountSize,
            threshold,
            thresholdLocked: outerState.isLocked,
            todayPnL: 0,
            tradingDays: outerState.tradingDays,
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

        return plan.isPassed(state)
            ? terminalValueAtPass
            : dayCloseValue(trackedOuterState(state, day + 1, true));
    }

    function newDayRecursion(outerState: null | OuterState): DayRecursion {
        return {
            decisions: Array.from({ length: slots }, () => new Map()),
            outerState,
            stops: new Map(),
        };
    }

    function exactStopAt(
        cushion: number,
        pnl: number,
        wasIdle: boolean,
        dayStartState: AccountState,
        day: number,
        recursion: DayRecursion,
    ): number {
        const key = centsOf(cushion) * 2 + (wasIdle ? 1 : 0);
        const cached = recursion.stops.get(key);
        if (cached !== undefined) return cached;
        const value = onDayComplete(cushion, pnl, dayStartState, day, wasIdle);
        recursion.stops.set(key, value);
        return value;
    }

    function outcomeAfterTrade(
        dayStartState: AccountState,
        trade: EvalTradeResult,
    ): EvalTradeOutcomeKind {
        const state = scratchStateAt(
            dayStartState,
            dayStartState.threshold + trade.cushion,
            trade.pnl,
        );
        drawdown.onTrade(state, trade.pnlDelta);
        if (plan.isBust(state, TradingPhase.Eval)) {
            return EvalTradeOutcomeKind.Fail;
        }
        return trade.nextTradeIndex >= slots ||
            plan.isDayLockedOut(state, TradingPhase.Eval) ||
            shouldStopDay(stopRule, trade.hasWon, 0, trade.pnl)
            ? EvalTradeOutcomeKind.Stop
            : EvalTradeOutcomeKind.Decide;
    }

    function continuationValue(
        cushionExact: number,
        pnlSoFarExact: number,
        pnlDelta: number,
        hasWonThisTrade: boolean,
        dayStartState: AccountState,
        day: number,
        nextTradeIndex: number,
        recursion: DayRecursion,
    ): number {
        if (cushionExact <= 0) return terminalValueAtFail(day + 1);
        switch (
            outcomeAfterTrade(dayStartState, {
                cushion: cushionExact,
                hasWon: hasWonThisTrade,
                nextTradeIndex,
                pnl: pnlSoFarExact,
                pnlDelta,
            })
        ) {
            case EvalTradeOutcomeKind.Decide: {
                return decisionValueAt(
                    nextTradeIndex,
                    cushionExact,
                    pnlSoFarExact,
                    dayStartState,
                    day,
                    recursion,
                );
            }
            case EvalTradeOutcomeKind.Fail: {
                return terminalValueAtFail(day + 1);
            }
            case EvalTradeOutcomeKind.Stop: {
                return exactStopAt(
                    cushionExact,
                    pnlSoFarExact,
                    false,
                    dayStartState,
                    day,
                    recursion,
                );
            }
        }
    }

    function valueOfRisk(
        risk: number,
        cushionNow: number,
        pnlSoFarNow: number,
        dayStartState: AccountState,
        day: number,
        tradeIndex: number,
        recursion: DayRecursion,
    ): number {
        const pnlWin = rrRatio * risk - commission;
        const valueWin = continuationValue(
            cushionNow + pnlWin,
            pnlSoFarNow + pnlWin,
            pnlWin,
            true,
            dayStartState,
            day,
            tradeIndex + 1,
            recursion,
        );
        const pnlLose = -risk - commission;
        const valueLose = continuationValue(
            cushionNow + pnlLose,
            pnlSoFarNow + pnlLose,
            pnlLose,
            false,
            dayStartState,
            day,
            tradeIndex + 1,
            recursion,
        );
        return winrate * valueWin + (1 - winrate) * valueLose;
    }

    function bestActionAt(
        cushionNow: number,
        pnlSoFarNow: number,
        dayStartState: AccountState,
        day: number,
        tradeIndex: number,
        recursion: DayRecursion,
    ): { bestAction: number; bestValue: number } {
        const valueOf = (risk: number): number =>
            risk <= 0
                ? exactStopAt(
                      cushionNow,
                      pnlSoFarNow,
                      tradeIndex === 0,
                      dayStartState,
                      day,
                      recursion,
                  )
                : valueOfRisk(
                      risk,
                      cushionNow,
                      pnlSoFarNow,
                      dayStartState,
                      day,
                      tradeIndex,
                      recursion,
                  );
        if (policyOracle !== null && recursion.outerState !== null) {
            const policyRisk = policyOracle(
                recursion.outerState,
                tradeIndex,
                cushionNow,
                pnlSoFarNow,
            );
            return { bestAction: policyRisk, bestValue: valueOf(policyRisk) };
        }
        let bestValue = -Infinity;
        let bestAction = 0;
        for (const risk of risksAt(dayStartState, cushionNow, pnlSoFarNow)) {
            const value = valueOf(risk);
            if (value <= bestValue) {
                continue;
            }
            bestValue = value;
            bestAction = risk;
        }
        return { bestAction, bestValue };
    }

    function decisionValueAt(
        tradeIndex: number,
        cushionNow: number,
        pnlSoFarNow: number,
        dayStartState: AccountState,
        day: number,
        recursion: DayRecursion,
    ): number {
        const memoized = recursion.decisions[tradeIndex];
        if (memoized === undefined) {
            throw new Error(
                `${plan.label}: decision recursion has no memo for trade index ${tradeIndex}`,
            );
        }
        const key = centsOf(cushionNow);
        const cached = memoized.get(key);
        if (cached !== undefined) return cached;
        const { bestValue } = bestActionAt(
            cushionNow,
            pnlSoFarNow,
            dayStartState,
            day,
            tradeIndex,
            recursion,
        );
        memoized.set(key, bestValue);
        return bestValue;
    }

    function dayBuffersAt(day: number, topology: EvalDayTopology): DayBuffers {
        const known = dayBuffers[day];
        if (
            known !== undefined &&
            known.stopValues.length >= topology.stopCount &&
            known.nodeValues.length >= topology.nodeCount
        ) {
            return known;
        }
        const grown: DayBuffers = {
            nodeValues: new Float64Array(
                Math.max(topology.nodeCount, known?.nodeValues.length ?? 0),
            ),
            stopValues: new Float64Array(
                Math.max(topology.stopCount, known?.stopValues.length ?? 0),
            ),
        };
        dayBuffers[day] = grown;
        return grown;
    }

    function topologyAt(cushion: number): EvalDayTopology {
        const known = dayTopologies.get(cushion);
        if (known !== undefined) return known;
        const dayStartState = dayStartStateOf({
            bestDay: 0,
            cushion,
            day: 0,
            idleDays: 0,
            isLocked: false,
            peakBand: 0,
            thresholdOffset: 0,
            tradingDays: 0,
        });
        const built = EvalDayTopology.build(cushion, {
            candidateRisks: (cushionNow, pnlNow) =>
                risksAt(dayStartState, cushionNow, pnlNow),
            commission,
            outcomeAfterTrade: (trade) =>
                outcomeAfterTrade(dayStartState, trade),
            rrRatio,
            slots,
        });
        dayTopologies.set(cushion, built);
        return built;
    }

    function topologyDayValue(outerState: OuterState): number {
        const { day } = outerState;
        const topology = topologyAt(outerState.cushion);
        const dayStartState = dayStartStateOf(outerState);
        const { nodeValues, stopValues } = dayBuffersAt(day, topology);
        for (let stop = 0; stop < topology.stopCount; stop++) {
            stopValues[stop] = onDayComplete(
                topology.stopCushions[stop] ?? 0,
                topology.stopPnls[stop] ?? 0,
                dayStartState,
                day,
                topology.stopWasIdle[stop] === 1,
            );
        }
        return topology.evaluate(
            stopValues,
            terminalValueAtFail(day + 1),
            winrate,
            nodeValues,
        );
    }

    function dayCloseValue(outerState: OuterState): number {
        const key = outerKey(outerState);
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        const { day } = outerState;
        if (day >= dayCap) {
            const timeoutValue = terminalValueAtFail(day);
            memo.set(key, timeoutValue);
            return timeoutValue;
        }

        const value = isTopologySolve
            ? topologyDayValue(outerState)
            : decisionValueAt(
                  0,
                  outerState.cushion,
                  0,
                  dayStartStateOf(outerState),
                  day,
                  newDayRecursion(outerState),
              );

        const charged = value - dayCost(day);
        memo.set(key, charged);
        return charged;
    }

    const initialState = plan.initialState();
    const initialValue = dayCloseValue({
        bestDay: 0,
        cushion: initialState.balance - initialState.threshold,
        day: 0,
        idleDays: 0,
        isLocked: false,
        peakBand: 0,
        thresholdOffset: 0,
        tradingDays: 0,
    });

    function replayDayOf(outerState: OuterState): ReplayDay {
        const key = outerKey(outerState);
        const cached = replayDays.get(key);
        if (cached !== undefined) return cached;
        if (replayDays.size >= MAX_REPLAY_DAYS_CACHED) replayDays.clear();
        const replayDay: ReplayDay = {
            dayStartState: dayStartStateOf(outerState),
            recursion: newDayRecursion(null),
        };
        replayDays.set(key, replayDay);
        return replayDay;
    }

    function replayRiskAt(
        outerState: OuterState,
        tradeIndexToday: number,
        cushionNow: number,
        pnlSoFarNow: number,
    ): number {
        if (tradeIndexToday >= slots || outerState.day >= dayCap) return 0;
        const { dayStartState, recursion } = replayDayOf(outerState);
        return bestActionAt(
            cushionNow,
            pnlSoFarNow,
            dayStartState,
            outerState.day,
            tradeIndexToday,
            recursion,
        ).bestAction;
    }

    function computeRisk(state: AccountState, tradeIndexToday: number): number {
        const day = state.elapsedDays ?? 0;
        const dayStart = lastDayCloseOf(state);
        return replayRiskAt(
            trackedOuterState(dayStart, day, false),
            tradeIndexToday,
            state.balance - state.threshold,
            state.todayPnL,
        );
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
        return plan.isBust(state, TradingPhase.Eval) ||
            plan.isPassed(lastDayCloseOf(state)) ||
            day >= dayCap
            ? null
            : computeRisk(state, tradeIndexToday);
    }

    let policyPassValue: number | undefined;

    function policyPassProbability(): number {
        if (policyOracle !== null) return initialValue;
        policyPassValue ??= solveEvalDp(
            {
                ...config,
                dayCost: () => 0,
                terminalValueAtFail: () => DEFAULT_TERMINAL_VALUE_AT_FAIL,
                terminalValueAtPass: DEFAULT_TERMINAL_VALUE_AT_PASS,
            },
            replayRiskAt,
        ).initialValue;
        return policyPassValue;
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
        policyPassProbability,
        reachedStateCount: memo.size,
        riskAtReachedState,
    };
}
