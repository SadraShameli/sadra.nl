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
    PNL_ONLY_STOP_RULE_KINDS,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
} from './DayPolicy';
import { DrawdownKind } from './DrawdownStrategy';
import { type Plan } from './Plan';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolveContractLimit,
} from './PositionSizing';
import { TradingPhase } from './TradingPhase';
import {
    type ContractCount,
    dollars,
    type Dollars,
    type Fraction0to1,
} from './units';

export interface EvalStateValueConfig {
    readonly actionStepDollars?: number;
    readonly commission?: Dollars;
    readonly cushionStepDollars?: number;
    readonly maxActionDollars?: number;
    readonly maxEvalDays: number;
    readonly plan: Plan;
    readonly positionSizing?: null | PositionSizingConfig;
    readonly profitStepDollars?: number;
    readonly rrRatio: number;
    readonly rungSizing?: RungSizing;
    readonly stopRule?: DayStopRule;
    readonly terminalValueAtPass?: number;
    readonly tradesPerDay?: number;
    readonly winrate: Fraction0to1;
}

export interface EvalStateValueResult {
    readonly dayPolicy: DayPolicy;
    readonly initialValue: number;
    readonly reachedStateCount: number;
}

const DEFAULT_ACTION_STEP_DOLLARS = 50;
const DEFAULT_CUSHION_STEP_DOLLARS = 100;
const DEFAULT_PROFIT_STEP_DOLLARS = 300;
const DEFAULT_TERMINAL_VALUE_AT_PASS = 1;
const DEFAULT_TRADES_PER_DAY = 4;

export function computeEvalStateValue(
    config: EvalStateValueConfig,
): EvalStateValueResult {
    const { plan } = config;
    if (!isEvalDpEligible(plan)) {
        throw new Error(
            `${plan.label}: not eligible for EvalStateValue DP (call isEvalDpEligible first) — either its eval drawdown is intraday-trailing or its eval daily loss limit depends on peak-day-close profit`,
        );
    }

    const stopRule: DayStopRule = config.stopRule ?? {
        kind: DayStopRuleKind.None,
    };
    if (!PNL_ONLY_STOP_RULE_KINDS[stopRule.kind]) {
        throw new Error(
            `${plan.label}: EvalStateValue's cushion-gridded within-day solve only supports stop rules whose trigger depends solely on today's running P&L (none/day-green/after-target) — "${stopRule.kind}" depends on the day's loss/win sequence, which the grid does not track per-bucket`,
        );
    }

    const drawdown = plan.drawdownFor(TradingPhase.Eval);
    const lock = drawdown.lock;
    const initialThreshold = drawdown.initialThreshold(plan.accountSize);
    const isTrackingConsistency = plan.evalConsistencyRule() !== null;
    const dayCap = plan.evalDayCap(config.maxEvalDays);

    const rrRatio = config.rrRatio;
    const winrate = config.winrate;
    const commission = config.commission ?? dollars(0);
    const rungSizing = config.rungSizing ?? DEFAULT_RUNG_SIZING;
    const slots = Math.max(
        1,
        Math.floor(config.tradesPerDay ?? DEFAULT_TRADES_PER_DAY),
    );
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
        plan.profitTarget +
        drawdown.amount +
        maxActionDollars * Math.max(1, rrRatio);
    const cushionBucketCount =
        Math.round(maxTrackedProfitLike / cushionStepDollars) + 1;
    const contractLimit: ContractCount | null =
        positionSizing === null
            ? null
            : resolveContractLimit(
                  plan.contractLimits,
                  TradingPhase.Eval,
                  positionSizing.instrument.isMicro,
                  0,
              );

    const memo = new Map<string, number>();
    const policy = new Map<string, number[][]>();

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

    function candidateRisks(cushionNow: number): number[] {
        const risks = new Set<number>([0]);
        for (const action of actionGrid) {
            const capped = applyContractCap(action);
            const risk = resolveTradeRisk(capped, cushionNow, rungSizing);
            risks.add(Math.max(0, risk));
        }
        return [...risks];
    }

    function cushionBucketIndex(cushion: number): number {
        const raw = Math.floor(cushion / cushionStepDollars);
        return Math.min(cushionBucketCount - 1, Math.max(0, raw));
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
    ): { bestDay: number; cushion: number; thresholdOffset: number } {
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
            thresholdOffset: state.thresholdLocked
                ? 0
                : floorStep(
                      clampRange(
                          state.threshold - initialThreshold,
                          maxTrackedProfitLike,
                      ),
                      profitStepDollars,
                  ),
        };
    }

    function onDayComplete(
        cushionAtEnd: number,
        pnlAtEnd: number,
        dayStartState: AccountState,
        day: number,
    ): number {
        const state: AccountState = {
            ...dayStartState,
            balance: dayStartState.threshold + cushionAtEnd,
            todayPnL: pnlAtEnd,
        };
        drawdown.onDayClose(state);
        plan.recordDayClosePeak(state);
        if (plan.isBust(state, TradingPhase.Eval)) return 0;

        state.bestDayProfit = Math.max(dayStartState.bestDayProfit, pnlAtEnd);
        state.tradingDays = day + 1;

        if (plan.isPassed(state)) return terminalValueAtPass;

        const {
            bestDay: bestDayNext,
            cushion: cushionNext,
            thresholdOffset: thresholdOffsetNext,
        } = bucketOuterState(state, state.balance - state.threshold);

        return dayCloseValue(
            day + 1,
            cushionNext,
            thresholdOffsetNext,
            bestDayNext,
            state.thresholdLocked,
        );
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
        if (cushionExact <= 0) return 0;
        const state: AccountState = {
            ...dayStartState,
            balance: dayStartState.threshold + cushionExact,
            todayPnL: pnlSoFarExact,
        };
        drawdown.onTrade(state, pnlDelta);
        if (plan.isBust(state, TradingPhase.Eval)) return 0;
        if (plan.isDayLockedOut(state, TradingPhase.Eval)) {
            return onDayComplete(
                cushionExact,
                pnlSoFarExact,
                dayStartState,
                day,
            );
        }
        return shouldStopDay(stopRule, hasWonThisTrade, 0, pnlSoFarExact)
            ? onDayComplete(cushionExact, pnlSoFarExact, dayStartState, day)
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
        nextTable: readonly number[],
    ): { bestAction: number; bestValue: number } {
        let bestValue = -Infinity;
        let bestAction = 0;
        for (const risk of candidateRisks(cushionNow)) {
            const value =
                risk <= 0
                    ? onDayComplete(cushionNow, pnlSoFarNow, dayStartState, day)
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
        let nextTable: number[] = Array.from(
            { length: cushionBucketCount },
            () => 0,
        );
        for (let index = 0; index < cushionBucketCount; index++) {
            const cushionEnd = index * cushionStepDollars;
            const pnlEnd = cushionEnd - cushionAtDayStart;
            nextTable[index] = onDayComplete(
                cushionEnd,
                pnlEnd,
                dayStartState,
                day,
            );
        }

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
                    nextTable,
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

    function dayCloseValue(
        day: number,
        cushion: number,
        thresholdOffset: number,
        bestDay: number,
        isLocked: boolean,
    ): number {
        const key = outerKey(day, cushion, thresholdOffset, bestDay, isLocked);
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        if (day >= dayCap) {
            memo.set(key, 0);
            return 0;
        }

        const threshold = resolveThreshold(isLocked, thresholdOffset);
        const dayStartState: AccountState = {
            balance: threshold + cushion,
            bestDayProfit: bestDay,
            consecutiveIdleDays: 0,
            peakDayCloseProfit: 0,
            qualifyingDays: 0,
            startingBalance: plan.accountSize,
            threshold,
            thresholdLocked: isLocked,
            todayPnL: 0,
            tradingDays: day,
        };

        const { policyTables, value } = solveDayGrid(
            dayStartState,
            day,
            cushion,
        );

        memo.set(key, value);
        policy.set(key, policyTables);
        return value;
    }

    const initialState = plan.initialState();
    const initialCushion = floorStep(
        initialState.balance - initialState.threshold,
        cushionStepDollars,
    );
    const initialValue = dayCloseValue(0, initialCushion, 0, 0, false);

    function computeRisk(state: AccountState, tradeIndexToday: number): number {
        const day = state.tradingDays;
        const todayPnL = state.todayPnL;
        const cushionAtDayStart = state.balance - state.threshold - todayPnL;
        const {
            bestDay: bestDayBucket,
            cushion: cushionBucket,
            thresholdOffset: thresholdOffsetBucket,
        } = bucketOuterState(state, cushionAtDayStart);
        const key = outerKey(
            day,
            cushionBucket,
            thresholdOffsetBucket,
            bestDayBucket,
            state.thresholdLocked,
        );
        const policyTables = policy.get(key);
        if (!policyTables) return 0;
        const currentCushion = state.balance - state.threshold;
        return (
            policyTables[tradeIndexToday]?.[
                cushionBucketIndex(currentCushion)
            ] ?? 0
        );
    }

    const dayPolicy = computedDayPolicy(computeRisk, slots, stopRule);

    return {
        dayPolicy,
        initialValue,
        reachedStateCount: memo.size,
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
        !hasPeakShareDependency(describeDailyLossLimit(plan.evalDailyLossLimit))
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

function outerKey(
    day: number,
    cushion: number,
    thresholdOffset: number,
    bestDay: number,
    isLocked: boolean,
): string {
    return `${day}|${cushion}|${thresholdOffset}|${bestDay}|${isLocked ? 1 : 0}`;
}
