import { describe, expect, it } from 'vitest';

import { dailyLossLimitLabel } from '~/app/(app)/prop-calculator/_components/dailyLossLimitLabel';
import {
    contracts,
    DailyLossLimitKind,
    dollars,
    fraction,
} from '~/lib/prop-calculator';
import { APEX_LIVE_DAILY_LOSS_LIMIT } from '~/lib/prop-calculator/firms/apex/ApexLive';

describe('web daily loss limit badge label', () => {
    it('shows the Apex Live Level 1 no-limit tier next to its $5,000 to $10,000 range (WP22b)', () => {
        expect(dailyLossLimitLabel(APEX_LIVE_DAILY_LOSS_LIMIT)).toBe(
            '$5,000–$10,000 (scales, none on some tiers)',
        );
    });

    it('shows a single limited tier beside an unlimited one', () => {
        expect(
            dailyLossLimitLabel({
                kind: DailyLossLimitKind.Tiered,
                tiers: [
                    {
                        dailyLossLimit: null,
                        maxContracts: contracts(5),
                        minProfit: 0,
                    },
                    {
                        dailyLossLimit: dollars(2000),
                        maxContracts: contracts(10),
                        minProfit: 5000,
                    },
                ],
            }),
        ).toBe('$2,000 (none on some tiers)');
    });

    it('keeps the finite range, fixed, share and none labels', () => {
        expect(
            dailyLossLimitLabel({
                kind: DailyLossLimitKind.Tiered,
                tiers: [
                    {
                        dailyLossLimit: dollars(1000),
                        maxContracts: contracts(5),
                        minProfit: 0,
                    },
                    {
                        dailyLossLimit: dollars(3000),
                        maxContracts: contracts(10),
                        minProfit: 5000,
                    },
                ],
            }),
        ).toBe('$1,000–$3,000 (scales)');
        expect(
            dailyLossLimitLabel({
                amount: dollars(1200),
                kind: DailyLossLimitKind.Flat,
            }),
        ).toBe('$1,200');
        expect(
            dailyLossLimitLabel({
                kind: DailyLossLimitKind.PeakProfitShare,
                share: fraction(0.6),
            }),
        ).toBe('60% of peak');
        expect(dailyLossLimitLabel({ kind: DailyLossLimitKind.None })).toBe(
            null,
        );
    });
});
