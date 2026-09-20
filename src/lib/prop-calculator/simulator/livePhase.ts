import { resetForNewDay } from '../core/AccountState';
import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { maxContractsAt } from '../core/ContractLimits';
import {
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '../core/lib/units';
import { type LiveAccountState } from '../core/LiveAccountState';
import { type LivePlan } from '../core/LivePlan';
import { resolveLiveTradeRisk } from '../core/LiveSizing';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolvePositionSizing,
} from '../core/PositionSizing';
import { mulberry32, type Rng } from '../rng';
import { mean, median, percentile } from '../stats';
import {
    type LiveDayRunOptions,
    type LiveOutputs,
    type LiveSimInputs,
} from './types';

interface LiveHorizonOptions {
    commission: Dollars;
    horizonDays: number;
    idleDayProbability?: number;
    payoutRequestSize: number | undefined;
    plan: LivePlan;
    positionSizing: null | PositionSizingConfig;
    rng: Rng;
    rrRatio: number;
    tradesPerDay: number;
    winrate: Fraction0to1;
}

interface LiveHorizonResult {
    busted: boolean;
    closedForInactivity: boolean;
    daysElapsed: number;
    daysToBust: null | number;
    daysToFirstWithdrawal: null | number;
    totalWithdrawn: number;
}

export function runLiveDay(options: LiveDayRunOptions): {
    busted: boolean;
    closedForInactivity: boolean;
    traded: boolean;
} {
    const {
        commission,
        idleDayProbability,
        plan,
        positionSizing,
        rng,
        rrRatio,
        state,
        tradesPerDay,
        winrate,
    } = options;
    resetForNewDay(state);
    let isTraded = false;

    const idleChance = idleDayProbability ?? 0;
    const isIdleToday =
        idleChance > 0 &&
        plan.maxConsecutiveIdleDays !== null &&
        rng() < idleChance;

    if (!isIdleToday) {
        for (let index = 0; index < tradesPerDay; index++) {
            const cushion = state.balance - state.threshold;
            const cushionPercent = plan.cushionPercentFor(state);
            const intendedRisk = resolveLiveTradeRisk(cushion, cushionPercent);
            const maxContracts = maxContractsAt(
                plan.contractLimit,
                state.balance,
            );
            const risk =
                positionSizing === null
                    ? intendedRisk
                    : capRiskToContractLimit(
                          intendedRisk,
                          positionSizing,
                          maxContracts,
                      );
            if (risk <= 0) break;

            const isWon = rng() < winrate;
            const tradeGross = isWon ? rrRatio * risk : -risk;
            const pnl = tradeGross - commission;
            state.balance += pnl;
            state.todayPnL += pnl;
            isTraded = true;

            plan.liveDrawdown?.onTrade(state, pnl);

            if (plan.isBust(state)) {
                return {
                    busted: true,
                    closedForInactivity: false,
                    traded: isTraded,
                };
            }
            if (plan.isDayLockedOut(state)) {
                break;
            }
        }
    }

    if (isTraded) {
        state.consecutiveIdleDays = 0;
    } else {
        state.consecutiveIdleDays += 1;
    }

    plan.liveDrawdown?.onDayClose(state);
    if (plan.isBust(state)) {
        return { busted: true, closedForInactivity: false, traded: isTraded };
    }
    return plan.maxConsecutiveIdleDays !== null &&
        state.consecutiveIdleDays >= plan.maxConsecutiveIdleDays
        ? { busted: true, closedForInactivity: true, traded: isTraded }
        : { busted: false, closedForInactivity: false, traded: isTraded };
}

export function runLiveHorizon(options: LiveHorizonOptions): LiveHorizonResult {
    const {
        commission,
        horizonDays,
        idleDayProbability,
        payoutRequestSize,
        plan,
        positionSizing,
        rng,
        rrRatio,
        tradesPerDay,
        winrate,
    } = options;
    const state: LiveAccountState = plan.initialState();
    let daysToFirstWithdrawal: null | number = null;
    let cumulativeDebited = 0;
    let totalWithdrawn = 0;

    for (let day = 0; day < horizonDays; day++) {
        const { busted, closedForInactivity } = runLiveDay({
            commission,
            idleDayProbability,
            plan,
            positionSizing,
            rng,
            rrRatio,
            state,
            tradesPerDay,
            winrate,
        });
        const daysElapsed = day + 1;

        if (busted) {
            return {
                busted: true,
                closedForInactivity,
                daysElapsed,
                daysToBust: daysElapsed,
                daysToFirstWithdrawal,
                totalWithdrawn,
            };
        }

        const available = plan.withdrawableAmount(state);
        if (available <= 0) continue;
        const debited =
            payoutRequestSize === undefined
                ? available
                : Math.min(payoutRequestSize, available);
        if (debited <= 0) continue;
        state.balance -= debited;
        const grossPaidBefore = plan.payoutFromProfit(cumulativeDebited);
        cumulativeDebited += debited;
        const grossPaidAfter = plan.payoutFromProfit(cumulativeDebited);
        totalWithdrawn += grossPaidAfter - grossPaidBefore;
        daysToFirstWithdrawal ??= daysElapsed;
    }

    return {
        busted: false,
        closedForInactivity: false,
        daysElapsed: horizonDays,
        daysToBust: null,
        daysToFirstWithdrawal,
        totalWithdrawn,
    };
}

export function simulateLiveAccount(inputs: LiveSimInputs): LiveOutputs {
    const {
        commissionPerRoundTrip = 0,
        horizonDays,
        idleDayProbability,
        instrument,
        payoutRequestSize,
        plan,
        rrRatio,
        seed,
        stopPoints,
        tradesPerDay,
        trials,
        winrate: winrateInput,
    } = inputs;
    const commission = dollars(commissionPerRoundTrip);
    const winrate = fraction(winrateInput);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const rng = mulberry32(seed);

    let bustedCount = 0;
    let inactivityClosureCount = 0;
    const daysToBustValues: number[] = [];
    const daysToFirstWithdrawalValues: number[] = [];
    const cumulativeWithdrawalsAtHorizon: number[] = [];
    let daysElapsedSum = 0;

    for (let index = 0; index < trials; index++) {
        const result = runLiveHorizon({
            commission,
            horizonDays,
            idleDayProbability,
            payoutRequestSize,
            plan,
            positionSizing,
            rng,
            rrRatio,
            tradesPerDay,
            winrate,
        });
        if (result.busted) {
            bustedCount += 1;
            if (result.daysToBust !== null) {
                daysToBustValues.push(result.daysToBust);
            }
        }
        if (result.closedForInactivity) inactivityClosureCount += 1;
        if (result.daysToFirstWithdrawal !== null) {
            daysToFirstWithdrawalValues.push(result.daysToFirstWithdrawal);
        }
        cumulativeWithdrawalsAtHorizon.push(result.totalWithdrawn);
        daysElapsedSum += result.daysElapsed;
    }

    const totalTrials = trials || 1;
    const meanWithdrawal = mean(cumulativeWithdrawalsAtHorizon);
    const meanDaysElapsed = daysElapsedSum / totalTrials || 1;
    const expectedAnnualWithdrawalRate =
        (meanWithdrawal / meanDaysElapsed) * TRADING_DAYS_PER_MONTH * 12;

    return {
        cumulativeWithdrawalsAtHorizon,
        cumulativeWithdrawalsP5: percentile(cumulativeWithdrawalsAtHorizon, 5),
        cumulativeWithdrawalsP50: percentile(
            cumulativeWithdrawalsAtHorizon,
            50,
        ),
        cumulativeWithdrawalsP95: percentile(
            cumulativeWithdrawalsAtHorizon,
            95,
        ),
        expectedAnnualWithdrawalRate,
        liveBustProbability: bustedCount / totalTrials,
        liveInactivityClosureProbability: inactivityClosureCount / totalTrials,
        medianDaysToBust: median(daysToBustValues),
        medianDaysToFirstWithdrawal: median(daysToFirstWithdrawalValues),
    };
}
