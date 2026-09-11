import { resetForNewDay } from '../core/AccountState';
import {
    type DayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
    resolveTradeRisk,
    shouldStopDay,
} from '../core/DayPolicy';
import { IntradayTrailingDrawdown } from '../core/DrawdownStrategy';
import {
    capRiskToContractLimit,
    resolveContractLimit,
} from '../core/PositionSizing';
import {
    calibrateStepProbability,
    simulateTradePath,
} from '../core/TradePathSimulation';
import { TradingPhase } from '../core/TradingPhase';
import { type DayRunOptions, type SimInputs } from './types';

const MAX_INTRADAY_PATH_STEPS = 100_000;

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: TradingPhase,
): DayPolicy {
    const declared =
        phase === TradingPhase.Eval
            ? inputs.evalDayPolicy
            : inputs.fundedDayPolicy;
    if (declared) return declared;
    const isFunded = phase === TradingPhase.Funded;
    const riskPerTrade = isFunded
        ? (inputs.fundedRiskPerTrade ?? inputs.riskPerTrade)
        : inputs.riskPerTrade;
    const tradesPerDay = isFunded
        ? (inputs.fundedTradesPerDay ?? inputs.tradesPerDay)
        : inputs.tradesPerDay;
    return flatDayPolicy(
        riskPerTrade,
        tradesPerDay,
        inputs.dayStop ?? { kind: DayStopRuleKind.None },
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
        intradayPathStepsPerR,
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
    const pathConfig: undefined | { probability: number; stepsPerR: number } =
        intradayPathStepsPerR !== undefined &&
        drawdown instanceof IntradayTrailingDrawdown
            ? {
                  probability: calibrateStepProbability(
                      winrate,
                      rrRatio,
                      intradayPathStepsPerR,
                  ),
                  stepsPerR: intradayPathStepsPerR,
              }
            : undefined;

    const idleChance = idleDayProbability ?? 0;
    const isIdleToday =
        idleChance > 0 &&
        plan.maxConsecutiveIdleDays !== null &&
        rng() < idleChance;

    if (!isIdleToday) {
        for (const intendedRisk of dayPolicy.ladder) {
            const cushion = state.balance - state.threshold;
            const contractCappedRisk =
                positionSizing === null
                    ? intendedRisk
                    : capRiskToContractLimit(
                          intendedRisk,
                          positionSizing,
                          resolveContractLimit(
                              plan.contractLimits,
                              phase,
                              positionSizing.instrument.isMicro,
                              plan.accountProfit(state),
                          ),
                      );
            const risk = resolveTradeRisk(
                contractCappedRisk,
                cushion,
                rungSizing,
            );
            if (risk <= 0) break;

            let isWon: boolean;
            let peakPnL: number | undefined;
            if (pathConfig === undefined) {
                isWon = rng() < winrate;
            } else {
                const path = simulateTradePath(
                    pathConfig.probability,
                    pathConfig.stepsPerR,
                    rrRatio,
                    rng,
                    MAX_INTRADAY_PATH_STEPS,
                );
                isWon = path.outcome === 'win';
                peakPnL = path.peakR * risk;
            }
            const tradeGross = isWon ? rrRatio * risk : -risk;
            const pnl = tradeGross - commission;
            state.balance += pnl;
            state.todayPnL += pnl;
            isTraded = true;
            stats.recordTrade(isWon, pnl, state.balance);
            if (!isWon) lossesToday += 1;
            if (peakPnL === undefined) {
                drawdown.onTrade(state, pnl);
            } else {
                drawdown.onTrade(state, pnl, peakPnL);
            }
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
        if (phase === TradingPhase.Eval) {
            state.tradingDays += 1;
        }
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
