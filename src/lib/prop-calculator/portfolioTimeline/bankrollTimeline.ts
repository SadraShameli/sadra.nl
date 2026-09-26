import { TRADING_DAYS_PER_MONTH } from '../core/constants';
import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    flatDayPolicy,
    policySizingOf,
    type RungSizing,
} from '../core/DayPolicy';
import {
    activationFee,
    type CouponDiscounts,
    initialEvalFee,
} from '../core/FeeSchedule';
import {
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from '../core/lib/units';
import { type PayoutRequestPolicy } from '../core/PayoutRequestPolicy';
import { type Plan } from '../core/Plan';
import {
    type PositionSizingConfig,
    resolvePositionSizing,
} from '../core/PositionSizing';
import { TradingPhase } from '../core/TradingPhase';
import { deriveSubSeed, mulberry32 } from '../rng';
import {
    assertDeclaredSizingMatchesPhase,
    assertPositiveSafeInteger,
    payoutRequestPolicyIssue,
    SIM_DEFAULTS,
    SIM_INPUTS_REFUSAL_PREFIX,
    simInputsSizingIssue,
} from '../simulator';
import { percentile } from '../stats';
import { runEvalToFundedCycle } from './fundedCycle';
import {
    type BankrollPolicy,
    type BankrollTimelineInputs,
    type BankrollTimelineResult,
    type CardResult,
    DEFAULT_DAY_BUDGET,
} from './types';

interface CardPurchaseContext {
    attemptCost: number;
    bankroll: BankrollPolicy;
    commission: Dollars;
    cushion: Dollars;
    discounts: CouponDiscounts | undefined;
    effectiveCapacity: number;
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
    idleDayProbability: number | undefined;
    maxEvalDays: number;
    payoutRequestPolicy: PayoutRequestPolicy | undefined;
    plan: Plan;
    positionSizing: null | PositionSizingConfig;
    requestSize: Dollars | undefined;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    winrate: Fraction0to1;
}

interface OpenCard {
    card: CardResult;
    ended: boolean;
    paidSoFar: number;
    payoutCursor: number;
    purchaseDay: number;
    spreadEvalCost: number;
}

interface PendingCredit {
    amount: number;
    day: number;
}

interface TrialState {
    cardsBought: number;
    cash: number;
    cumulativePayoutGross: number;
    cumulativeSpend: number;
    firstPurchaseDay: null | number;
    lastPayoutDay: null | number;
    monthIndex: number;
    monthSpent: number;
    open: OpenCard[];
    pending: PendingCredit[];
    ruined: boolean;
    withdrawn: number;
}

export function simulateBankrollTimeline(
    inputs: BankrollTimelineInputs,
): BankrollTimelineResult {
    const {
        bankroll,
        commissionPerRoundTrip = SIM_DEFAULTS.commissionPerRoundTrip,
        dayBudget = DEFAULT_DAY_BUDGET,
        discounts,
        idleDayProbability,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing = DEFAULT_RUNG_SIZING,
        seed,
        stopPoints,
        trials,
        winrate: winrateInput,
    } = inputs;

    assertPositiveSafeInteger(trials, 'trials');
    assertPositiveSafeInteger(dayBudget, 'dayBudget');
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    const policyIssue = payoutRequestPolicyIssue(
        plan,
        payoutRequestPolicy,
        payoutRequestSize,
    );
    if (policyIssue !== null) {
        throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${policyIssue}`);
    }
    const sizingIssue = simInputsSizingIssue({
        fundedDayPolicy: inputs.fundedDayPolicy,
        instrument,
        riskPerTrade,
        stopPoints,
    });
    if (sizingIssue !== null) {
        throw new Error(`simulateBankrollTimeline: ${sizingIssue}`);
    }

    const commission = dollars(commissionPerRoundTrip);
    const cushion = plan.resolveRetainedCushion(minRetainedCushion);
    const positionSizing = resolvePositionSizing(instrument, stopPoints);
    const requestSize =
        payoutRequestSize === undefined ? undefined : dollars(payoutRequestSize);
    const winrate = fraction(winrateInput);
    const stopRule: DayStopRule = inputs.dayStop ?? { kind: DayStopRuleKind.None };
    const evalDayPolicy = resolvePhaseDayPolicy(
        inputs,
        TradingPhase.Eval,
        stopRule,
    );
    const fundedDayPolicy = resolvePhaseDayPolicy(
        inputs,
        TradingPhase.Funded,
        stopRule,
    );
    const attemptCost =
        initialEvalFee(plan.fees, discounts) +
        activationFee(plan.fees, discounts);
    const effectiveCapacity =
        bankroll.maxConcurrentAccounts === null
            ? plan.maxFundedAccounts
            : Math.min(bankroll.maxConcurrentAccounts, plan.maxFundedAccounts);

    const perTrialCash: Float64Array[] = [];
    const perTrialSpend: Float64Array[] = [];
    const perTrialPayout: Float64Array[] = [];
    const perTrialWithdrawn: Float64Array[] = [];
    const cardsBoughtByTrial: number[] = [];
    const cycleDaysSamples: number[] = [];
    let ruinCount = 0;
    let finalNetNegativeCount = 0;

    for (let t = 0; t < trials; t++) {
        const state: TrialState = {
            cardsBought: 0,
            cash: bankroll.startingBankroll,
            cumulativePayoutGross: 0,
            cumulativeSpend: 0,
            firstPurchaseDay: null,
            lastPayoutDay: null,
            monthIndex: 0,
            monthSpent: 0,
            open: [],
            pending: [],
            ruined: false,
            withdrawn: 0,
        };

        const cashSeries = new Float64Array(dayBudget + 1);
        const spendSeries = new Float64Array(dayBudget + 1);
        const payoutSeries = new Float64Array(dayBudget + 1);
        const withdrawnSeries = new Float64Array(dayBudget + 1);

        for (let day = 0; day <= dayBudget; day++) {
            const month = Math.floor(day / TRADING_DAYS_PER_MONTH);
            if (month !== state.monthIndex) {
                state.monthIndex = month;
                state.monthSpent = 0;
            }

            for (const openCard of state.open) {
                applyOpenCardCharges(state, openCard, day, bankroll);
            }
            state.open = state.open.filter((openCard) => !openCard.ended);

            const remainingPending: PendingCredit[] = [];
            for (const credit of state.pending) {
                if (credit.day === day) {
                    state.cash += bankroll.reinvestFraction * credit.amount;
                    state.withdrawn +=
                        (1 - bankroll.reinvestFraction) * credit.amount;
                    state.cumulativePayoutGross += credit.amount;
                    state.lastPayoutDay = day;
                } else {
                    remainingPending.push(credit);
                }
            }
            state.pending = remainingPending;

            cashSeries[day] = state.cash;
            spendSeries[day] = state.cumulativeSpend;
            payoutSeries[day] = state.cumulativePayoutGross;
            withdrawnSeries[day] = state.withdrawn;

            if (
                !state.ruined &&
                state.cash < attemptCost &&
                state.pending.length === 0 &&
                state.open.length === 0
            ) {
                state.ruined = true;
            }

            purchaseCards(state, day, dayBudget, t, {
                attemptCost,
                bankroll,
                commission,
                cushion,
                discounts,
                effectiveCapacity,
                evalDayPolicy,
                fundedDayPolicy,
                idleDayProbability,
                maxEvalDays,
                payoutRequestPolicy,
                plan,
                positionSizing,
                requestSize,
                rrRatio,
                rungSizing,
                seed,
                winrate,
            });
        }

        perTrialCash.push(cashSeries);
        perTrialSpend.push(spendSeries);
        perTrialPayout.push(payoutSeries);
        perTrialWithdrawn.push(withdrawnSeries);
        cardsBoughtByTrial.push(state.cardsBought);
        if (state.ruined) ruinCount += 1;

        const finalNet =
            (payoutSeries.at(-1) ?? 0) - (spendSeries.at(-1) ?? 0);
        if (finalNet < 0) finalNetNegativeCount += 1;

        if (state.firstPurchaseDay !== null && state.lastPayoutDay !== null) {
            cycleDaysSamples.push(state.lastPayoutDay - state.firstPurchaseDay);
        }
    }

    const days: number[] = [];
    const cashP10: number[] = [];
    const cashP50: number[] = [];
    const cashP90: number[] = [];
    const cumulativeSpendP10: number[] = [];
    const cumulativeSpendP50: number[] = [];
    const cumulativeSpendP90: number[] = [];
    const payoutP10: number[] = [];
    const payoutP50: number[] = [];
    const payoutP90: number[] = [];
    const withdrawnP10: number[] = [];
    const withdrawnP50: number[] = [];
    const withdrawnP90: number[] = [];

    for (let d = 0; d <= dayBudget; d++) {
        days.push(d);
        const cashVals = perTrialCash.map((s) => s[d] ?? 0);
        const spendVals = perTrialSpend.map((s) => s[d] ?? 0);
        const payoutVals = perTrialPayout.map((s) => s[d] ?? 0);
        const withdrawnVals = perTrialWithdrawn.map((s) => s[d] ?? 0);
        cashP10.push(percentile(cashVals, 10));
        cashP50.push(percentile(cashVals, 50));
        cashP90.push(percentile(cashVals, 90));
        cumulativeSpendP10.push(percentile(spendVals, 10));
        cumulativeSpendP50.push(percentile(spendVals, 50));
        cumulativeSpendP90.push(percentile(spendVals, 90));
        payoutP10.push(percentile(payoutVals, 10));
        payoutP50.push(percentile(payoutVals, 50));
        payoutP90.push(percentile(payoutVals, 90));
        withdrawnP10.push(percentile(withdrawnVals, 10));
        withdrawnP50.push(percentile(withdrawnVals, 50));
        withdrawnP90.push(percentile(withdrawnVals, 90));
    }

    return {
        cardsBoughtP50: percentile(cardsBoughtByTrial, 50),
        cashP10,
        cashP50,
        cashP90,
        cumulativeSpendP10,
        cumulativeSpendP50,
        cumulativeSpendP90,
        days,
        measuredCycleDays:
            cycleDaysSamples.length === 0
                ? null
                : cycleDaysSamples.reduce((sum, value) => sum + value, 0) /
                  cycleDaysSamples.length,
        pathRuin: fraction(ruinCount / trials),
        payoutP10,
        payoutP50,
        payoutP90,
        pFinalNetNegative: fraction(finalNetNegativeCount / trials),
        withdrawnP10,
        withdrawnP50,
        withdrawnP90,
    };
}

function applyOpenCardCharges(
    state: TrialState,
    openCard: OpenCard,
    day: number,
    bankroll: BankrollPolicy,
): void {
    if (openCard.ended) return;
    const localDay = day - openCard.purchaseDay;
    if (localDay < 1) return;
    const { card } = openCard;
    const dueThrough = cumulativeDueThrough(openCard, localDay);
    const incremental = dueThrough - openCard.paidSoFar;
    if (incremental > 0) {
        const isOverMonthlyBudget =
            bankroll.monthlyBudget !== null &&
            state.monthSpent + incremental > bankroll.monthlyBudget;
        const isOverRoundBudget =
            bankroll.roundBudget !== null &&
            state.cumulativeSpend + incremental > bankroll.roundBudget;
        if (
            isOverMonthlyBudget ||
            isOverRoundBudget ||
            state.cash < incremental
        ) {
            openCard.ended = true;
            return;
        }
        state.cash -= incremental;
        state.cumulativeSpend += incremental;
        state.monthSpent += incremental;
        openCard.paidSoFar = dueThrough;
    }
    while (
        openCard.payoutCursor < card.payouts.length &&
        card.payouts[openCard.payoutCursor]?.dayOffset === localDay
    ) {
        const event = card.payouts[openCard.payoutCursor];
        openCard.payoutCursor += 1;
        if (event === undefined) continue;
        state.pending.push({
            amount: event.amount,
            day: day + bankroll.payoutLagDays,
        });
    }
    if (localDay >= card.totalDays) openCard.ended = true;
}

function canAffordAnotherCard(
    state: TrialState,
    context: CardPurchaseContext,
    reserved: number,
    reservedMonth: number,
    reservedSpend: number,
): boolean {
    const { attemptCost, bankroll, effectiveCapacity } = context;
    const hasMonthlyRoom =
        bankroll.monthlyBudget === null ||
        state.monthSpent + reservedMonth + attemptCost <=
            bankroll.monthlyBudget;
    const hasRoundRoom =
        bankroll.roundBudget === null ||
        state.cumulativeSpend + reservedSpend + attemptCost <=
            bankroll.roundBudget;
    return (
        state.open.length < effectiveCapacity &&
        state.cash - reserved >= attemptCost &&
        hasMonthlyRoom &&
        hasRoundRoom
    );
}

function cumulativeDueThrough(openCard: OpenCard, localDay: number): number {
    const { card, spreadEvalCost } = openCard;
    const evalRetryPaidThrough = card.evalRetryCharges
        .filter((charge) => charge.dayOffset <= localDay)
        .reduce((sum, charge) => sum + charge.fee, 0);
    const fundedResetPaidThrough = card.fundedResetCharges
        .filter((charge) => charge.dayOffset <= localDay)
        .reduce((sum, charge) => sum + charge.fee, 0);
    const spreadPortion =
        card.evalDays > 0
            ? (spreadEvalCost * Math.min(localDay, card.evalDays)) /
              card.evalDays
            : spreadEvalCost;
    return evalRetryPaidThrough + fundedResetPaidThrough + spreadPortion;
}

function declaredPhaseDayPolicy(
    inputs: BankrollTimelineInputs,
    phase: TradingPhase,
): DayPolicy | undefined {
    switch (phase) {
        case TradingPhase.Eval: {
            return inputs.evalDayPolicy;
        }
        case TradingPhase.Funded: {
            return inputs.fundedDayPolicy;
        }
    }
}

function purchaseCards(
    state: TrialState,
    day: number,
    dayBudget: number,
    trialIndex: number,
    context: CardPurchaseContext,
): void {
    if (dayBudget - day < 1) return;
    const { attemptCost } = context;
    let reserved = 0;
    let reservedMonth = 0;
    let reservedSpend = 0;
    while (
        canAffordAnotherCard(state, context, reserved, reservedMonth, reservedSpend)
    ) {
        const remaining = dayBudget - day;
        const rng = mulberry32(
            deriveSubSeed(context.seed, trialIndex, state.cardsBought),
        );
        const card = runEvalToFundedCycle({
            cardDayBudget: remaining,
            commission: context.commission,
            discounts: context.discounts,
            evalDayPolicy: context.evalDayPolicy,
            fundedDayPolicy: context.fundedDayPolicy,
            idleDayProbability: context.idleDayProbability,
            maxEvalDays: context.maxEvalDays,
            maxFundedDays: remaining,
            minRetainedCushion: context.cushion,
            payoutRequestPolicy: context.payoutRequestPolicy,
            payoutRequestSize: context.requestSize,
            plan: context.plan,
            positionSizing: context.positionSizing,
            rng,
            rrRatio: context.rrRatio,
            rungSizing: context.rungSizing,
            winrate: context.winrate,
        });
        const evalRetrySpendTotal = card.evalRetryCharges.reduce(
            (sum, charge) => sum + charge.fee,
            0,
        );
        state.open.push({
            card,
            ended: false,
            paidSoFar: 0,
            payoutCursor: 0,
            purchaseDay: day,
            spreadEvalCost: card.evalCost - evalRetrySpendTotal,
        });
        state.firstPurchaseDay ??= day;
        state.cardsBought += 1;
        reserved += attemptCost;
        reservedMonth += attemptCost;
        reservedSpend += attemptCost;
    }
}

function resolvePhaseDayPolicy(
    inputs: BankrollTimelineInputs,
    phase: TradingPhase,
    stopRule: DayStopRule,
): DayPolicy {
    const declared = declaredPhaseDayPolicy(inputs, phase);
    if (declared === undefined) {
        return flatDayPolicy(
            inputs.riskPerTrade,
            inputs.tradesPerDay,
            stopRule,
            policySizingOf(phase),
        );
    }
    assertDeclaredSizingMatchesPhase(inputs, declared, phase);
    return declared;
}
