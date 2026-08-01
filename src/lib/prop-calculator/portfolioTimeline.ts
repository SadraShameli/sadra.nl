import { type CouponDiscounts } from './core/FeeSchedule';
import { type Plan } from './core/Plan';
import { mulberry32, type Rng } from './rng';
import {
    type DayStopRule,
    type EvalAttemptResult,
    runDay,
    runEvalAttempt,
} from './simulator';
import { percentile } from './stats';

// --- Hang-prevention -------------------------------------------------------
// An earlier (Python) prototype of this exact "retry evals until funded,
// then cycle payouts" idea hung for close to an hour on a low-win-rate input
// because its retry loop had no ceiling independent of the caller. This file
// is written so that is structurally impossible, via four independent bounds
// that all have to hold at once:
//   1. The calendar day-budget (`dayBudget`) is the *primary* termination
//      bound for `runAccountTimeline`'s card loop: every card is guaranteed
//      to consume >= 1 day (see `MAX_EVAL_ATTEMPTS_PER_CARD` clamp below), so
//      that loop can run at most `dayBudget` times no matter what the other
//      inputs are.
//   2. `MAX_EVAL_ATTEMPTS_PER_CARD` hard-caps eval retries within a single
//      card, independent of any user-supplied parameter (this engine does
//      not expose a `maxAttempts` knob at all, unlike `simulator.ts`).
//   3. `MAX_CARDS_PER_TIMELINE` hard-caps the number of cards a single
//      account timeline will ever run, as defense-in-depth in case the
//      "every card consumes >= 1 day" invariant above is ever violated by a
//      future change.
//   4. Every day-count input (`maxEvalDays`, `dayBudget`) is defensively
//      clamped with `Math.max(1, Math.floor(x))` before use, so a
//      misconfigured 0 (or negative, or fractional) value can never cause a
//      loop to spin without making progress.
const MAX_EVAL_ATTEMPTS_PER_CARD = 25;
const MAX_CARDS_PER_TIMELINE = 2000;

export const DEFAULT_DAY_BUDGET = 252;
export const DEFAULT_MAX_PAYOUTS_PER_CARD = 6;

const STEP = 5;
const TRADING_DAYS_PER_MONTH = 21;

export interface AccountTimelineInputs {
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
    plan: Plan;
    riskPerTrade: number;
    rng: Rng;
    rrRatio: number;
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

export interface PayoutEvent {
    amount: number;
    /** 1-based number of calendar days elapsed since this card started. */
    dayOffset: number;
}

export interface PortfolioTimelineInputs {
    accounts: number;
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    maxEvalDays: number;
    maxPayoutsPerCard?: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
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
        dayStop,
        discounts,
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        plan,
        riskPerTrade,
        rng,
        rrRatio,
        tradesPerDay,
        winrate,
    } = inputs;

    // Hang-prevention bound #4: defensively clamp day-count inputs.
    const safeDayBudget = Math.max(1, Math.floor(dayBudget));
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));

    const cumulativeSpend = new Float64Array(safeDayBudget + 1);
    const cumulativePayout = new Float64Array(safeDayBudget + 1);
    const cumulativeNet = new Float64Array(safeDayBudget + 1);

    let spendSoFar = 0;
    let payoutSoFar = 0;
    let currentDay = 0;
    let cardsRun = 0;

    // Hang-prevention bound #1 (primary): `currentDay` strictly increases by
    // at least 1 every iteration, since every card consumes >= 1 day (a
    // consequence of `safeMaxEvalDays` being clamped to >= 1 above), so this
    // loop is already bounded by `safeDayBudget` alone. Bound #3
    // (`MAX_CARDS_PER_TIMELINE`) only guards against that invariant ever
    // being violated by a future change.
    while (currentDay < safeDayBudget && cardsRun < MAX_CARDS_PER_TIMELINE) {
        cardsRun += 1;
        const cardStart = currentDay;
        const remainingDays = safeDayBudget - cardStart;

        const card = runEvalToFundedCycle(
            plan,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            safeMaxEvalDays,
            remainingDays,
            commissionPerRoundTrip,
            rng,
            dayStop,
            discounts,
            maxPayoutsPerCard,
        );

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

    // Defense-in-depth tail: only reachable if `MAX_CARDS_PER_TIMELINE` was
    // hit before the day-budget was exhausted. Any untouched trailing days
    // simply carry the last known cumulative values forward.
    for (let d = currentDay + 1; d <= safeDayBudget; d++) {
        cumulativeSpend[d] = spendSoFar;
        cumulativePayout[d] = payoutSoFar;
        cumulativeNet[d] = payoutSoFar - spendSoFar;
    }

    return { cardsRun, cumulativeNet, cumulativePayout, cumulativeSpend };
}

/**
 * Runs a single "card": buy an eval, retry (buying a fresh eval each time,
 * per Apex's real "no reset fees" rule) until it passes or a hard attempt
 * ceiling is hit, then — on pass — run the funded/payout day-loop until
 * bust or the payout ladder is exhausted (or the day-loop's budget runs
 * out first).
 *
 * The funded day-loop below mirrors `simulator.ts`'s internal (unexported)
 * `runFundedHorizon` cycle-by-cycle logic exactly — the same qualifying-day
 * baseline reset on every payout including the first, the ladder-vs-safety-
 * net profit gate, and the funded consistency check — but is driven
 * directly off the exported `runDay` primitive, since only the primitives
 * (not that private orchestration function) are exported from `simulator.ts`.
 */
export function runEvalToFundedCycle(
    plan: Plan,
    winrate: number,
    rrRatio: number,
    riskPerTrade: number,
    tradesPerDay: number,
    maxEvalDays: number,
    maxFundedDays: number,
    commission: number,
    rng: Rng,
    dayStop: DayStopRule | undefined,
    discounts: CouponDiscounts | undefined,
    maxPayoutsPerCard: number = DEFAULT_MAX_PAYOUTS_PER_CARD,
): CardResult {
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));
    const safeMaxFundedDays = Math.max(0, Math.floor(maxFundedDays));
    const payoutCap = Math.max(0, Math.floor(maxPayoutsPerCard));

    let totalDays = 0;
    let resetFeesPaid = 0;
    let attemptsUsed = 0;
    let passedAttempt: EvalAttemptResult;

    // Bounded eval-retry loop (hang-prevention bound #2 above).
    for (;;) {
        attemptsUsed += 1;
        const attempt = runEvalAttempt(
            plan,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            safeMaxEvalDays,
            commission,
            rng,
            false,
            dayStop,
        );
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
    // The funded phase begins now: this is the balance the tiered funded DLL
    // and the trailing-drawdown ratchet measure profit against.
    state.fundingBaseline = state.balance;

    const ladder = plan.payoutLadder;
    const payouts: PayoutEvent[] = [];
    // "Last payout" for cycle 1 is funding start — every cycle, including
    // the first, resets its own qualifying-day/profit/consistency baseline.
    let lastPayoutBalance = state.balance;
    let qualifyingDaysAtLastPayout = state.qualifyingDays;
    let cycleBestDayProfit = 0;
    let payoutsIssued = 0;
    let fundedDays = 0;
    let isBustedFunded = false;
    let isLadderExhausted = false;

    for (let day = 0; day < safeMaxFundedDays; day++) {
        const { busted } = runDay(
            plan,
            state,
            passedAttempt.stats,
            winrate,
            rrRatio,
            riskPerTrade,
            tradesPerDay,
            commission,
            rng,
            dayStop,
            'funded',
        );
        fundedDays += 1;
        if (state.todayPnL > cycleBestDayProfit) {
            cycleBestDayProfit = state.todayPnL;
        }

        if (busted) {
            isBustedFunded = true;
            break;
        }

        if (!ladder || payoutCap <= 0) continue;

        const cycleProfit = state.balance - lastPayoutBalance;
        const requiredProfit =
            payoutsIssued === 0
                ? plan.minPayoutProfit
                : ladder.minRequestAmount;
        const hasQualifyingDays =
            state.qualifyingDays - qualifyingDaysAtLastPayout >=
            plan.minDaysAfterPassForPayout;
        const isConsistent =
            !plan.consistency ||
            !plan.consistency.appliesToFunded() ||
            !plan.consistency.isViolated(cycleBestDayProfit, cycleProfit);

        if (
            !hasQualifyingDays ||
            !isConsistent ||
            cycleProfit < requiredProfit
        ) {
            continue;
        }

        const step = ladder.steps[payoutsIssued];
        if (step === undefined) continue;

        payouts.push({ amount: step, dayOffset: totalDays + fundedDays });
        state.balance -= step;
        lastPayoutBalance = state.balance;
        qualifyingDaysAtLastPayout = state.qualifyingDays;
        cycleBestDayProfit = 0;
        payoutsIssued += 1;

        if (
            payoutsIssued >= payoutCap ||
            payoutsIssued >= ladder.steps.length
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
        maxEvalDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        plan,
        riskPerTrade,
        rrRatio,
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
            const accountRng = mulberry32(seed + t * 1_000_003 + a * 7919 + 1);
            const account = runAccountTimeline({
                commissionPerRoundTrip,
                dayBudget: safeDayBudget,
                dayStop,
                discounts,
                maxEvalDays,
                maxPayoutsPerCard,
                plan,
                riskPerTrade,
                rng: accountRng,
                rrRatio,
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
