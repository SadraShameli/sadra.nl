import {
    type DailyLossLimitConfig,
    type DailyLossLimitDescriptor,
    DailyLossLimitShape,
    describeDailyLossLimit,
} from '~/lib/prop-calculator';

const NO_LIMIT_TIER_NOTE = 'none on some tiers';

export function dailyLossLimitLabel(
    config: DailyLossLimitConfig,
): null | string {
    return describeLabel(describeDailyLossLimit(config));
}

function describeLabel(descriptor: DailyLossLimitDescriptor): null | string {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed: {
            return `$${descriptor.amount.toLocaleString()}`;
        }
        case DailyLossLimitShape.None: {
            return null;
        }
        case DailyLossLimitShape.Range: {
            return descriptor.max <= descriptor.min
                ? `$${descriptor.min.toLocaleString()}`
                : `$${descriptor.min.toLocaleString()}–$${descriptor.max.toLocaleString()} (scales)`;
        }
        case DailyLossLimitShape.RangeWithUnlimitedTier: {
            return descriptor.max <= descriptor.min
                ? `$${descriptor.min.toLocaleString()} (${NO_LIMIT_TIER_NOTE})`
                : `$${descriptor.min.toLocaleString()}–$${descriptor.max.toLocaleString()} (scales, ${NO_LIMIT_TIER_NOTE})`;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return `${(descriptor.share * 100).toFixed(0)}% of peak`;
        }
        case DailyLossLimitShape.Staged: {
            const before = describeLabel(descriptor.before);
            const after = describeLabel(descriptor.after);
            if (before === null) return after;
            return after === null ? before : `${before} → ${after}`;
        }
    }
}
