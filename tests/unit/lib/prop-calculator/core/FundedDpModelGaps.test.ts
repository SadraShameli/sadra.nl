import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    FtmoFuturesVariant,
    MffuVariant,
    PayoutFloorEffect,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import {
    type FundedDpModelGap,
    FundedDpModelGapKind,
    fundedDpModelGaps,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { FtmoFutures } from '~/lib/prop-calculator/firms/ftmo-futures/FtmoFutures';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

function apexEodPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function apexIntradayPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function findE8SignaturePlan(): Plan {
    const plan = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!plan) throw new Error('E8 Signature 50K plan not found');
    return plan;
}

function mffBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

function mffProPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
}

function topStepNoFeeStandardPlan(): Plan {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    return plan;
}

function tptProPlan(): Plan {
    const plan = new TakeProfitTrader().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tpt,
    });
    if (!plan) throw new Error('TPT PRO 50K plan not found');
    return plan;
}

describe('fundedDpModelGaps', () => {
    it('is empty for Apex EOD 50K: its payoutLadder (6 steps) and maxLifetimePayouts (6) both fit inside the default payout-count regime cap of 6', () => {
        expect(fundedDpModelGaps(apexEodPlan())).toStrictEqual([]);
    });

    it('is empty for Apex Intraday 50K, for the same reason as EOD', () => {
        expect(fundedDpModelGaps(apexIntradayPlan())).toStrictEqual([]);
    });

    it('is empty for E8 Signature 50K: its PayoutCountTieredPayoutCap tiers start at payouts 0, 2 and 4, and its maxLifetimePayouts is 5 -- both comfortably inside the regime cap of 6', () => {
        expect(fundedDpModelGaps(findE8SignaturePlan())).toStrictEqual([]);
    });

    it('is empty for MFF Builder 50K: its payoutLadder (5 steps) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(fundedDpModelGaps(mffBuilderPlan())).toStrictEqual([]);
    });

    it('flags TopStep no-fee-standard 50K with only the ReleaseFloor gap: it has no maxLifetimePayoutDollars, no payoutLadder and no PayoutCountTieredPayoutCap (N-86, WP57)', () => {
        expect(fundedDpModelGaps(topStepNoFeeStandardPlan())).toStrictEqual([
            { kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated },
        ]);
    });

    it('flags MFF Pro 50K for its $100,000 maxLifetimePayoutDollars (the DP never restores FundedCycleTracker.cumulativePayout from any state, so it always ignores this cap) and for its payout-triggered lock, whose unbounded pre-lock trailing saturates the DP offset grid', () => {
        expect(fundedDpModelGaps(mffProPlan())).toStrictEqual([
            {
                kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
                maxLifetimePayoutDollars: dollars(100_000),
            },
            {
                kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
            },
        ]);
    });

    it('flags the payout-triggered lock gap only on plans whose funded lock has no profit trigger', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const hasGap = fundedDpModelGaps(plan).some(
                    (gap) =>
                        gap.kind ===
                        FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
                );
                expect(hasGap, plan.label).toBe(
                    plan.fundedDrawdown.lock?.atProfit === null,
                );
            }
        }
        const flagged = ALL_FIRMS.flatMap((firm) => firm.plans).filter(
            (plan) => plan.fundedDrawdown.lock?.atProfit === null,
        );
        expect(flagged.map((plan) => plan.label)).toStrictEqual([
            mffProPlan().label,
        ]);
    });

    it('flags a PayoutCountTieredPayoutCap tier whose fromPayoutIndex sits beyond the regime cap, and does not flag a tier at or under the cap', () => {
        const plan = topStepNoFeeStandardPlan().withOverrides({
            payoutBalanceShareCap: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1000),
                    },
                },
                {
                    fromPayoutIndex: 6,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(2500),
                    },
                },
                {
                    fromPayoutIndex: 9,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(3000),
                    },
                },
            ]),
            payoutRequestCap: undefined,
        });

        expect(
            fundedDpModelGaps(plan).filter(
                (gap) =>
                    gap.kind ===
                    FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
            ),
        ).toStrictEqual([
            {
                fromPayoutIndex: 9,
                kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
                payoutRegimeCap: 6,
            },
        ]);
    });

    it('does not flag a PayoutCountTieredPayoutCap when every tier fromPayoutIndex is within a wider regime cap raised by maxLifetimePayouts', () => {
        const plan = topStepNoFeeStandardPlan().withOverrides({
            maxLifetimePayouts: 10,
            payoutBalanceShareCap: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1000),
                    },
                },
                {
                    fromPayoutIndex: 9,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(2000),
                    },
                },
            ]),
            payoutRequestCap: undefined,
        });

        expect(
            fundedDpModelGaps(plan).filter(
                (gap) =>
                    gap.kind ===
                    FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
            ),
        ).toStrictEqual([]);
    });

    it("does not repeat TPT PRO's own plan label inside the calendar-week gap message, since fundedDpModelGapWarning already prefixes every joined gap message with the label once (N-87 leftover, WP55)", () => {
        const plan = tptProPlan();
        const calendarWeekGap = fundedDpModelGaps(plan).find(
            (
                gap,
            ): gap is Extract<
                FundedDpModelGap,
                { kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored }
            > => gap.kind === FundedDpModelGapKind.CalendarWeekInactivityIgnored,
        );
        if (calendarWeekGap === undefined) {
            throw new Error('expected a calendar-week gap for TPT PRO');
        }
        expect(calendarWeekGap.message.startsWith(plan.label)).toBe(false);
        expect(calendarWeekGap.message).toContain(
            'closes its funded phase for an empty',
        );
    });
});

describe('fundedDpModelGaps flags PayoutFloorEffect.ReleaseFloor plans as unvalidated (N-86, WP57)', () => {
    it('flags exactly the plans whose funded payout floor effect is ReleaseFloor, across every firm', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const hasGap = fundedDpModelGaps(plan).some(
                    (gap) =>
                        gap.kind ===
                        FundedDpModelGapKind.PayoutFloorReleaseUnvalidated,
                );
                expect(hasGap, plan.label).toBe(
                    plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor,
                );
            }
        }
    });

    it('flags every TopStep plan built off the XFA payout floor, today the only ReleaseFloor plans in the registry', () => {
        const flagged = ALL_FIRMS.flatMap((firm) => firm.plans).filter(
            (plan) =>
                plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor,
        );
        expect(flagged.length).toBeGreaterThan(0);
        for (const plan of flagged) {
            expect(plan.id.firm).toBe(FirmId.TopStep);
        }
    });

    it('does not flag FTMO Growth, which is unaffected by the D11-r3 gap that stayed open on TopStep after three prior fixes (WP45, WP54, WP56)', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (!plan) throw new Error('FTMO Growth 50K plan not found');
        expect(
            fundedDpModelGaps(plan).some(
                (gap) =>
                    gap.kind ===
                    FundedDpModelGapKind.PayoutFloorReleaseUnvalidated,
            ),
        ).toBe(false);
    });
});
