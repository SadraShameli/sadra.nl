import { TRADING_DAYS_PER_MONTH } from './core/constants';
import {
    type DayPolicy,
    type DayStopRule,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
    type RungSizing,
} from './core/DayPolicy';
import { type CouponDiscounts } from './core/FeeSchedule';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from './core/FundedPayoutCycle';
import { type Plan } from './core/Plan';
import { deriveSubSeed, mulberry32, type Rng } from './rng';
import { type EvalAttemptResult, runDay, runEvalAttempt } from './simulator';
import { percentile } from './stats';

const MAX_EVAL_ATTEMPTS_PER_CARD = 25;
const MAX_CARDS_PER_TIMELINE = 2000;

export const DEFAULT_DAY_BUDGET = 252;
export const DEFAULT_MAX_PAYOUTS_PER_CARD = 6;

const STEP = 5;

export interface AccountTimelineInputs {
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rng: Rng;
    rrRatio: number;
    rungSizing?: RungSizing;
    tradesPerDay: number;
    winrate: number;
}

export interface AccountTimelineResult {
    cardsRun: number;
    cumulativeNet: Float64Array;
    cumulativePayout: Float64Array;
    cumulativeSpend: Float64Array;
}

export type CardOutcome =
    | 'bust-eval'
    | 'bust-funded'
    | 'card-closed'
    | 'ladder-exhausted'
    | 'timeout-eval';

export interface CardResult {
    attemptsUsed: number;
    outcome: CardOutcome;
    payouts: readonly PayoutEvent[];
    totalCost: number;
    totalDays: number;
}

export interface EvalToFundedCycleOptions {
    commission: number;
    discounts: CouponDiscounts | undefined;
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
    maxEvalDays: number;
    maxFundedDays: number;
    maxPayoutsPerCard?: number;
    minRetainedCushion: number;
    payoutRequestSize: number | undefined;
    plan: Plan;
    rng: Rng;
    rrRatio: number;
    rungSizing: RungSizing;
    winrate: number;
}

export interface PayoutEvent {
    amount: number;
    /**
    1-based number of calendar days elapsed since this card started.
    */
    dayOffset: number;
}

export interface PortfolioTimelineInputs {
    accounts: number;
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    fundedDayPolicy?: DayPolicy;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing?: RungSizing;
    seed: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export interface PortfolioTimelineResult {
    /** Break-even month (day / 21) for each trial that ever went cash-flow
     * positive within the day-budget; trials that never do are omitted. */
    breakEvenMonthValues: number[];
    days: number[];
    netP10: number[];
    netP50: number[];
    netP90: number[];
    payoutP10: number[];
    payoutP50: number[];
    payoutP90: number[];
    pEverCashflowPositive: number;
    spendP10: number[];
    spendP50: number[];
    spendP90: number[];
}

/**
 * Repeats "one card" (buy eval → retry → fund → cycle payouts) until a
 * calendar day-budget is exhausted, producing day-indexed cumulative
 * spend/payout/net arrays (index `d` = cumulative value through day `d`,
 * `d` from 0 to `dayBudget` inclusive). Eval spend for a card is booked as
 * a lump the day trading for that card starts; funded payouts are booked on
 * the exact day earned, straight out of the day-loop.
 */
export function runAccountTimeline(
    inputs: AccountTimelineInputs,
): AccountTimelineResult {
    const {
        commissionPerRoundTrip = 0,
        dayBudget = DEFAULT_DAY_BUDGET,
        discounts,
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion = 0,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        winrate,
    } = inputs;
    const flatPolicy = flatDayPolicy(
        inputs.riskPerTrade,
        inputs.tradesPerDay,
        inputs.dayStop ?? { kind: 'none' },
    );
    const evalDayPolicy = inputs.evalDayPolicy ?? flatPolicy;
    const fundedDayPolicy = inputs.fundedDayPolicy ?? flatPolicy;

    const safeDayBudget = Math.max(1, Math.floor(dayBudget));
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));

    const cumulativeSpend = new Float64Array(safeDayBudget + 1);
    const cumulativePayout = new Float64Array(safeDayBudget + 1);
    const cumulativeNet = new Float64Array(safeDayBudget + 1);

    let spendSoFar = 0;
    let payoutSoFar = 0;
    let currentDay = 0;
    let cardsRun = 0;

    while (currentDay < safeDayBudget && cardsRun < MAX_CARDS_PER_TIMELINE) {
        cardsRun += 1;
        const cardStart = currentDay;
        const remainingDays = safeDayBudget - cardStart;

        const card = runEvalToFundedCycle({
            commission: commissionPerRoundTrip,
            discounts,
            evalDayPolicy,
            fundedDayPolicy,
            maxEvalDays: safeMaxEvalDays,
            maxFundedDays: remainingDays,
            maxPayoutsPerCard,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            rng,
            rrRatio,
            rungSizing,
            winrate,
        });

        spendSoFar += card.totalCost;
        let payoutIndex = 0;

        for (
            let d = 1;
            d <= card.totalDays && cardStart + d <= safeDayBudget;
            d++
        ) {
            while (
                payoutIndex < card.payouts.length &&
                card.payouts[payoutIndex]?.dayOffset === d
            ) {
                payoutSoFar += card.payouts[payoutIndex]?.amount ?? 0;
                payoutIndex += 1;
            }
            const absoluteDay = cardStart + d;
            cumulativeSpend[absoluteDay] = spendSoFar;
            cumulativePayout[absoluteDay] = payoutSoFar;
            cumulativeNet[absoluteDay] = payoutSoFar - spendSoFar;
        }

        currentDay = Math.min(safeDayBudget, cardStart + card.totalDays);
    }

    for (let d = currentDay + 1; d <= safeDayBudget; d++) {
        cumulativeSpend[d] = spendSoFar;
        cumulativePayout[d] = payoutSoFar;
        cumulativeNet[d] = payoutSoFar - spendSoFar;
    }

    return { cardsRun, cumulativeNet, cumulativePayout, cumulativeSpend };
}

export function runEvalToFundedCycle(
    options: EvalToFundedCycleOptions,
): CardResult {
    const {
        commission,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        maxEvalDays,
        maxFundedDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));
    const safeMaxFundedDays = Math.max(0, Math.floor(maxFundedDays));
    const payoutCap = Math.max(0, Math.floor(maxPayoutsPerCard));

    let totalDays = 0;
    let resetFeesPaid = 0;
    let attemptsUsed = 0;
    let passedAttempt: EvalAttemptResult;

    for (;;) {
        attemptsUsed += 1;
        const attempt = runEvalAttempt({
            commission,
            dayPolicy: evalDayPolicy,
            maxEvalDays: safeMaxEvalDays,
            plan,
            rng,
            rrRatio,
            rungSizing,
            shouldCaptureEquity: false,
            winrate,
        });
        totalDays += attempt.days;

        if (attempt.outcome === 'passed') {
            passedAttempt = attempt;
            break;
        }

        if (
            attempt.outcome === 'busted' &&
            attemptsUsed < MAX_EVAL_ATTEMPTS_PER_CARD
        ) {
            resetFeesPaid += plan.fees.reset;
            continue;
        }

        const outcome: CardOutcome =
            attempt.outcome === 'busted' ? 'bust-eval' : 'timeout-eval';
        return {
            attemptsUsed,
            outcome,
            payouts: [],
            totalCost:
                plan.totalCostThroughDay(totalDays, discounts) + resetFeesPaid,
            totalDays,
        };
    }

    const { state } = passedAttempt;
    state.fundingBaseline = state.balance;

    const ladder = plan.payoutLadder;
    const payouts: PayoutEvent[] = [];
    const tracker = newFundedCycleTracker(state);
    let fundedDays = 0;
    let isBustedFunded = false;
    let isLadderExhausted = false;

    for (let day = 0; day < safeMaxFundedDays; day++) {
        const { busted } = runDay({
            commission,
            dayPolicy: fundedDayPolicy,
            phase: 'funded',
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats: passedAttempt.stats,
            winrate,
        });
        fundedDays += 1;
        if (state.todayPnL > tracker.cycleBestDayProfit) {
            tracker.cycleBestDayProfit = state.todayPnL;
        }

        if (busted) {
            isBustedFunded = true;
            break;
        }

        const payout = tryFundedPayout({
            maxPayouts: payoutCap,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout === null) continue;

        payouts.push({
            amount: payout.traderReceives,
            dayOffset: totalDays + fundedDays,
        });

        if (
            tracker.payoutsIssued >= payoutCap ||
            (ladder && tracker.payoutsIssued >= ladder.steps.length)
        ) {
            isLadderExhausted = true;
            break;
        }
    }

    totalDays += fundedDays;
    const outcome: CardOutcome = isBustedFunded
        ? 'bust-funded'
        : isLadderExhausted
          ? 'ladder-exhausted'
          : 'card-closed';

    return {
        attemptsUsed,
        outcome,
        payouts,
        totalCost:
            plan.totalCostThroughDay(totalDays, discounts) + resetFeesPaid,
        totalDays,
    };
}

/**
 * Loops trials × accounts, summing the N accounts' day-indexed curves per
 * trial FIRST, then taking P10/P50/P90 percentiles across the combined
 * per-trial curves — never percentile-then-sum, which would understate
 * portfolio-level variance (percentiles don't distribute over addition).
 */
export function simulatePortfolioTimeline(
    inputs: PortfolioTimelineInputs,
): PortfolioTimelineResult {
    const {
        accounts,
        commissionPerRoundTrip = 0,
        dayBudget = DEFAULT_DAY_BUDGET,
        dayStop,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion = 0,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        tradesPerDay,
        trials,
        winrate,
    } = inputs;

    const safeDayBudget = Math.max(1, Math.floor(dayBudget));
    const safeTrials = Math.max(1, Math.floor(trials));
    const N = Math.max(1, Math.floor(accounts));

    const perTrialSpend: Float64Array[] = [];
    const perTrialPayout: Float64Array[] = [];
    const perTrialNet: Float64Array[] = [];
    const breakEvenMonthValues: number[] = [];
    let everPositiveCount = 0;

    for (let t = 0; t < safeTrials; t++) {
        const combinedSpend = new Float64Array(safeDayBudget + 1);
        const combinedPayout = new Float64Array(safeDayBudget + 1);
        const combinedNet = new Float64Array(safeDayBudget + 1);

        for (let a = 0; a < N; a++) {
            const accountRng = mulberry32(deriveSubSeed(seed, t, a));
            const account = runAccountTimeline({
                commissionPerRoundTrip,
                dayBudget: safeDayBudget,
                dayStop,
                discounts,
                evalDayPolicy,
                fundedDayPolicy,
                maxEvalDays,
                maxPayoutsPerCard,
                minRetainedCushion,
                payoutRequestSize,
                plan,
                riskPerTrade,
                rng: accountRng,
                rrRatio,
                rungSizing,
                tradesPerDay,
                winrate,
            });

            for (let d = 0; d <= safeDayBudget; d++) {
                combinedSpend[d] =
                    (combinedSpend[d] ?? 0) + (account.cumulativeSpend[d] ?? 0);
                combinedPayout[d] =
                    (combinedPayout[d] ?? 0) +
                    (account.cumulativePayout[d] ?? 0);
                combinedNet[d] =
                    (combinedNet[d] ?? 0) + (account.cumulativeNet[d] ?? 0);
            }
        }

        perTrialSpend.push(combinedSpend);
        perTrialPayout.push(combinedPayout);
        perTrialNet.push(combinedNet);

        const breakEvenDay = firstNonNegativeDay(combinedNet);
        if (breakEvenDay !== null) {
            everPositiveCount += 1;
            breakEvenMonthValues.push(breakEvenDay / TRADING_DAYS_PER_MONTH);
        }
    }

    const sampleIndices: number[] = [];
    for (let d = 0; d <= safeDayBudget; d += STEP) sampleIndices.push(d);
    if (sampleIndices.at(-1) !== safeDayBudget)
        sampleIndices.push(safeDayBudget);

    const days: number[] = [];
    const spendP10: number[] = [];
    const spendP50: number[] = [];
    const spendP90: number[] = [];
    const payoutP10: number[] = [];
    const payoutP50: number[] = [];
    const payoutP90: number[] = [];
    const netP10: number[] = [];
    const netP50: number[] = [];
    const netP90: number[] = [];

    for (const d of sampleIndices) {
        days.push(d);
        const spendVals = perTrialSpend.map((s) => s[d] ?? 0);
        const payoutVals = perTrialPayout.map((p) => p[d] ?? 0);
        const netVals = perTrialNet.map((n) => n[d] ?? 0);
        spendP10.push(percentile(spendVals, 10));
        spendP50.push(percentile(spendVals, 50));
        spendP90.push(percentile(spendVals, 90));
        payoutP10.push(percentile(payoutVals, 10));
        payoutP50.push(percentile(payoutVals, 50));
        payoutP90.push(percentile(payoutVals, 90));
        netP10.push(percentile(netVals, 10));
        netP50.push(percentile(netVals, 50));
        netP90.push(percentile(netVals, 90));
    }

    return {
        breakEvenMonthValues,
        days,
        netP10,
        netP50,
        netP90,
        payoutP10,
        payoutP50,
        payoutP90,
        pEverCashflowPositive: everPositiveCount / safeTrials,
        spendP10,
        spendP50,
        spendP90,
    };
}

function firstNonNegativeDay(net: Float64Array): null | number {
    for (let index = 1; index < net.length; index++) {
        if ((net[index] ?? 0) >= 0) return index;
    }
    return null;
}
