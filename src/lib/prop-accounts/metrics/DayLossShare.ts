import {
    compareText,
    formatUsdCents,
    sumUsdCents,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    dayNumberOf,
    dollars,
    TradingPhase,
    weekdaysInRange,
} from '~/lib/prop-calculator';
import {
    ReconstructedLiveKind,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { feeEquivalentTradeRisk } from '~/lib/prop-calculator/economics';

import { AccountStateKind, type AccountStateResult } from './AccountStates';
import { fundedWithdrawableDollarsOf } from './FirmProfitConcentration';
import { fundedWithdrawableLossCents } from './FundedWithdrawableLoss';
import {
    PerformanceComparabilityKind,
    type PerformanceEventRow,
    PerformanceIncomparabilityReason,
    type PerformancePayoutRow,
    performanceSinceSnapshot,
} from './PerformanceSinceSnapshot';

export enum DayLossBasis {
    EvalFeeHeuristic = 'eval-fee-heuristic',
    EvalFromStateValue = 'eval-from-state-value',
    FundedWithdrawable = 'funded-withdrawable',
}

export enum DayLossUnmeasuredReason {
    FundedReset = 'funded-reset',
    LiveNotModeled = 'live-not-modeled',
    NoPreviousSnapshot = 'no-previous-snapshot',
    NoReconstruction = 'no-reconstruction',
    SpansSeveralDays = 'spans-several-days',
    StageChange = 'stage-change',
    Unpriceable = 'unpriceable',
}

export const DAY_LOSS_MAX_WEEKDAYS_APART = 1;

export const DAY_LOSS_EVAL_NOTE =
    'an eval loss is an approximation scaled to the retry fee, valid near a fresh eval; the fees already paid are never counted';

export const DAY_LOSS_EVAL_FROM_STATE_NOTE =
    'an eval loss priced from the account state is the drop in its from-state value between the two snapshots, from the same simulated trials and seed';

export const DAY_LOSS_FUNDED_NOTE =
    'a funded loss is the withdrawable above the retained cushion that was lost, so a loss that stays below the cushion shows as zero';

export interface DayLoss {
    readonly date: string;
    readonly entries: readonly DayLossEntry[];
    readonly lossCents: UsdCents;
    readonly share: null | number;
}

export interface DayLossAccount {
    readonly accountId: string;
    readonly events: readonly PerformanceEventRow[];
    readonly paidPayouts: readonly PerformancePayoutRow[];
    readonly state: AccountStateResult;
}

export interface DayLossEntry {
    readonly accountId: string;
    readonly basis: DayLossBasis;
    readonly lossCents: UsdCents;
}

export interface DayLossShare {
    readonly availableBankrollCents: null | UsdCents;
    readonly days: readonly DayLoss[];
    readonly measuredAccounts: number;
    readonly unmeasured: readonly DayLossUnmeasured[];
    readonly worstDay: DayLoss | null;
}

export interface DayLossShareInputs {
    readonly accounts: readonly DayLossAccount[];
    readonly availableBankrollCents: null | UsdCents;
    readonly evalValueLossDollars?: ReadonlyMap<string, number>;
    readonly rulebook: RulebookParameters;
}

export interface DayLossUnmeasured {
    readonly accountId: string;
    readonly reason: DayLossUnmeasuredReason;
}

type AccountLoss =
    | {
          readonly date: string;
          readonly entry: DayLossEntry;
          readonly kind: 'loss';
      }
    | { readonly kind: 'none' }
    | { readonly kind: 'unmeasured'; readonly reason: DayLossUnmeasuredReason };

const INCOMPARABLE_REASON: Readonly<
    Record<PerformanceIncomparabilityReason, DayLossUnmeasuredReason>
> = {
    [PerformanceIncomparabilityReason.FundedReset]:
        DayLossUnmeasuredReason.FundedReset,
    [PerformanceIncomparabilityReason.LiveNotModeled]:
        DayLossUnmeasuredReason.LiveNotModeled,
    [PerformanceIncomparabilityReason.NoPreviousSnapshot]:
        DayLossUnmeasuredReason.NoPreviousSnapshot,
    [PerformanceIncomparabilityReason.StageChange]:
        DayLossUnmeasuredReason.StageChange,
};

export function dayLossBasisNotes(day: DayLoss): readonly string[] {
    const bases = new Set(day.entries.map((entry) => entry.basis));
    return [
        ...(bases.has(DayLossBasis.FundedWithdrawable)
            ? [DAY_LOSS_FUNDED_NOTE]
            : []),
        ...(bases.has(DayLossBasis.EvalFeeHeuristic)
            ? [DAY_LOSS_EVAL_NOTE]
            : []),
        ...(bases.has(DayLossBasis.EvalFromStateValue)
            ? [DAY_LOSS_EVAL_FROM_STATE_NOTE]
            : []),
    ];
}

export function dayLossBreakdownText(day: DayLoss): string {
    const totalOf = (basis: DayLossBasis): UsdCents =>
        sumUsdCents(
            day.entries
                .filter((entry) => entry.basis === basis)
                .map((entry) => entry.lossCents),
        );
    const funded = totalOf(DayLossBasis.FundedWithdrawable);
    const heuristic = totalOf(DayLossBasis.EvalFeeHeuristic);
    const fromState = totalOf(DayLossBasis.EvalFromStateValue);
    return [
        ...(funded > 0
            ? [`${formatUsdCents(funded)} of withdrawable on funded accounts`]
            : []),
        ...(heuristic > 0
            ? [`${formatUsdCents(heuristic)} of estimated eval value`]
            : []),
        ...(fromState > 0
            ? [
                  `${formatUsdCents(fromState)} of eval value lost between the two snapshots`,
              ]
            : []),
    ].join(' and ');
}

export function dayLossShareOf(inputs: DayLossShareInputs): DayLossShare {
    const { availableBankrollCents } = inputs;
    const hasBankroll =
        availableBankrollCents !== null && availableBankrollCents > 0;
    const losses = inputs.accounts.map((account) => ({
        account,
        loss: accountLossOf(account, inputs),
    }));
    const unmeasured = losses.flatMap(({ account, loss }) =>
        loss.kind === 'unmeasured'
            ? [{ accountId: account.accountId, reason: loss.reason }]
            : [],
    );
    const byDate = Map.groupBy(
        losses.flatMap(({ loss }) => (loss.kind === 'loss' ? [loss] : [])),
        (loss) => loss.date,
    );
    const days = byDate
        .entries()
        .map(([date, members]): DayLoss => {
            const lossCents = sumUsdCents(
                members.map((member) => member.entry.lossCents),
            );
            return {
                date,
                entries: members.map((member) => member.entry),
                lossCents,
                share: hasBankroll ? lossCents / availableBankrollCents : null,
            };
        })
        .toArray()
        .toSorted((a, b) => compareText(b.date, a.date));
    return {
        availableBankrollCents,
        days,
        measuredAccounts: losses.filter(
            ({ loss }) => loss.kind !== 'unmeasured',
        ).length,
        unmeasured,
        worstDay: worstOf(days),
    };
}

function accountLossOf(
    account: DayLossAccount,
    inputs: DayLossShareInputs,
): AccountLoss {
    const { state } = account;
    if (state.kind !== AccountStateKind.Reconstructed) {
        return {
            kind: 'unmeasured',
            reason: DayLossUnmeasuredReason.NoReconstruction,
        };
    }
    const { latest, previous } = state;
    const performance = performanceSinceSnapshot(
        latest.reconstructed,
        latest.asOf,
        previous?.reconstructed ?? null,
        previous?.asOf ?? null,
        account.events,
        account.paidPayouts,
    );
    if (performance.kind === PerformanceComparabilityKind.NotComparable) {
        return {
            kind: 'unmeasured',
            reason: INCOMPARABLE_REASON[performance.reason],
        };
    }
    const { reconstructed } = latest;
    if (reconstructed.kind === ReconstructedLiveKind.Live) {
        return {
            kind: 'unmeasured',
            reason: DayLossUnmeasuredReason.LiveNotModeled,
        };
    }
    if (
        previous !== null &&
        isSpanningSeveralDays(previous.asOf, latest.asOf)
    ) {
        return {
            kind: 'unmeasured',
            reason: DayLossUnmeasuredReason.SpansSeveralDays,
        };
    }
    const previousAccount = previous?.reconstructed ?? null;
    if (
        reconstructed.kind === TradingPhase.Funded &&
        previousAccount?.kind === TradingPhase.Funded
    ) {
        const after = usdCentsFromDollars(
            fundedWithdrawableDollarsOf(inputs.rulebook, reconstructed),
        );
        return lossOf(
            account.accountId,
            latest.asOf,
            DayLossBasis.FundedWithdrawable,
            fundedWithdrawableLossCents({
                latestWithdrawableCents: after,
                payoutsPaidGrossCents: usdCentsFromDollars(
                    performance.payoutsPaidGross,
                ),
                previous: previousAccount,
                profitSinceSnapshotDollars: performance.profitSinceSnapshot,
                rulebook: inputs.rulebook,
            }),
        );
    }
    if (reconstructed.kind !== TradingPhase.Eval) return { kind: 'none' };
    const fromState = inputs.evalValueLossDollars?.get(account.accountId);
    if (fromState !== undefined) {
        return lossOf(
            account.accountId,
            latest.asOf,
            DayLossBasis.EvalFromStateValue,
            usdCentsFromDollars(fromState),
        );
    }
    const droppedDollars = Math.max(0, -performance.profitSinceSnapshot);
    if (droppedDollars === 0) return { kind: 'none' };
    const heuristic = feeEquivalentTradeRisk({
        evalDrawdown: dollars(reconstructed.plan.drawdown.amount),
        retryFee: dollars(reconstructed.plan.retryFee()),
        risk: dollars(droppedDollars),
    });
    return heuristic.value === null
        ? { kind: 'unmeasured', reason: DayLossUnmeasuredReason.Unpriceable }
        : lossOf(
              account.accountId,
              latest.asOf,
              DayLossBasis.EvalFeeHeuristic,
              usdCentsFromDollars(heuristic.value),
          );
}

function isSpanningSeveralDays(
    previousAsOf: string,
    latestAsOf: string,
): boolean {
    return (
        weekdaysInRange(
            dayNumberOf(previousAsOf) + 1,
            dayNumberOf(latestAsOf) + 1,
        ) > DAY_LOSS_MAX_WEEKDAYS_APART
    );
}

function lossOf(
    accountId: string,
    date: string,
    basis: DayLossBasis,
    lossCents: number,
): AccountLoss {
    return lossCents > 0
        ? {
              date,
              entry: { accountId, basis, lossCents: usdCents(lossCents) },
              kind: 'loss',
          }
        : { kind: 'none' };
}

function worstOf(days: readonly DayLoss[]): DayLoss | null {
    return days.reduce<DayLoss | null>((worst, day) => {
        if (worst === null) return day;
        const worstKey = worst.share ?? worst.lossCents;
        const dayKey = day.share ?? day.lossCents;
        return dayKey > worstKey ? day : worst;
    }, null);
}
