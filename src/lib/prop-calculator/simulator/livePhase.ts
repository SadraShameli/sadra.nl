import { resetForNewDay } from '../core/AccountState';
import { TRADING_DAYS_PER_YEAR } from '../core/constants';
import { didCalendarWeekCloseForInactivity } from '../core/InactivityRule';
import {
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '../core/lib/units';
import { type LiveAccountState } from '../core/LiveAccountState';
import { type LivePlan } from '../core/LivePlan';
import { type PositionSizingConfig } from '../core/PositionSizing';
import { resolveLiveRiskAt } from '../core/TradeRiskResolution';
import { mulberry32, type Rng } from '../rng';
import { median, percentile } from '../stats';
import {
    PercentSizingScope,
    requirePositionSizing,
} from './dayPolicyValidation';
import { SIM_DEFAULTS } from './SimDefaults';
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
    positionSizing: PositionSizingConfig;
    retainedCushion: Dollars;
    rng: Rng;
    rrRatio: number;
    tradesPerDay: number;
    winrate: Fraction0to1;
}

interface LiveHorizonResult {
    busted: boolean;
    capitalReturned: number;
    closedForInactivity: boolean;
    daysElapsed: number;
    daysToBust: null | number;
    daysToFirstWithdrawal: null | number;
    liquidationPayout: number;
    recurringWithdrawn: number;
    totalWithdrawn: number;
}

class LiveWithdrawalLedger {
    private capitalDebited = 0;

    private cumulativeDebited: number;

    capitalReturned = 0;

    liquidationPayout = 0;

    recurringWithdrawn = 0;

    constructor(
        private readonly plan: LivePlan,
        private readonly oneOffCredit: number,
    ) {
        this.cumulativeDebited = plan.transitionPayout;
    }

    private pay(debited: number): number {
        const grossPaidBefore = this.plan.payoutFromProfit(
            this.cumulativeDebited,
        );
        this.cumulativeDebited += debited;
        return (
            this.plan.payoutFromProfit(this.cumulativeDebited) - grossPaidBefore
        );
    }

    get totalWithdrawn(): number {
        return (
            this.oneOffCredit +
            this.recurringWithdrawn +
            this.capitalReturned +
            this.liquidationPayout
        );
    }

    recordLiquidation(remainingBalance: number): void {
        if (remainingBalance <= 0) return;
        this.liquidationPayout += this.pay(remainingBalance);
    }

    recordWithdrawal(state: LiveAccountState, debited: number): void {
        const capitalBase = state.startingBalance - this.capitalDebited;
        const profitAvailable = Math.max(0, state.balance - capitalBase);
        const capitalPart = Math.max(0, debited - profitAvailable);
        const paid = this.pay(debited);
        const capitalPaid = (paid * capitalPart) / debited;
        this.capitalDebited += capitalPart;
        this.capitalReturned += capitalPaid;
        this.recurringWithdrawn += paid - capitalPaid;
    }

    result(
        outcome: Pick<
            LiveHorizonResult,
            | 'busted'
            | 'closedForInactivity'
            | 'daysElapsed'
            | 'daysToBust'
            | 'daysToFirstWithdrawal'
        >,
    ): LiveHorizonResult {
        return {
            ...outcome,
            capitalReturned: this.capitalReturned,
            liquidationPayout: this.liquidationPayout,
            recurringWithdrawn: this.recurringWithdrawn,
            totalWithdrawn: this.totalWithdrawn,
        };
    }
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
        idleDayProbability = SIM_DEFAULTS.idleDayProbability,
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

    const isIdleToday = idleDayProbability > 0 && rng() < idleDayProbability;

    if (!isIdleToday) {
        for (let index = 0; index < tradesPerDay; index++) {
            const { rewardRisk, risk } = resolveLiveRiskAt({
                commission,
                plan,
                positionSizing,
                state,
            });
            if (risk <= 0) break;

            const isWon = rng() < winrate;
            const tradeGross = isWon ? rrRatio * rewardRisk : -risk;
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
    const wasClosedForCalendarWeekInactivity = didCalendarWeekCloseForInactivity(
        plan.calendarWeekInactivity,
        state,
        isTraded,
    );

    plan.liveDrawdown?.onDayClose(state);
    plan.recordDayClose(state, isTraded);
    if (plan.isBust(state)) {
        return { busted: true, closedForInactivity: false, traded: isTraded };
    }
    if (wasClosedForCalendarWeekInactivity) {
        return { busted: true, closedForInactivity: true, traded: isTraded };
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
    const ledger = new LiveWithdrawalLedger(plan, oneOffLiveCredit(plan));
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
            if (!closedForInactivity) {
                ledger.recordLiquidation(plan.payoutOnLiquidation(state));
            }
            return ledger.result({
                busted: true,
                closedForInactivity,
                daysElapsed,
                daysToBust: daysElapsed,
                daysToFirstWithdrawal,
            });
        }

        const debited = plan.payoutRequestAmount(
            state,
            retainedCushion,
            payoutRequestSize,
        );
        if (debited <= 0) continue;
        ledger.recordWithdrawal(state, debited);
        plan.withdraw(state, debited);
        daysToFirstWithdrawal ??= daysElapsed;
    }

    return ledger.result({
        busted: false,
        closedForInactivity: false,
        daysElapsed: horizonDays,
        daysToBust: null,
        daysToFirstWithdrawal,
    });
}

export function simulateLiveAccount(inputs: LiveSimInputs): LiveOutputs {
    const {
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
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
    const positionSizing = requirePositionSizing(PercentSizingScope.Live, {
        instrument,
        stopPoints,
    });
    const rng = mulberry32(seed);

    let bustedCount = 0;
    let inactivityClosureCount = 0;
    const daysToBustValues: number[] = [];
    const daysToFirstWithdrawalValues: number[] = [];
    const cumulativeWithdrawalsAtHorizon: number[] = [];
    let recurringWithdrawnSum = 0;
    let capitalReturnedSum = 0;
    let liquidationPayoutSum = 0;

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
        capitalReturnedSum += result.capitalReturned;
        liquidationPayoutSum += result.liquidationPayout;
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
        expectedCapitalReturned: capitalReturnedSum / trials,
        expectedLiquidationPayout: liquidationPayoutSum / trials,
        liveBustProbability: bustedCount / trials,
        liveInactivityClosureProbability: inactivityClosureCount / trials,
        medianDaysToBust: median(daysToBustValues),
        medianDaysToFirstWithdrawal: median(daysToFirstWithdrawalValues),
    };
}
