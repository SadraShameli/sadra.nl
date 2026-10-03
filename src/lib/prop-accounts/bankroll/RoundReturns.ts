import {
    compareText,
    type FirmKey,
    firmKeyId,
    isEndedStatus,
    RoundStatus,
    sampleAdequacy,
    SampleKind,
    type SampleLevel,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    attemptsOf,
    finalState,
    type LedgerAccount,
    type LedgerRoundRow,
    payoutMultiple,
    type PortfolioLedger,
    roundFirmKeyOf,
    type SampledEstimate,
    sampledRate,
    summarizeCash,
} from '~/lib/prop-accounts/metrics';
import { dollars } from '~/lib/prop-calculator';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';
import {
    bankrollCohortRisk,
    batchLossClosedForm,
    empiricalPayingStatsOf,
} from '~/lib/prop-calculator/economics';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { percentile } from '~/lib/prop-calculator/stats';

import { roundBudgetStatus, type RoundBudgetStatus } from './RoundBudget';
import { roundCycleDaysOf } from './RoundCycle';

const BOOTSTRAP_INTERVAL_LOWER_PERCENTILE = 10;
const BOOTSTRAP_INTERVAL_UPPER_PERCENTILE = 90;
const MULTIPLE_BOOTSTRAP_RESAMPLES = 500;

export interface RoundBootstrapInterval {
    readonly lower: number;
    readonly upper: number;
}

export interface RoundFirmSummary {
    readonly closedRounds: number;
    readonly firmKey: FirmKey;
    readonly max: null | number;
    readonly mean: null | number;
    readonly min: null | number;
    readonly rounds: number;
    readonly sampleLevel: null | SampleLevel;
    readonly sharePositive: null | SampledEstimate;
}

export interface RoundMultiple {
    readonly interval: RoundBootstrapInterval;
    readonly n: number;
    readonly value: null | number;
}

export interface RoundReturn {
    readonly budget: RoundBudgetStatus;
    readonly closedOn: null | string;
    readonly cycleDays: null | number;
    readonly firmKey: FirmKey | null;
    readonly id: string;
    readonly label: string;
    readonly likeThisEndsNetNegative: null | {
        readonly attempts: number;
        readonly value: SampledEstimate;
    };
    readonly likeThisEndsNetNegativeClosedForm: null | number;
    readonly netCents: number;
    readonly openedOn: string;
    readonly openMemberCount: number;
    readonly ownOutcomeNetNegative: boolean;
    readonly payoutsCents: number;
    readonly realizedMultiple: null | RoundMultiple;
    readonly spendCents: number;
    readonly status: LedgerRoundRow['status'];
    readonly toDateMultiple: null | number;
}

export interface RoundReturnsInputs {
    readonly draws: number;
    readonly ledger: PortfolioLedger;
    readonly poolNetValuesDollars: readonly number[];
    readonly sampleThresholds: SampleThresholds;
    readonly seed: number;
}

export interface RoundReturnsResult {
    readonly perFirm: readonly RoundFirmSummary[];
    readonly rounds: readonly RoundReturn[];
    readonly unassignedRoundCount: number;
}

export function roundReturns(inputs: RoundReturnsInputs): RoundReturnsResult {
    const rounds = inputs.ledger.rounds.map((round) =>
        roundReturnOf(inputs, round),
    );
    return {
        perFirm: perFirmSummaries(rounds, inputs.sampleThresholds),
        rounds,
        unassignedRoundCount: rounds.filter((round) => round.firmKey === null)
            .length,
    };
}

function bootstrapMultiple(
    entries: readonly LedgerAccount[],
    seed: number,
): null | RoundMultiple {
    if (entries.length === 0) return null;
    const cash = entries.map((entry) =>
        summarizeCash(entry.fees, entry.payouts),
    );
    const value = payoutMultiple(
        usdCents(cash.reduce((sum, c) => sum + c.payouts, 0)),
        usdCents(cash.reduce((sum, c) => sum + c.spend, 0)),
    );
    if (value === null) return null;
    const rng = mulberry32(seed);
    const resamples: number[] = [];
    for (let sample = 0; sample < MULTIPLE_BOOTSTRAP_RESAMPLES; sample += 1) {
        const draws = Array.from(
            { length: cash.length },
            () => cash[Math.floor(rng() * cash.length)],
        );
        const spend = draws.reduce((sum, pick) => sum + (pick?.spend ?? 0), 0);
        const payouts = draws.reduce(
            (sum, pick) => sum + (pick?.payouts ?? 0),
            0,
        );
        if (spend !== 0) resamples.push(payouts / spend);
    }
    return {
        interval: {
            lower: percentile(resamples, BOOTSTRAP_INTERVAL_LOWER_PERCENTILE),
            upper: percentile(resamples, BOOTSTRAP_INTERVAL_UPPER_PERCENTILE),
        },
        n: entries.length,
        value,
    };
}

function isEnded(entry: LedgerAccount): boolean {
    const status = finalState(entry)?.status;
    return status !== undefined && isEndedStatus(status);
}

function likeThisEndsNetNegativeClosedFormOf(
    poolNetValuesDollars: readonly number[],
    attempts: number,
    attemptCostDollars: number,
): null | number {
    if (attempts === 0 || poolNetValuesDollars.length === 0) return null;
    const empirical = empiricalPayingStatsOf(
        poolNetValuesDollars,
        attemptCostDollars,
    );
    const outcome = batchLossClosedForm({
        attemptCost: dollars(attemptCostDollars),
        attempts,
        pAttemptPays: empirical.pAttemptPays,
        valuePerPayingAttempt: empirical.valuePerPayingAttempt,
    });
    return outcome.value ?? null;
}

function likeThisEndsNetNegativeOf(
    poolNetValuesDollars: readonly number[],
    attempts: number,
    draws: number,
    seed: number,
): null | { readonly attempts: number; readonly value: SampledEstimate } {
    if (attempts === 0 || poolNetValuesDollars.length === 0) return null;
    const outcome = bankrollCohortRisk(
        poolNetValuesDollars,
        attempts,
        draws,
        seed,
    ).value;
    if (outcome === null) return null;
    return {
        attempts,
        value: {
            interval: null,
            n: draws,
            standardError: outcome.lossProbability.standardError,
            value: outcome.lossProbability.value,
        },
    };
}

function perFirmSummaries(
    rounds: readonly RoundReturn[],
    sampleThresholds: SampleThresholds,
): readonly RoundFirmSummary[] {
    const byFirm = new Map<
        string,
        { readonly firmKey: FirmKey; readonly rounds: RoundReturn[] }
    >();
    for (const round of rounds) {
        if (round.firmKey === null) continue;
        const key = firmKeyId(round.firmKey);
        const group = byFirm.get(key);
        if (group === undefined) {
            byFirm.set(key, { firmKey: round.firmKey, rounds: [round] });
        } else {
            group.rounds.push(round);
        }
    }
    return byFirm
        .values()
        .map(({ firmKey, rounds: group }) => {
            const closed = group.filter(
                (round) => round.status === RoundStatus.Closed,
            );
            const multiples = closed.flatMap((round) =>
                round.toDateMultiple === null ? [] : [round.toDateMultiple],
            );
            return {
                closedRounds: closed.length,
                firmKey,
                max: multiples.length === 0 ? null : Math.max(...multiples),
                mean:
                    multiples.length === 0
                        ? null
                        : multiples.reduce((sum, value) => sum + value, 0) /
                          multiples.length,
                min: multiples.length === 0 ? null : Math.min(...multiples),
                rounds: group.length,
                sampleLevel: sampleAdequacy(
                    SampleKind.ClosedRounds,
                    closed.length,
                    sampleThresholds,
                ),
                sharePositive: sampledRate(
                    multiples.filter((value) => value > 1).length,
                    multiples.length,
                ),
            };
        })
        .toArray()
        .toSorted((a, b) =>
            compareText(firmKeyId(a.firmKey), firmKeyId(b.firmKey)),
        );
}

function roundReturnOf(
    inputs: RoundReturnsInputs,
    round: LedgerRoundRow,
): RoundReturn {
    const members = inputs.ledger.membersOfRound(round.id);
    const cash = summarizeCash(
        members.flatMap((entry) => entry.fees),
        members.flatMap((entry) => entry.payouts),
    );
    const ended = members.filter(isEnded);
    const attempts = members.reduce((sum, entry) => sum + attemptsOf(entry), 0);
    const attemptCostDollars = attempts === 0 ? 0 : cash.spend / 100 / attempts;
    return {
        budget: roundBudgetStatus(round.budgetCents, cash.spend),
        closedOn: round.closedOn,
        cycleDays: roundCycleDaysOf(inputs.ledger, round),
        firmKey: roundFirmKeyOf(round),
        id: round.id,
        label: round.label,
        likeThisEndsNetNegative: likeThisEndsNetNegativeOf(
            inputs.poolNetValuesDollars,
            attempts,
            inputs.draws,
            inputs.seed,
        ),
        likeThisEndsNetNegativeClosedForm: likeThisEndsNetNegativeClosedFormOf(
            inputs.poolNetValuesDollars,
            attempts,
            attemptCostDollars,
        ),
        netCents: cash.net,
        openedOn: round.openedOn,
        openMemberCount: members.length - ended.length,
        ownOutcomeNetNegative: cash.net < 0,
        payoutsCents: cash.payouts,
        realizedMultiple: bootstrapMultiple(ended, inputs.seed),
        spendCents: cash.spend,
        status: round.status,
        toDateMultiple: payoutMultiple(
            usdCents(cash.payouts),
            usdCents(cash.spend),
        ),
    };
}
