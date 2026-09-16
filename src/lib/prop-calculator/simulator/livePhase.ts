import { resetForNewDay } from '../core/AccountState';
import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import { maxContractsAt } from '../core/ContractLimits';
import { type LiveAccountState } from '../core/LiveAccountState';
import { type LivePlan } from '../core/LivePlan';
import { resolveLiveTradeRisk } from '../core/LiveSizing';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolvePositionSizing,
} from '../core/PositionSizing';
import {
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '../core/units';
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
    daysElapsed: number;
    daysToBust: null | number;
    daysToFirstWithdrawal: null | number;
    totalWithdrawn: number;
}

export function runLiveDay(options: LiveDayRunOptions): {
    busted: boolean;
    traded: boolean;
} {
    const {
        commission,
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

    for (let index = 0; index < tradesPerDay; index++) {
        const cushion = state.balance - state.threshold;
        const cushionPercent = plan.cushionPercentFor(state);
        const intendedRisk = resolveLiveTradeRisk(cushion, cushionPercent);
        const maxContracts = maxContractsAt(plan.contractLimit, state.balance);
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
            return { busted: true, traded: isTraded };
        }
        if (plan.isDayLockedOut(state)) {
            break;
        }
    }

    plan.liveDrawdown?.onDayClose(state);
    return { busted: plan.isBust(state), traded: isTraded };
}

export function runLiveHorizon(options: LiveHorizonOptions): LiveHorizonResult {
    const {
        commission,
        horizonDays,
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
        const { busted } = runLiveDay({
            commission,
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
    const daysToBustValues: number[] = [];
    const daysToFirstWithdrawalValues: number[] = [];
    const cumulativeWithdrawalsAtHorizon: number[] = [];
    let daysElapsedSum = 0;

    for (let index = 0; index < trials; index++) {
        const result = runLiveHorizon({
            commission,
            horizonDays,
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
        medianDaysToBust: median(daysToBustValues),
        medianDaysToFirstWithdrawal: median(daysToFirstWithdrawalValues),
    };
}
