import {
    type FirmKey,
    isoMonthOf,
    type RuleViolationKind,
    type UsdCents,
    type ViolationSource,
} from '~/lib/prop-accounts/core';

export const NOT_PATH_ADJUSTED_DISCLOSURE =
    'Not path-adjusted: a skipped trade changes later drawdown and bust paths, so this is a cash-basis estimate only.';

export interface NetCashBucket {
    readonly accountId: string;
    readonly firmKey: FirmKey;
    readonly month: string;
    readonly netCashCents: UsdCents;
}

export interface TiltVarianceInput {
    readonly firmKeyByAccount?: ReadonlyMap<string, FirmKey>;
    readonly netCashByBucket: readonly NetCashBucket[];
    readonly violations: readonly TiltVarianceViolation[];
}

export interface TiltVarianceRow {
    readonly accountId: string;
    readonly firmKey: FirmKey;
    readonly month: string;
    readonly netCashCents: number;
    readonly netWithoutViolationsCents: number;
    readonly violationCostCents: number;
}

export interface TiltVarianceSplit {
    readonly disclosure: string;
    readonly droppedViolations: number;
    readonly rows: readonly TiltVarianceRow[];
}

export interface TiltVarianceViolation {
    readonly accountId: string;
    readonly costCents: null | UsdCents;
    readonly kind: RuleViolationKind;
    readonly occurredOn: string;
    readonly source: ViolationSource;
}

interface ViolationBucket {
    readonly accountId: string;
    readonly firmKey: FirmKey;
    readonly month: string;
}

export function tiltVarianceSplitOf(
    input: TiltVarianceInput,
): TiltVarianceSplit {
    const firmByAccount = new Map(input.firmKeyByAccount);
    for (const bucket of input.netCashByBucket) {
        if (!firmByAccount.has(bucket.accountId)) {
            firmByAccount.set(bucket.accountId, bucket.firmKey);
        }
    }
    const cashByBucket = new Map<string, NetCashBucket>();
    for (const bucket of input.netCashByBucket) {
        cashByBucket.set(bucketKey(bucket.accountId, bucket.month), bucket);
    }
    const costByBucket = new Map<string, number>();
    const violationOnlyBuckets = new Map<string, ViolationBucket>();
    let droppedViolations = 0;
    for (const violation of input.violations) {
        const month = isoMonthOf(violation.occurredOn);
        const key = bucketKey(violation.accountId, month);
        const firmKey = firmByAccount.get(violation.accountId);
        if (firmKey === undefined) {
            droppedViolations += 1;
            continue;
        }
        if (!cashByBucket.has(key) && !violationOnlyBuckets.has(key)) {
            violationOnlyBuckets.set(key, {
                accountId: violation.accountId,
                firmKey,
                month,
            });
        }
        if (violation.costCents === null) continue;
        costByBucket.set(
            key,
            (costByBucket.get(key) ?? 0) + violation.costCents,
        );
    }
    const buckets: readonly ViolationBucket[] = [
        ...cashByBucket.values(),
        ...violationOnlyBuckets.values(),
    ];
    return {
        disclosure: NOT_PATH_ADJUSTED_DISCLOSURE,
        droppedViolations,
        rows: buckets.map((bucket) => {
            const key = bucketKey(bucket.accountId, bucket.month);
            const netCashCents = cashByBucket.get(key)?.netCashCents ?? 0;
            const violationCostCents = costByBucket.get(key) ?? 0;
            return {
                accountId: bucket.accountId,
                firmKey: bucket.firmKey,
                month: bucket.month,
                netCashCents,
                netWithoutViolationsCents: netCashCents + violationCostCents,
                violationCostCents,
            };
        }),
    };
}

function bucketKey(accountId: string, month: string): string {
    return `${accountId}|${month}`;
}
