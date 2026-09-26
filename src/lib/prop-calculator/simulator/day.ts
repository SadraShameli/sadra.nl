import { resetForNewDay } from '../core/AccountState';
import {
    type AffordableRoom,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
    placeWholeContractTrade,
    PolicySizing,
    policySizingOf,
    resolveFundedTradeRisk,
    resolveTradeRisk,
    type RungSizing,
    shouldStopDay,
    type SizedTrade,
} from '../core/DayPolicy';
import { IntradayTrailingDrawdown } from '../core/DrawdownStrategy';
import { type ContractCount } from '../core/lib/units';
import {
    capRiskToContractLimit,
    contractLimitAt,
    type PositionSizingConfig,
} from '../core/PositionSizing';
import {
    calibrateStepProbability,
    simulateTradePath,
} from '../core/TradePathSimulation';
import { applyTrade, closeTradingDay } from '../core/TradingDayLedger';
import { TradingPhase } from '../core/TradingPhase';
import {
    assertDeclaredSizingMatchesPhase,
    assertNoFundedDayPolicyConflict,
    assertSimInputsSized,
} from './dayPolicyValidation';
import { SIM_DEFAULTS } from './SimDefaults';
import { type DayRunOptions, type SimInputs } from './types';

const MAX_INTRADAY_PATH_STEPS = 100_000;

interface TradeSizingOptions {
    affordable: AffordableRoom;
    intendedRisk: number;
    maxContracts: ContractCount | null;
    positionSizing: PositionSizingConfig;
    rungSizing: RungSizing;
    sizing: PolicySizing;
}

export function resolveDayPolicy(
    inputs: SimInputs,
    phase: TradingPhase,
): DayPolicy {
    if (phase === TradingPhase.Funded) {
        assertNoFundedDayPolicyConflict(inputs);
        assertSimInputsSized(inputs);
    }
    const declared =
        phase === TradingPhase.Eval
            ? inputs.evalDayPolicy
            : inputs.fundedDayPolicy;
    const sizing = policySizingOf(phase);
    if (declared) {
        assertDeclaredSizingMatchesPhase(inputs, declared, phase);
        return declared;
    }
    const isFunded = phase === TradingPhase.Funded;
    const tradesPerDay = isFunded
        ? (inputs.fundedTradesPerDay ?? inputs.tradesPerDay)
        : inputs.tradesPerDay;
    const stopRule = inputs.dayStop ?? { kind: DayStopRuleKind.None };
    if (isFunded && inputs.fundedCushionPercent !== undefined) {
        const cushionPercent = inputs.fundedCushionPercent;
        return computedDayPolicy(
            (state) =>
                resolveFundedTradeRisk(
                    state.balance - state.threshold,
                    cushionPercent,
                ),
            tradesPerDay,
            stopRule,
            sizing,
        );
    }
    const riskPerTrade = isFunded
        ? (inputs.fundedRiskPerTrade ?? inputs.riskPerTrade)
        : inputs.riskPerTrade;
    return flatDayPolicy(riskPerTrade, tradesPerDay, stopRule, sizing);
}

export function runDay(options: DayRunOptions): {
    busted: boolean;
    closedForInactivity: boolean;
    traded: boolean;
} {
    const {
        commission,
        dayPolicy,
        idleDayProbability = SIM_DEFAULTS.idleDayProbability,
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
    const fundedCycle =
        options.phase === TradingPhase.Funded ? options.fundedCycle : undefined;
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

    const maxConsecutiveIdleDays = plan.maxConsecutiveIdleDaysFor(phase);
    const isIdleToday = idleDayProbability > 0 && rng() < idleDayProbability;

    if (!isIdleToday) {
        for (let index = 0; index < dayPolicy.ladder.length; index++) {
            const intendedRisk =
                dayPolicy.computeRisk?.(state, index, fundedCycle) ??
                dayPolicy.ladder[index] ??
                0;
            const affordable = plan.affordableRoom(state, phase, commission);
            const { rewardRisk, risk } =
                positionSizing === null
                    ? unsizedTrade(
                          resolveTradeRisk(
                              intendedRisk,
                              affordable.room,
                              rungSizing,
                          ),
                      )
                    : sizeTrade({
                          affordable,
                          intendedRisk,
                          maxContracts: contractLimitAt(
                              plan.contractLimits,
                              phase,
                              positionSizing.instrument.isMicro,
                              plan.tierProfitContext(state),
                          ),
                          positionSizing,
                          rungSizing,
                          sizing: dayPolicy.sizing,
                      });
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
                peakPnL = path.peakR * rewardRisk;
            }
            const tradeGross = isWon ? rrRatio * rewardRisk : -risk;
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

function sizeTrade(options: TradeSizingOptions): SizedTrade {
    const {
        affordable,
        intendedRisk,
        maxContracts,
        positionSizing,
        rungSizing,
        sizing,
    } = options;
    switch (sizing) {
        case PolicySizing.ContractCapped: {
            return unsizedTrade(
                resolveTradeRisk(
                    capRiskToContractLimit(
                        intendedRisk,
                        positionSizing,
                        maxContracts,
                    ),
                    affordable.room,
                    rungSizing,
                ),
            );
        }
        case PolicySizing.WholeContracts: {
            return placeWholeContractTrade({
                intendedRisk,
                maxContracts,
                positionSizing,
                room: affordable.room,
                roomKind: affordable.kind,
                rungSizing,
            });
        }
    }
}

function unsizedTrade(risk: number): SizedTrade {
    return { rewardRisk: risk, risk };
}
