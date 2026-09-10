import { resetForNewDay } from '../core/AccountState';
import {
    type DayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
    resolveTradeRisk,
    shouldStopDay,
} from '../core/DayPolicy';
import {
    capRiskToContractLimit,
    resolveContractLimit,
} from '../core/PositionSizing';
import { TradingPhase } from '../core/TradingPhase';
import { type DayRunOptions, type SimInputs } from './types';

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: TradingPhase,
): DayPolicy {
    const declared =
        phase === TradingPhase.Eval
            ? inputs.evalDayPolicy
            : inputs.fundedDayPolicy;
    return (
        declared ??
        flatDayPolicy(
            inputs.riskPerTrade,
            inputs.tradesPerDay,
            inputs.dayStop ?? { kind: DayStopRuleKind.None },
        )
    );
}

export function runDay(options: DayRunOptions): {
    busted: boolean;
    closedForInactivity: boolean;
    traded: boolean;
} {
    const {
        commission,
        dayPolicy,
        idleDayProbability,
        phase,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    } = options;
    resetForNewDay(state);
    let isTraded = false;
    let lossesToday = 0;
    const drawdown = plan.drawdownFor(phase);

    const idleChance = idleDayProbability ?? 0;
    const isIdleToday =
        idleChance > 0 &&
        plan.maxConsecutiveIdleDays !== null &&
        rng() < idleChance;

    if (!isIdleToday) {
        for (const intendedRisk of dayPolicy.ladder) {
            const cushion = state.balance - state.threshold;
            const cushionCappedRisk = resolveTradeRisk(
                intendedRisk,
                cushion,
                rungSizing,
            );
            const risk =
                positionSizing === null
                    ? cushionCappedRisk
                    : capRiskToContractLimit(
                          cushionCappedRisk,
                          positionSizing,
                          resolveContractLimit(
                              plan.contractLimits,
                              phase,
                              positionSizing.instrument.isMicro,
                              plan.accountProfit(state),
                          ),
                      );
            if (risk <= 0) break;

            const isWon = rng() < winrate;
            const tradeGross = isWon ? rrRatio * risk : -risk;
            const pnl = tradeGross - commission;
            state.balance += pnl;
            state.todayPnL += pnl;
            isTraded = true;
            stats.recordTrade(isWon, pnl, state.balance);
            if (!isWon) lossesToday += 1;
            drawdown.onTrade(state, pnl);
            if (plan.isBust(state, phase)) {
                return {
                    busted: true,
                    closedForInactivity: false,
                    traded: isTraded,
                };
            }
            if (plan.isDayLockedOut(state, phase)) {
                break;
            }
            if (
                dayPolicy.maxLossesPerDay !== null &&
                lossesToday >= dayPolicy.maxLossesPerDay
            ) {
                break;
            }
            if (
                shouldStopDay(
                    dayPolicy.stopRule,
                    isWon,
                    lossesToday,
                    state.todayPnL,
                )
            ) {
                break;
            }
        }
    }

    if (isTraded) {
        state.tradingDays += 1;
        state.consecutiveIdleDays = 0;
        if (state.todayPnL >= (plan.minQualifyingDayProfit ?? -Infinity)) {
            state.qualifyingDays += 1;
        }
    } else {
        state.consecutiveIdleDays += 1;
    }
    drawdown.onDayClose(state);
    plan.recordDayClosePeak(state);
    if (plan.isBust(state, phase)) {
        return { busted: true, closedForInactivity: false, traded: isTraded };
    }
    if (
        plan.maxConsecutiveIdleDays !== null &&
        state.consecutiveIdleDays >= plan.maxConsecutiveIdleDays
    ) {
        return { busted: true, closedForInactivity: true, traded: isTraded };
    }
    return { busted: false, closedForInactivity: false, traded: isTraded };
}
