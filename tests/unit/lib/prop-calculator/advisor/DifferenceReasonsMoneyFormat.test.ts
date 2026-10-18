import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    DifferenceReason,
    type DifferenceReasonDetail,
    differenceReasonText,
} from '~/lib/prop-calculator/advisor';

const THOUSANDS = dollars(12_345.5);

const MONEY_REASONS: readonly DifferenceReasonDetail[] = [
    { ceiling: THOUSANDS, kind: DifferenceReason.CeilingCap },
    { kind: DifferenceReason.ConsistencyCap, maxDayProfit: THOUSANDS },
    { cushion: THOUSANDS, kind: DifferenceReason.CushionCap },
    { dailyLossLimit: THOUSANDS, kind: DifferenceReason.DailyLossCap },
    {
        drawdown: THOUSANDS,
        kind: DifferenceReason.DpGridMisaligned,
        step: THOUSANDS,
    },
    {
        kind: DifferenceReason.FirmMinimumAboveRequest,
        minimum: THOUSANDS,
        requested: THOUSANDS,
    },
    {
        documentedFlatRisk: THOUSANDS,
        fromStateOptimum: THOUSANDS,
        gapInCombinedSEs: 3,
        kind: DifferenceReason.FlatRiskIgnoresState,
    },
    {
        affordableRisk: THOUSANDS,
        isPlacedAtEnteredStop: true,
        kind: DifferenceReason.LiveFloorMinimumTrade,
        minimumTradeRisk: THOUSANDS,
    },
    {
        engineRequest: THOUSANDS,
        headlineRequest: THOUSANDS,
        kind: DifferenceReason.PayoutPolicyDiffers,
    },
    { cap: THOUSANDS, kind: DifferenceReason.PersonalCap },
    { kind: DifferenceReason.RemainingTargetCap, remaining: THOUSANDS },
    {
        d4Cushion: THOUSANDS,
        kind: DifferenceReason.RetainedCushionBasis,
        rulebookCushion: THOUSANDS,
    },
    {
        gap: THOUSANDS,
        kind: DifferenceReason.WithinNoise,
        threshold: THOUSANDS,
    },
];

describe('difference reason money amounts', () => {
    it('says the daily loss cap with a thousands separator', () => {
        expect(
            differenceReasonText({
                dailyLossLimit: dollars(1000),
                kind: DifferenceReason.DailyLossCap,
            }),
        ).toBe('Capped by the $1,000.00 daily loss limit.');
    });

    it.each(MONEY_REASONS.map((detail) => [detail.kind, detail] as const))(
        'prints every %s amount with a thousands separator',
        (_kind, detail) => {
            const text = differenceReasonText(detail);
            expect(text).toContain('$12,345.50');
            expect(text).not.toMatch(/\$\d{4}/);
        },
    );
});
