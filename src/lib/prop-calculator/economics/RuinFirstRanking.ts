import { type Dollars } from '~/lib/prop-calculator/core';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

import {
    bankrollAttempts,
    bankrollCohortRisk,
    type BankrollRiskOutputs,
} from './BankrollRiskFigures';
import { LOSS_RISK_DRAWS } from './CohortOutcome';

export enum BatchLossStatus {
    NoAttempt = 'no-attempt',
    Priced = 'priced',
    Unpriced = 'unpriced',
}

export enum RuinFirstFallback {
    NeedsBankroll = 'needs-bankroll',
    NoAttempt = 'no-attempt',
    NoPositiveEv = 'no-positive-ev',
    Unpriced = 'unpriced',
}

export type BatchLossPricing =
    | { readonly probability: number; readonly status: BatchLossStatus.Priced }
    | {
          readonly status: BatchLossStatus.NoAttempt | BatchLossStatus.Unpriced;
      };

export interface RuinFirstRankable {
    readonly out: Pick<
        SimOutputs,
        'expectedMonthlyNet' | 'expectedNetPerAttempt'
    >;
}

export interface RuinFirstRanking<Row> {
    readonly fallback: null | RuinFirstFallback;
    readonly note: null | string;
    readonly rows: Row[];
}

export interface RuinFirstRequest<Row> {
    readonly bankroll: Dollars | null;
    readonly batchLoss: (row: Row, bankroll: Dollars) => BatchLossPricing;
}

const MAX_PRICING_SAMPLES = 2_000_000;
const MIN_PRICING_DRAWS = 500;

export const RUIN_FIRST_NEEDS_BANKROLL_NOTE =
    'Ruin first needs a known bankroll to price the chance a batch of attempts ends below zero, so this table ranks by monthly net until one is set';

export const RUIN_FIRST_NO_ATTEMPT_NOTE =
    'Your bankroll affords no attempt of any plan in this table, so ruin first fell back to monthly net';

export const RUIN_FIRST_NO_POSITIVE_EV_NOTE =
    'No plan in this table has EV per attempt above zero, so ruin first ranks none and the rows stay on monthly net';

export const RUIN_FIRST_UNPRICED_NOTE =
    'Your bankroll affords more attempts than a batch can be simulated for, so ruin first could not price the chance a batch ends below zero and fell back to monthly net';

export const RUIN_FIRST_FALLBACK_NOTE: Readonly<
    Record<RuinFirstFallback, string>
> = {
    [RuinFirstFallback.NeedsBankroll]: RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    [RuinFirstFallback.NoAttempt]: RUIN_FIRST_NO_ATTEMPT_NOTE,
    [RuinFirstFallback.NoPositiveEv]: RUIN_FIRST_NO_POSITIVE_EV_NOTE,
    [RuinFirstFallback.Unpriced]: RUIN_FIRST_UNPRICED_NOTE,
};

export function hasPositiveEvPerAttempt(
    out: Pick<SimOutputs, 'expectedNetPerAttempt'>,
): boolean {
    return out.expectedNetPerAttempt > 0;
}

export function priceBatchLoss(
    out: BankrollRiskOutputs,
    bankroll: Dollars,
    seed: number,
): BatchLossPricing {
    const attempts = bankrollAttempts(out, bankroll);
    if (attempts === null || attempts < 1) {
        return { status: BatchLossStatus.NoAttempt };
    }
    const draws = Math.min(
        LOSS_RISK_DRAWS,
        Math.floor(MAX_PRICING_SAMPLES / attempts),
    );
    if (draws < MIN_PRICING_DRAWS) return { status: BatchLossStatus.Unpriced };
    const probability = bankrollCohortRisk(out.netValues, attempts, draws, seed)
        .value?.lossProbability.value;
    return probability === undefined
        ? { status: BatchLossStatus.Unpriced }
        : { probability, status: BatchLossStatus.Priced };
}

export function rankRuinFirst<Row extends RuinFirstRankable>(
    rows: readonly Row[],
    request: RuinFirstRequest<Row>,
): RuinFirstRanking<Row> {
    const { bankroll, batchLoss } = request;
    if (bankroll === null || bankroll <= 0) {
        return monthlyNetFallback(rows, RuinFirstFallback.NeedsBankroll);
    }
    const positive = rows.filter((row) => hasPositiveEvPerAttempt(row.out));
    if (positive.length === 0) {
        return monthlyNetFallback(rows, RuinFirstFallback.NoPositiveEv);
    }
    const pricings = new Map(
        positive.map((row) => [row, batchLoss(row, bankroll)]),
    );
    const lossOf = (row: Row): null | number => {
        const pricing = pricings.get(row);
        return pricing?.status === BatchLossStatus.Priced
            ? pricing.probability
            : null;
    };
    if (positive.every((row) => lossOf(row) === null)) {
        const isUnpriced = pricings
            .values()
            .some((pricing) => pricing.status === BatchLossStatus.Unpriced);
        return monthlyNetFallback(
            rows,
            isUnpriced
                ? RuinFirstFallback.Unpriced
                : RuinFirstFallback.NoAttempt,
        );
    }
    return {
        fallback: null,
        note: null,
        rows: rows.toSorted((a, b) => compareRuinFirst(a, b, lossOf)),
    };
}

function byMonthlyNet(a: RuinFirstRankable, b: RuinFirstRankable): number {
    return b.out.expectedMonthlyNet - a.out.expectedMonthlyNet;
}

function compareRuinFirst<Row extends RuinFirstRankable>(
    a: Row,
    b: Row,
    lossOf: (row: Row) => null | number,
): number {
    const positivity =
        Number(!hasPositiveEvPerAttempt(a.out)) -
        Number(!hasPositiveEvPerAttempt(b.out));
    if (positivity !== 0) return positivity;
    const lossA = lossOf(a);
    const lossB = lossOf(b);
    if (lossA === null || lossB === null) {
        if (lossA !== lossB) return lossA === null ? 1 : -1;
    } else if (lossA !== lossB) {
        return lossA - lossB;
    }
    return byMonthlyNet(a, b);
}

function monthlyNetFallback<Row extends RuinFirstRankable>(
    rows: readonly Row[],
    fallback: RuinFirstFallback,
): RuinFirstRanking<Row> {
    return {
        fallback,
        note: RUIN_FIRST_FALLBACK_NOTE[fallback],
        rows: rows.toSorted(byMonthlyNet),
    };
}
