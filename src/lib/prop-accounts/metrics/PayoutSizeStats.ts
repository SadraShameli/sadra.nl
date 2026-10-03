import {
    AccountEventKind,
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    compareFirmKeys,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    latestEventOn,
    paidPayoutCash,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    histogram,
    type HistogramBin,
    median,
    percentile,
} from '~/lib/prop-calculator/stats';

import {
    type LedgerPayoutRow,
    type ModeledLedgerAccount,
    type PortfolioLedger,
    roundCents,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';

export const DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS = usdCents(50_000);

enum BalanceBand {
    AboveCushion = 'above-cushion',
    LowBalance = 'low-balance',
    NoSnapshot = 'no-snapshot',
}

export interface PayoutsByAccountSize {
    readonly accountSize: number;
    readonly count: number;
    readonly mean: null | SampledEstimate;
}

export interface PayoutsByBalance {
    readonly aboveCushion: PayoutBalanceBand;
    readonly lowBalance: PayoutBalanceBand;
    readonly noSnapshot: PayoutBalanceBand;
}

export interface PayoutsByFirm {
    readonly count: number;
    readonly firmKey: FirmKey;
    readonly mean: null | SampledEstimate;
}

export interface PayoutsByStage {
    readonly count: number;
    readonly mean: null | SampledEstimate;
    readonly stage: AccountStage;
}

export interface PayoutSizeSnapshotBalance {
    readonly balanceCents: UsdCents;
    readonly dashboardFloorCents: UsdCents;
}

export interface PayoutSizeStats {
    readonly bucketWidthCents: number;
    readonly byAccountSize: readonly PayoutsByAccountSize[];
    readonly byBalance: PayoutsByBalance;
    readonly byFirm: readonly PayoutsByFirm[];
    readonly byStage: readonly PayoutsByStage[];
    readonly count: number;
    readonly grossOnlyPayouts: number;
    readonly histogram: readonly HistogramBin[];
    readonly lowBalanceCount: number;
    readonly mean: null | SampledEstimate;
    readonly median: UsdCents;
    readonly p10: UsdCents;
    readonly p90: UsdCents;
}

export interface PayoutSizeStatsOptions {
    readonly bucketWidthCents?: UsdCents;
    readonly latestBalanceOnOrBefore?: (
        accountId: string,
        asOf: string,
    ) => null | PayoutSizeSnapshotBalance;
    readonly retainedCushionCents?: UsdCents;
}

interface PayoutBalanceBand {
    readonly count: number;
    readonly mean: null | SampledEstimate;
    readonly median: null | UsdCents;
}

interface PayoutSizeSample {
    readonly accountSize: number;
    readonly balanceBand: BalanceBand;
    readonly cents: UsdCents;
    readonly firmKey: FirmKey;
    readonly grossOnly: boolean;
    readonly stage: AccountStage;
}

export function payoutSizeStats(
    ledger: PortfolioLedger,
    options: PayoutSizeStatsOptions = {},
): PayoutSizeStats {
    const bucketWidthCents =
        options.bucketWidthCents ?? DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS;
    const samples = ledger.resolvedAccounts.flatMap((entry) =>
        samplesOf(entry, options),
    );
    const cents = samples.map((sample) => sample.cents);
    const bins = histogramOf(cents, bucketWidthCents);
    return {
        bucketWidthCents: realBucketWidth(bins),
        byAccountSize: byAccountSize(samples),
        byBalance: byBalance(samples),
        byFirm: byFirm(samples),
        byStage: byStage(samples),
        count: samples.length,
        grossOnlyPayouts: samples.filter((sample) => sample.grossOnly).length,
        histogram: bins,
        lowBalanceCount: samples.filter(
            (sample) => sample.balanceBand === BalanceBand.LowBalance,
        ).length,
        mean: sampledMean(cents),
        median: roundCents(median(cents)),
        p10: roundCents(percentile(cents, 10)),
        p90: roundCents(percentile(cents, 90)),
    };
}

function balanceBandAt(
    accountId: string,
    paidOn: string,
    options: PayoutSizeStatsOptions,
): BalanceBand {
    const { latestBalanceOnOrBefore, retainedCushionCents } = options;
    if (
        latestBalanceOnOrBefore === undefined ||
        retainedCushionCents === undefined
    ) {
        return BalanceBand.NoSnapshot;
    }
    const balance = latestBalanceOnOrBefore(accountId, paidOn);
    if (balance === null) return BalanceBand.NoSnapshot;
    return balance.balanceCents - balance.dashboardFloorCents <
        retainedCushionCents
        ? BalanceBand.LowBalance
        : BalanceBand.AboveCushion;
}

function balanceBandOf(
    samples: readonly PayoutSizeSample[],
    band: BalanceBand,
): PayoutBalanceBand {
    const cents = samples
        .filter((sample) => sample.balanceBand === band)
        .map((sample) => sample.cents);
    return {
        count: cents.length,
        mean: sampledMean(cents),
        median: cents.length === 0 ? null : roundCents(median(cents)),
    };
}

function byAccountSize(
    samples: readonly PayoutSizeSample[],
): readonly PayoutsByAccountSize[] {
    const sizes = [
        ...new Set(samples.map((sample) => sample.accountSize)),
    ].toSorted((a, b) => a - b);
    return sizes.map((accountSize) => {
        const group = samples.filter(
            (sample) => sample.accountSize === accountSize,
        );
        return {
            accountSize,
            count: group.length,
            mean: sampledMean(group.map((sample) => sample.cents)),
        };
    });
}

function byBalance(samples: readonly PayoutSizeSample[]): PayoutsByBalance {
    return {
        aboveCushion: balanceBandOf(samples, BalanceBand.AboveCushion),
        lowBalance: balanceBandOf(samples, BalanceBand.LowBalance),
        noSnapshot: balanceBandOf(samples, BalanceBand.NoSnapshot),
    };
}

function byFirm(
    samples: readonly PayoutSizeSample[],
): readonly PayoutsByFirm[] {
    const byKey = new Map<
        string,
        { firmKey: FirmKey; items: PayoutSizeSample[] }
    >();
    for (const sample of samples) {
        const id = firmKeyId(sample.firmKey);
        const entry = byKey.get(id);
        if (entry === undefined) {
            byKey.set(id, { firmKey: sample.firmKey, items: [sample] });
        } else {
            entry.items.push(sample);
        }
    }
    return byKey
        .values()
        .toArray()
        .toSorted((a, b) => compareFirmKeys(a.firmKey, b.firmKey))
        .map(({ firmKey, items }) => ({
            count: items.length,
            firmKey,
            mean: sampledMean(items.map((sample) => sample.cents)),
        }));
}

function byStage(
    samples: readonly PayoutSizeSample[],
): readonly PayoutsByStage[] {
    return Object.values(AccountStage).flatMap((stage) => {
        const group = samples.filter((sample) => sample.stage === stage);
        return group.length === 0
            ? []
            : [
                  {
                      count: group.length,
                      mean: sampledMean(group.map((sample) => sample.cents)),
                      stage,
                  },
              ];
    });
}

function histogramOf(
    cents: readonly number[],
    bucketWidthCents: number,
): readonly HistogramBin[] {
    if (cents.length === 0) return [];
    const min = Math.min(...cents);
    const max = Math.max(...cents);
    const span = max - min;
    const binCount =
        span <= 0 ? 1 : Math.max(1, Math.ceil(span / bucketWidthCents));
    return histogram(cents, binCount);
}

function latestOn(
    entry: ModeledLedgerAccount,
    kind: AccountEventKind,
): null | string {
    return latestEventOn(
        entry.transitions.map((transition) => ({
            kind: transition.kind,
            occurredOn: transition.on,
        })),
        kind,
    );
}

function realBucketWidth(bins: readonly HistogramBin[]): number {
    const first = bins[0];
    const last = bins.at(-1);
    return first === undefined || last === undefined
        ? 0
        : (last.binEnd - first.binStart) / bins.length;
}

function sampleOf(
    entry: ModeledLedgerAccount,
    row: LedgerPayoutRow,
    accountSize: number,
    firmKey: FirmKey,
    stageStarts: AccountStageStarts,
    options: PayoutSizeStatsOptions,
): readonly PayoutSizeSample[] {
    const paid = paidPayoutCash(row);
    if (!paid?.paidOn || entry.plan === null) return [];
    const stage = accountStageOn(
        {
            fundedOn: entry.row.fundedOn,
            purchasedOn: entry.row.purchasedOn,
            stage: entry.row.stage,
        },
        entry.plan.plan,
        stageStarts,
        paid.paidOn,
    );
    return [
        {
            accountSize,
            balanceBand: balanceBandAt(entry.row.id, paid.paidOn, options),
            cents: paid.cents,
            firmKey,
            grossOnly: paid.grossOnly,
            stage,
        },
    ];
}

function samplesOf(
    entry: ModeledLedgerAccount,
    options: PayoutSizeStatsOptions,
): readonly PayoutSizeSample[] {
    if (entry.plan === null) return [];
    const firmKey = firmKeyOf(entry.row);
    const accountSize = entry.plan.plan.id.accountSize;
    const stageStarts: AccountStageStarts = {
        evalPassedOn: latestOn(entry, AccountEventKind.EvalPassed),
        movedLiveOn: latestOn(entry, AccountEventKind.MovedLive),
    };
    return entry.payouts.flatMap((row) =>
        sampleOf(entry, row, accountSize, firmKey, stageStarts, options),
    );
}
