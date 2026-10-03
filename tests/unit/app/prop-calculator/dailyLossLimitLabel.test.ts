import { describe, expect, it } from 'vitest';

import { dailyLossLimitLabel } from '~/app/(app)/prop-calculator/_components/dailyLossLimitLabel';
import {
    ALL_FIRMS,
    APEX_LIVE_DAILY_LOSS_LIMIT,
    contracts,
    DailyLossLimitKind,
    dollars,
    fraction,
} from '~/lib/prop-calculator';

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

describe('web daily loss limit badge label for every registry plan (PT-31a pin)', () => {
    it('keeps the eval and funded labels of every plan', () => {
        const labels = Object.fromEntries(
            ALL_FIRMS.flatMap((firm) => firm.plans).map((plan) => [
                `${plan.id.firm} ${plan.label}`,
                [
                    dailyLossLimitLabel(plan.evalDailyLossLimit),
                    dailyLossLimitLabel(plan.fundedDailyLossLimit),
                ],
            ]),
        );
        expect(labels).toMatchInlineSnapshot(`
          {
            "alphafutures $50K · Advanced": [
              null,
              null,
            ],
            "alphafutures $50K · Standard": [
              null,
              "$1,000",
            ],
            "alphafutures $50K · Zero": [
              "$1,000",
              "$1,000",
            ],
            "apex $50K · EOD trailing": [
              "$1,000",
              "$1,000–$3,000 (scales)",
            ],
            "apex $50K · Intraday trailing": [
              null,
              "$1,000–$3,000 (scales)",
            ],
            "e8futures $50K · Signature": [
              null,
              "$1,000",
            ],
            "e8futures $50K · Zero MAX (100% payout)": [
              null,
              null,
            ],
            "e8futures $50K · Zero MAX (80% payout)": [
              null,
              null,
            ],
            "e8futures $50K · Zero Starter (100% payout)": [
              null,
              null,
            ],
            "e8futures $50K · Zero Starter (80% payout)": [
              null,
              null,
            ],
            "ftmo-futures $50K · Growth": [
              null,
              "$1,000",
            ],
            "ftmo-futures $50K · Pro": [
              "$1,000",
              "$1,000",
            ],
            "fundednext $50K · FNL:003 Instant": [
              null,
              "$1,000",
            ],
            "fundednext $50K · Flex": [
              null,
              null,
            ],
            "fundednext $50K · Legacy": [
              null,
              null,
            ],
            "fundednext $50K · Rapid Daily": [
              "$1,000",
              "$1,000",
            ],
            "fundednext $50K · Rapid Pro": [
              null,
              null,
            ],
            "fundednext $50K · Rapid Pro (DLL Add-On)": [
              "$1,000",
              "$1,000",
            ],
            "lucid $50K · LucidDaily (EOD)": [
              null,
              null,
            ],
            "lucid $50K · LucidDaily (EOD, DLL)": [
              "$1,200",
              "$1,200",
            ],
            "lucid $50K · LucidDaily (Intraday)": [
              null,
              null,
            ],
            "lucid $50K · LucidDaily (Intraday, DLL)": [
              "$1,200",
              "$1,200",
            ],
            "lucid $50K · LucidDirect": [
              "$1,200",
              "$1,200 → 60% of peak",
            ],
            "lucid $50K · LucidFlex": [
              null,
              null,
            ],
            "lucid $50K · LucidFlex (DLL)": [
              "$1,200",
              "$1,200",
            ],
            "lucid $50K · LucidMaxx": [
              null,
              null,
            ],
            "lucid $50K · LucidPro": [
              "$1,200",
              "$1,200 → 60% of peak",
            ],
            "lucid $50K · LucidPro (no DLL)": [
              null,
              null,
            ],
            "mffu $50K · Builder": [
              "$1,000",
              "$1,000",
            ],
            "mffu $50K · Pro": [
              null,
              null,
            ],
            "mffu $50K · Rapid": [
              null,
              null,
            ],
            "mffu $50K · Rapid EOD": [
              null,
              null,
            ],
            "topstep $50K · No-fee path · Consistency XFA": [
              null,
              null,
            ],
            "topstep $50K · No-fee path · Consistency XFA · DLL": [
              "$1,000",
              "$1,000",
            ],
            "topstep $50K · No-fee path · Standard XFA": [
              null,
              null,
            ],
            "topstep $50K · No-fee path · Standard XFA · DLL": [
              "$1,000",
              "$1,000",
            ],
            "topstep $50K · Pro Account": [
              "$1,000",
              "$1,000",
            ],
            "topstep $50K · Standard path · Consistency XFA": [
              null,
              null,
            ],
            "topstep $50K · Standard path · Consistency XFA · DLL": [
              "$1,000",
              "$1,000",
            ],
            "topstep $50K · Standard path · Standard XFA": [
              null,
              null,
            ],
            "topstep $50K · Standard path · Standard XFA · DLL": [
              "$1,000",
              "$1,000",
            ],
            "tpt $50K · Test → PRO": [
              null,
              null,
            ],
            "tradeify $50K · Growth": [
              "$1,250",
              "$1,250–$2,000 (scales)",
            ],
            "tradeify $50K · Lightning Funded": [
              "$1,250–$2,000 (scales)",
              "$1,250–$2,000 (scales)",
            ],
            "tradeify $50K · Select Daily": [
              null,
              "$1,000",
            ],
            "tradeify $50K · Select Flex": [
              null,
              null,
            ],
          }
        `);
    });
});
