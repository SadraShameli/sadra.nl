import { resetForNewDay } from '../core/AccountState';
import { TRADING_DAYS_PER_YEAR } from '../core/constants';
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
import { median, percentile } from '../stats';
import {
    type LiveDayRunOptions,
    type LiveOutputs,
    type LiveSimInputs,
} from './types';
import { assertPositiveSafeInteger } from './validation';

interface LiveHorizonOptions {
    commission: Dollars;
    horizonDays: number;
    idleDayProbability?: number;
    payoutRequestSize: number | undefined;
    plan: LivePlan;
    positionSizing: null | PositionSizingConfig;
    retainedCushion: Dollars;
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
    recurringWithdrawn: number;
    totalWithdrawn: number;
}

export function oneOffLiveCredit(plan: LivePlan): number {
    return plan.payoutFromProfit(plan.transitionPayout);
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
    const isIdleToday = idleChance > 0 && rng() < idleChance;

    if (!isIdleToday) {
        for (let index = 0; index < tradesPerDay; index++) {
            const cushion = state.balance - state.threshold;
            const cushionPercent = plan.cushionPercentFor(state);
            const intendedRisk = resolveLiveTradeRisk(cushion, cushionPercent);
            const risk =
                positionSizing === null
                    ? intendedRisk
                    : capRiskToContractLimit(
                          intendedRisk,
                          positionSizing,
                          plan.maxContractsFor(
                              state,
                              positionSizing.instrument,
                          ),
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
    plan.recordDayClose(state, isTraded);
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
        payoutRequestSize: payoutRequestSizeInput,
        plan,
        positionSizing,
        retainedCushion,
        rng,
        rrRatio,
        tradesPerDay,
        winrate,
    } = options;
    const payoutRequestSize = plan.resolvePayoutRequestSize(
        payoutRequestSizeInput,
    );
    const state: LiveAccountState = plan.initialState();
    const oneOffCredit = oneOffLiveCredit(plan);
    let cumulativeDebited: number = plan.transitionPayout;
    let recurringWithdrawn = 0;
    let daysToFirstWithdrawal: null | number =
        plan.transitionPayout > 0 ? 0 : null;

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
                recurringWithdrawn,
                totalWithdrawn: oneOffCredit + recurringWithdrawn,
            };
        }

        const debited = plan.payoutRequestAmount(
            state,
            retainedCushion,
            payoutRequestSize,
        );
        if (debited <= 0) continue;
        plan.withdraw(state, debited);
        const grossPaidBefore = plan.payoutFromProfit(cumulativeDebited);
        cumulativeDebited += debited;
        const grossPaidAfter = plan.payoutFromProfit(cumulativeDebited);
        recurringWithdrawn += grossPaidAfter - grossPaidBefore;
        daysToFirstWithdrawal ??= daysElapsed;
    }

    return {
        busted: false,
        closedForInactivity: false,
        daysElapsed: horizonDays,
        daysToBust: null,
        daysToFirstWithdrawal,
        recurringWithdrawn,
        totalWithdrawn: oneOffCredit + recurringWithdrawn,
    };
}

export function simulateLiveAccount(inputs: LiveSimInputs): LiveOutputs {
    const {
        commissionPerRoundTrip = 0,
        horizonDays,
        idleDayProbability,
        instrument,
        payoutRequestSize: payoutRequestSizeInput,
        plan,
        retainedCushion: retainedCushionInput,
        rrRatio,
        seed,
        stopPoints,
        tradesPerDay,
        trials,
        winrate: winrateInput,
    } = inputs;
    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(horizonDays, 'horizonDays');
    const commission = dollars(commissionPerRoundTrip);
    const retainedCushion = plan.resolveRetainedCushion(retainedCushionInput);
    const payoutRequestSize = plan.resolvePayoutRequestSize(
        payoutRequestSizeInput,
    );
    const winrate = fraction(winrateInput);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const rng = mulberry32(seed);

    let bustedCount = 0;
    let inactivityClosureCount = 0;
    const daysToBustValues: number[] = [];
    const daysToFirstWithdrawalValues: number[] = [];
    const cumulativeWithdrawalsAtHorizon: number[] = [];
    let recurringWithdrawnSum = 0;

    for (let index = 0; index < trials; index++) {
        const result = runLiveHorizon({
            commission,
            horizonDays,
            idleDayProbability,
            payoutRequestSize,
            plan,
            positionSizing,
            retainedCushion,
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
        recurringWithdrawnSum += result.recurringWithdrawn;
    }

    const expectedAnnualWithdrawalRate =
        (recurringWithdrawnSum / trials / horizonDays) * TRADING_DAYS_PER_YEAR;

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
        liveBustProbability: bustedCount / trials,
        liveInactivityClosureProbability: inactivityClosureCount / trials,
        medianDaysToBust: median(daysToBustValues),
        medianDaysToFirstWithdrawal: median(daysToFirstWithdrawalValues),
    };
}
