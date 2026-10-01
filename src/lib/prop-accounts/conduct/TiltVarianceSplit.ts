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
    readonly rows: readonly TiltVarianceRow[];
}

export interface TiltVarianceViolation {
    readonly accountId: string;
    readonly costCents: null | UsdCents;
    readonly kind: RuleViolationKind;
    readonly occurredOn: string;
    readonly source: ViolationSource;
}

export function tiltVarianceSplitOf(
    input: TiltVarianceInput,
): TiltVarianceSplit {
    const costByBucket = new Map<string, number>();
    for (const violation of input.violations) {
        if (violation.costCents === null) continue;
        const key = `${violation.accountId}|${isoMonthOf(violation.occurredOn)}`;
        costByBucket.set(key, (costByBucket.get(key) ?? 0) + violation.costCents);
    }
    return {
        disclosure: NOT_PATH_ADJUSTED_DISCLOSURE,
        rows: input.netCashByBucket.map((bucket) => {
            const violationCostCents =
                costByBucket.get(`${bucket.accountId}|${bucket.month}`) ?? 0;
            return {
                accountId: bucket.accountId,
                firmKey: bucket.firmKey,
                month: bucket.month,
                netCashCents: bucket.netCashCents,
                netWithoutViolationsCents:
                    bucket.netCashCents + violationCostCents,
                violationCostCents,
            };
        }),
    };
}
