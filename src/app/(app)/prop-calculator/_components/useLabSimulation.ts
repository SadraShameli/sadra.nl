'use client';

import { formatCurrency } from '~/lib/format';
import {
    CorrelationMode,
    dollars,
    fraction,
    type Fraction0to1,
    LifetimeCapScope,
    type MultiAccountResult,
    type Plan,
    type RungSizing,
    simulatePortfolio,
} from '~/lib/prop-calculator';
import {
    type EconomicsReason,
    walkPassProbability,
} from '~/lib/prop-calculator/economics';

import { ComputationId } from './ComputationId';
import { toCouponDiscounts } from './couponDiscounts';
import { partitionBySizing, type SizingRefusal } from './simulationFailure';
import { type LabScenario } from './types';
import { useDebouncedComputation } from './useDebouncedSimulation';

interface Arguments {
    activationDiscountPercent?: number;
    commissionPerRoundTrip: number;
    discountPercent?: number;
    fundedHorizonDays: number;
    linkActivationDiscount?: boolean;
    maxEvalDays: number;
    minRetainedCushion?: number;
    monthlySubscriptionDiscountPercent?: number;
    payoutRequestSize?: number;
    plan: Plan;
    resetDiscountPercent?: number;
    rungSizing?: RungSizing;
    scenarios: LabScenario[];
    seed: number;
}

const DEBOUNCE_MS = 600;
const TRIALS_BASE = 400;
const TRIALS_INDEPENDENT = 250;
const EMPTY_RESULTS = new Map<string, LabResult>();

export type LabResult = MultiAccountResult &
    TheoreticalPass & { lifetimeCapPoolingGap: null | string };

type TheoreticalPass =
    | {
          theoreticalPassProb: Fraction0to1;
          theoreticalPassReason: undefined;
      }
    | {
          theoreticalPassProb: undefined;
          theoreticalPassReason: EconomicsReason;
      };

export function lifetimeCapPoolingGapNote(
    plan: Plan,
    accounts: number,
): null | string {
    const cap = plan.maxLifetimePayoutDollars;
    return cap === null ||
        accounts <= 1 ||
        plan.lifetimeConclusion.dollarCapScope !==
            LifetimeCapScope.PerUserAcrossVariant
        ? null
        : `${plan.label}'s ${formatCurrency(cap)} lifetime cap is per user; this projection pools it across your accounts, so combined payouts here never exceed ${formatCurrency(cap)}.`;
}

export function useLabSimulation(arguments_: Arguments): {
    error: null | string;
    pending: boolean;
    refused: SizingRefusal<LabScenario>[];
    results: Map<string, LabResult>;
} {
    const {
        activationDiscountPercent = 0,
        commissionPerRoundTrip,
        discountPercent = 0,
        fundedHorizonDays,
        linkActivationDiscount = false,
        maxEvalDays,
        minRetainedCushion,
        monthlySubscriptionDiscountPercent = 0,
        payoutRequestSize,
        plan,
        resetDiscountPercent = 0,
        rungSizing,
        scenarios,
        seed,
    } = arguments_;

    const key = buildCacheKey({
        activationDiscountPercent,
        commissionPerRoundTrip,
        discountPercent,
        fundedHorizonDays,
        linkActivationDiscount,
        maxEvalDays,
        minRetainedCushion,
        monthlySubscriptionDiscountPercent,
        payoutRequestSize,
        plan,
        resetDiscountPercent,
        rungSizing,
        scenarios,
        seed,
    });

    const sizing = partitionBySizing(scenarios, (sc) => ({
        instrument: sc.instrument ?? undefined,
        riskPerTrade: sc.riskPerTrade,
        stopPoints: sc.stopPoints ?? undefined,
    }));

    const computation = useDebouncedComputation(
        ComputationId.StrategyLab,
        key,
        DEBOUNCE_MS,
        () => {
            const next = new Map<string, LabResult>();
            for (const sc of sizing.accepted) {
                const trials =
                    sc.correlation === CorrelationMode.Independent
                        ? TRIALS_INDEPENDENT
                        : TRIALS_BASE;
                const r = simulatePortfolio({
                    accounts: sc.accounts,
                    commissionPerRoundTrip,
                    correlation: sc.correlation,
                    dayStop: sc.dayStop,
                    discounts: toCouponDiscounts({
                        activationDiscountPercent,
                        evalDiscountPercent: discountPercent,
                        linkActivationDiscount,
                        monthlySubscriptionDiscountPercent,
                        resetDiscountPercent,
                    }),
                    fundedHorizonDays,
                    groups: sc.groups,
                    instrument: sc.instrument ?? undefined,
                    maxAttempts: 1,
                    maxEvalDays,
                    minRetainedCushion,
                    payoutRequestSize,
                    plan,
                    riskPerTrade: sc.riskPerTrade,
                    rrRatio: sc.rrRatio,
                    rungSizing,
                    seed,
                    stopPoints: sc.stopPoints ?? undefined,
                    tradesPerDay: sc.tradesPerDay,
                    trials,
                    winrate: sc.winrate,
                });
                next.set(sc.id, {
                    ...r,
                    ...theoreticalPass(plan, sc),
                    lifetimeCapPoolingGap: lifetimeCapPoolingGapNote(
                        plan,
                        sc.accounts,
                    ),
                });
            }
            return next;
        },
        EMPTY_RESULTS,
    );
    const isPending = scenarios.length > 0 && computation.pending;
    const results = scenarios.length === 0 ? EMPTY_RESULTS : computation.result;

    return {
        error: computation.error,
        pending: isPending,
        refused: sizing.refused,
        results,
    };
}

function buildCacheKey(fields: {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    discountPercent: number;
    fundedHorizonDays: number;
    linkActivationDiscount: boolean;
    maxEvalDays: number;
    minRetainedCushion: number | undefined;
    monthlySubscriptionDiscountPercent: number;
    payoutRequestSize: number | undefined;
    plan: Plan;
    resetDiscountPercent: number;
    rungSizing: RungSizing | undefined;
    scenarios: LabScenario[];
    seed: number;
}): string {
    return JSON.stringify({
        actDiscount: fields.activationDiscountPercent,
        commission: fields.commissionPerRoundTrip,
        earlyWithdrawal: fields.plan.takesOneTimeEarlyWithdrawal,
        evalDiscount: fields.discountPercent,
        fundedHorizonDays: fields.fundedHorizonDays,
        fundedReset: fields.plan.takesFundedReset,
        linkAct: fields.linkActivationDiscount,
        maxEvalDays: fields.maxEvalDays,
        minRetainedCushion: fields.minRetainedCushion ?? null,
        msubDiscount: fields.monthlySubscriptionDiscountPercent,
        payoutRequestSize: fields.payoutRequestSize ?? null,
        planId: fields.plan.id,
        resetDiscount: fields.resetDiscountPercent,
        rungSizing: fields.rungSizing ?? null,
        scenarios: fields.scenarios.map((s) => ({
            a: s.accounts,
            c: s.correlation,
            ds: s.dayStop,
            g: s.groups,
            id: s.id,
            instrument: s.instrument,
            risk: s.riskPerTrade,
            rr: s.rrRatio,
            sp: s.stopPoints,
            tpd: s.tradesPerDay,
            wr: s.winrate,
        })),
        seed: fields.seed,
    });
}

function theoreticalPass(plan: Plan, scenario: LabScenario): TheoreticalPass {
    const pass = walkPassProbability({
        drawdown: dollars(plan.drawdown.amount),
        riskPerTrade: dollars(scenario.riskPerTrade),
        rrRatio: scenario.rrRatio,
        target: dollars(plan.profitTarget),
        winrate: fraction(scenario.winrate),
    });
    return pass.value === null
        ? { theoreticalPassProb: undefined, theoreticalPassReason: pass.reason }
        : { theoreticalPassProb: pass.value, theoreticalPassReason: undefined };
}
