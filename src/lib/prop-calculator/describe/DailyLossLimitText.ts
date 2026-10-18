import { formatWholeOrCentsCurrency } from '~/lib/format';
import {
    type DailyLossLimitConfig,
    type DailyLossLimitDescriptor,
    DailyLossLimitShape,
    describeDailyLossLimit,
} from '~/lib/prop-calculator/core';

export function dailyLossLimitText(config: DailyLossLimitConfig): string {
    return descriptorText(describeDailyLossLimit(config));
}

function currencyRangeText(min: number, max: number): string {
    return `${formatWholeOrCentsCurrency(min)} to ${formatWholeOrCentsCurrency(max)}`;
}

function descriptorText(descriptor: DailyLossLimitDescriptor): string {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed: {
            return formatWholeOrCentsCurrency(descriptor.amount);
        }
        case DailyLossLimitShape.None: {
            return 'none';
        }
        case DailyLossLimitShape.Range: {
            return currencyRangeText(descriptor.min, descriptor.max);
        }
        case DailyLossLimitShape.RangeWithUnlimitedTier: {
            const limited =
                descriptor.max <= descriptor.min
                    ? formatWholeOrCentsCurrency(descriptor.min)
                    : currencyRangeText(descriptor.min, descriptor.max);
            return `${limited}, none on some tiers`;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return `${String(descriptor.share * 100)}% of the peak day-close profit`;
        }
        case DailyLossLimitShape.Staged: {
            return `${descriptorText(descriptor.before)} until the drawdown locks, then ${descriptorText(descriptor.after)}`;
        }
    }
}
