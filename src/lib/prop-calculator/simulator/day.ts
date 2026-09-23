import { resetForNewDay } from '../core/AccountState';
import {
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
    resolveFundedTradeRisk,
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
import { applyTrade, closeTradingDay } from '../core/TradingDayLedger';
import { TradingPhase } from '../core/TradingPhase';
import { assertNoFundedDayPolicyConflict } from './dayPolicyValidation';
import { type DayRunOptions, type SimInputs } from './types';

const MAX_INTRADAY_PATH_STEPS = 100_000;

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: TradingPhase,
): DayPolicy {
    if (phase === TradingPhase.Funded) {
        assertNoFundedDayPolicyConflict(inputs);
    }
    const declared =
        phase === TradingPhase.Eval
            ? inputs.evalDayPolicy
            : inputs.fundedDayPolicy;
    if (declared) return declared;
    const isFunded = phase === TradingPhase.Funded;
    const tradesPerDay = isFunded
        ? (inputs.fundedTradesPerDay ?? inputs.tradesPerDay)
        : inputs.tradesPerDay;
    if (isFunded && inputs.fundedCushionPercent !== undefined) {
        const cushionPercent = inputs.fundedCushionPercent;
        return computedDayPolicy(
            (state) =>
                resolveFundedTradeRisk(
                    state.balance - state.threshold,
                    cushionPercent,
                ),
            tradesPerDay,
            inputs.dayStop ?? { kind: DayStopRuleKind.None },
        );
    }
    const riskPerTrade = isFunded
        ? (inputs.fundedRiskPerTrade ?? inputs.riskPerTrade)
        : inputs.riskPerTrade;
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
        cycleBestDayProfit,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        lastPayoutBalance,
        payoutsIssued,
        phase,
        plan,
        positionSizing,
        qualifyingDaysSincePayout,
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
    const maxConsecutiveIdleDays = plan.maxConsecutiveIdleDaysFor(phase);
    const isIdleToday = idleChance > 0 && rng() < idleChance;

    if (!isIdleToday) {
        for (let index = 0; index < dayPolicy.ladder.length; index++) {
            const intendedRisk =
                dayPolicy.computeRisk?.(
                    state,
                    index,
                    payoutsIssued,
                    cycleBestDayProfit,
                    qualifyingDaysSincePayout,
                    lastPayoutBalance,
                ) ??
                dayPolicy.ladder[index] ??
                0;
            const affordable = plan.affordableRisk(state, phase);
            const tierContext = plan.tierProfitContext(state);
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
                              tierContext.profit,
                              tierContext.sessionOpenProfit,
                              tierContext.peakDayCloseProfit,
                          ),
                      );
            const risk = resolveTradeRisk(
                contractCappedRisk,
                affordable,
                rungSizing,
            );
            if (!Number.isFinite(risk)) {
                throw new TypeError(
                    `runDay: computed a non-finite risk (${risk})`,
                );
            }
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
            applyTrade(plan, phase, state, pnl, peakPnL);
            isTraded = true;
            stats.recordTrade(isWon, pnl, state.balance, risk);
            if (!isWon) lossesToday += 1;
            if (plan.isBust(state, phase)) {
                return {
                    busted: true,
                    closedForInactivity: false,
                    traded: isTraded,
                };
            }
            if (
                plan.isDayLockedOut(state, phase) ||
                (dayPolicy.maxLossesPerDay !== null &&
                    lossesToday >= dayPolicy.maxLossesPerDay) ||
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

    closeTradingDay(plan, phase, state, isTraded);
    if (plan.isBust(state, phase)) {
        return { busted: true, closedForInactivity: false, traded: isTraded };
    }
    return maxConsecutiveIdleDays !== null &&
        state.consecutiveIdleDays >= maxConsecutiveIdleDays
        ? { busted: true, closedForInactivity: true, traded: isTraded }
        : { busted: false, closedForInactivity: false, traded: isTraded };
}
