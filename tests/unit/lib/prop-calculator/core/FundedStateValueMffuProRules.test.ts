import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function calendarGatedToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        minDaysAfterPassForPayout: 7,
        payoutDayGateBasis:
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
    });
}

function inBufferToyPlan(isTaken: boolean): Plan {
    return onePayoutToyPlan().withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: null, lockedThreshold: () => 1010 },
        }),
        minPayoutProfit: dollars(300),
        oneTimeEarlyWithdrawal: {
            maxProfitShare: fraction(0.6),
            minRequest: dollars(100),
        },
        payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
        takesOneTimeEarlyWithdrawal: isTaken,
    });
}

function onePayoutToyPlan(): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const TOY_SOLVE = {
    actionStepMultiple: 1,
    cushionStepMultiple: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    rrRatio: 2,
    tradesPerDay: 1,
} as const;

describe('computeFundedStateValue on the MFF Pro payout rules (N-7, N-64)', () => {
    it(
        'counts idle sessions toward a calendar-day gate: a 7-calendar-day gate is 5 sessions after the first trade, so at a 20% win rate the DP locks on one win and then sits idle 5 sessions to cash out $100 ' +
            '(V = 0.2 x 100 = 20), where a qualifying-day gate would force 6 more losing-edge trades',
        () => {
            const plan = calendarGatedToyPlan();
            expect(isFundedDpEligible(plan)).toBe(true);

            const result = computeFundedStateValue({
                ...TOY_SOLVE,
                plan,
                winrate: 0.2,
            });

            expect(result.initialValue).toBeCloseTo(20, 10);
        },
    );

    it(
        'takes the opted-in one-time early withdrawal inside the buffer: one win leaves $200 profit under the $300 buffer, 60% of it ($120) is paid and the account concludes ' +
            '(V = 0.5 x 120 = 60), where the default rule waits for a second win and a $290 payout (V = 0.25 x 290 = 72.5)',
        () => {
            const optedIn = computeFundedStateValue({
                ...TOY_SOLVE,
                plan: inBufferToyPlan(true),
                winrate: 0.5,
            });
            const optedOut = computeFundedStateValue({
                ...TOY_SOLVE,
                plan: inBufferToyPlan(false),
                winrate: 0.5,
            });

            expect(optedIn.initialValue).toBeCloseTo(60, 10);
            expect(optedOut.initialValue).toBeCloseTo(72.5, 10);
        },
    );
});
