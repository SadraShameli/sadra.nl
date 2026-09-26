import { appendFileSync } from 'node:fs';
import { it } from 'vitest';

import { DailyLossLimitKind, dollars, EodTrailingDrawdown, FirmId, fraction, MffuVariant, type Plan } from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';
function toy(): Plan {
    const r = new MyFundedFutures().findPlan({ accountSize: 50_000, firm: FirmId.Mffu, variant: MffuVariant.RapidEod })!;
    return r.withOverrides({ accountSize: dollars(1000), consistency: null, contractLimits: undefined, drawdown: new EodTrailingDrawdown({ amount: dollars(100) }), evalDailyLossLimit: { kind: DailyLossLimitKind.None }, fundedConsistency: { kind: 'set', rule: null }, fundedDailyLossLimit: { kind: DailyLossLimitKind.None }, fundedDrawdown: new EodTrailingDrawdown({ amount: dollars(100), lock: { atProfit: dollars(150), lockedThreshold: () => 1000 } }), isInstantFunded: true, maxLifetimePayouts: 1, minDaysAfterPassForPayout: 0, minPayoutProfit: dollars(0), minPayoutProfitPerCycle: dollars(0), minPayoutRequest: dollars(0), minQualifyingDayProfit: null, minTradingDays: 0, payoutBalanceShareCap: undefined, payoutRequestCap: undefined, payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(1) }] });
}
for (const c of [{ a: 0.25, m: 20, rr: 2, s: 0.2 }, { a: 0.25, m: 6, rr: 2, s: 0.2 }, { a: 0.4, m: 20, rr: 1.25, s: 0.2 }, { a: 0.05, m: 20, rr: 2, s: 0.1 }]) {
    it('probe ' + JSON.stringify(c), () => {
        const plan = toy();
        const r = computeFundedStateValue({ actionStepMultiple: c.a, cushionStepMultiple: c.s, cycleBestDayBucketCount: 1, evalInitialValue: 0, feePerAttempt: dollars(0), maxActionMultiple: 1, maxCushionMultiple: c.m, plan, rrRatio: c.rr, tradesPerDay: 2, winrate: 0.5 });
        const out = simulate({ fundedDayPolicy: r.dayPolicy, fundedHorizonDays: 2000, maxEvalDays: 1, plan, riskPerTrade: 100, rrRatio: c.rr, seed: 7, tradesPerDay: 2, trials: 100_000, winrate: 0.5 });
        appendFileSync('/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/pf.txt', [process.env.TAG, JSON.stringify(c), 'dp', r.initialValue, 'replay', out.expectedGrossPayout].join(' ') + '\n');
    }, 900_000);
}
