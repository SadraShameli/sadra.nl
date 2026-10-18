import {
    type DailyLossLimitConfig,
    DailyLossLimitShape,
    describeDailyLossLimit,
} from '~/lib/prop-calculator';
import { dailyLossLimitText } from '~/lib/prop-calculator/describe';

export function dailyLossLimitLabel(
    config: DailyLossLimitConfig,
): null | string {
    return describeDailyLossLimit(config).kind === DailyLossLimitShape.None
        ? null
        : dailyLossLimitText(config);
}
