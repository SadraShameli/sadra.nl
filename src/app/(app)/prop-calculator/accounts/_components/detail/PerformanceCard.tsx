import { formatCurrency, formatDays } from '~/lib/format';
import {
    PerformanceComparabilityKind,
    PerformanceIncomparabilityReason,
} from '~/lib/prop-accounts';
import {
    type ConsistencyStatus,
    ConsistencyStatusKind,
    type PerformanceSinceSnapshot,
} from '~/lib/prop-accounts/metrics';

import { type PerformanceCardView } from './detailState';

const INCOMPARABILITY_LABEL: Readonly<
    Record<PerformanceIncomparabilityReason, string>
> = {
    [PerformanceIncomparabilityReason.FundedReset]:
        'A funded reset happened since the previous snapshot, so the change is not comparable.',
    [PerformanceIncomparabilityReason.LiveNotModeled]:
        'No live stage is modeled for this plan, so the change since the previous snapshot cannot be shown.',
    [PerformanceIncomparabilityReason.NoPreviousSnapshot]:
        'There is no previous snapshot to compare against yet.',
    [PerformanceIncomparabilityReason.StageChange]:
        'The account changed stage since the previous snapshot, so the change is not comparable.',
};

export function PerformanceCard({
    view,
}: {
    readonly view: PerformanceCardView;
}) {
    return (
        <div className="flex flex-col gap-4">
            <PerformanceSummary performance={view.performance} />
            <ConsistencySummary consistency={view.consistency} />
        </div>
    );
}

function ConsistencySummary({
    consistency,
}: {
    readonly consistency: ConsistencyStatus;
}) {
    switch (consistency.kind) {
        case ConsistencyStatusKind.Evaluated: {
            return (
                <p className="text-sm">
                    Best day {formatCurrency(consistency.bestDayProfit)} of{' '}
                    {formatCurrency(consistency.totalProfit)} total profit
                    against {consistency.rule.shareLabel()}
                    {consistency.isViolated ? ', violated' : ''}
                    {consistency.violationEffectLabel !== null &&
                        ` (${consistency.violationEffectLabel})`}
                    .
                </p>
            );
        }
        case ConsistencyStatusKind.NoRule: {
            return (
                <p className="text-sm text-muted-foreground">
                    This stage carries no consistency rule.
                </p>
            );
        }
        case ConsistencyStatusKind.NotEvaluated: {
            return (
                <p className="text-sm text-muted-foreground">
                    not evaluated: no best day is recorded yet against{' '}
                    {consistency.rule.shareLabel()}.
                </p>
            );
        }
    }
}

function PerformanceSummary({
    performance,
}: {
    readonly performance: PerformanceSinceSnapshot;
}) {
    switch (performance.kind) {
        case PerformanceComparabilityKind.Comparable: {
            return (
                <p className="text-sm">
                    {formatCurrency(performance.profitSinceSnapshot)} since the
                    previous snapshot
                    {performance.tradingDaysElapsed !== null &&
                        performance.profitPerTradingDay !== null &&
                        ` (${formatCurrency(performance.profitPerTradingDay)} per trading day over ${formatDays(performance.tradingDaysElapsed)})`}
                    {performance.payoutsPaidGross > 0 &&
                        `, including ${formatCurrency(performance.payoutsPaidGross)} in paid payouts`}
                    .
                </p>
            );
        }
        case PerformanceComparabilityKind.NotComparable: {
            return (
                <p className="text-sm text-muted-foreground">
                    {INCOMPARABILITY_LABEL[performance.reason]}
                </p>
            );
        }
    }
}
