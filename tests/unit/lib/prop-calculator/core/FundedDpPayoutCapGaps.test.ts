import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    MffuVariant,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import {
    FundedDpPayoutCapGapKind,
    fundedDpPayoutCapGaps,
} from '~/lib/prop-calculator/core/FundedDpPayoutCapGaps';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

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

describe('fundedDpPayoutCapGaps', () => {
    it('is empty for Apex EOD 50K: its payoutLadder (6 steps) and maxLifetimePayouts (6) both fit inside the default payout-count regime cap of 6', () => {
        expect(fundedDpPayoutCapGaps(apexEodPlan())).toStrictEqual([]);
    });

    it('is empty for Apex Intraday 50K, for the same reason as EOD', () => {
        expect(fundedDpPayoutCapGaps(apexIntradayPlan())).toStrictEqual([]);
    });

    it('is empty for E8 Signature 50K: its PayoutCountTieredPayoutCap tiers start at payouts 0, 2 and 4, and its maxLifetimePayouts is 5 -- both comfortably inside the regime cap of 6', () => {
        expect(fundedDpPayoutCapGaps(findE8SignaturePlan())).toStrictEqual([]);
    });

    it('is empty for MFF Builder 50K: its payoutLadder (5 steps) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(fundedDpPayoutCapGaps(mffBuilderPlan())).toStrictEqual([]);
    });

    it('is empty for TopStep no-fee-standard 50K: it has no maxLifetimePayoutDollars, no payoutLadder and no PayoutCountTieredPayoutCap', () => {
        expect(fundedDpPayoutCapGaps(topStepNoFeeStandardPlan())).toStrictEqual(
            [],
        );
    });

    it('flags MFF Pro 50K for its $100,000 maxLifetimePayoutDollars -- the DP never restores FundedCycleTracker.cumulativePayout from any state, so it always ignores this cap', () => {
        expect(fundedDpPayoutCapGaps(mffProPlan())).toStrictEqual([
            {
                kind: FundedDpPayoutCapGapKind.LifetimeDollarCapIgnored,
                maxLifetimePayoutDollars: dollars(100_000),
            },
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

        expect(fundedDpPayoutCapGaps(plan)).toStrictEqual([
            {
                fromPayoutIndex: 9,
                kind: FundedDpPayoutCapGapKind.PayoutCountTierBeyondRegimeCap,
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

        expect(fundedDpPayoutCapGaps(plan)).toStrictEqual([]);
    });
});
