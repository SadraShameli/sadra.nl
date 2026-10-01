import { appendFileSync } from 'node:fs';

import { describe, it } from 'vitest';

import {
    AlphaFuturesVariant,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type Plan,
} from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';

const firm = new AlphaFutures();

function toy(exempt: boolean): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    })!;
    const base = plan.fundedConsistencyRule(1)!;
    const rule = exempt
        ? new ConsistencyRule(ConsistencyScope.Funded, base.maxBestDayShare, base.basis, base.violationEffect, base.boundary, ConsistencyNonPositiveProfit.Passes)
        : base;
    return plan.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 3,
        minDaysAfterPassForPayout: 0,
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutRequestCap: undefined,
        payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(1) }],
        payoutTiersFromPayout: undefined,
    });
}

const variants: Record<string, [boolean, object]> = {
    exempt_tail30: [true, {}],
    exempt_tail6: [true, { maxTailCushionMultiple: 6 }],
    exempt_tail12: [true, { maxTailCushionMultiple: 12 }],
    exempt_tail30_iter1000: [true, { maxIterationsPerLevel: 1000 }],
    exempt_tail30_bdauto: [true, { cycleBestDayBucketCount: undefined }],
};

describe('diag', () => {
    for (const [name, [exempt, extra]] of Object.entries(variants)) {
        it(name, () => {
            const t0 = Date.now();
            const r = computeFundedStateValue({
                actionStepMultiple: 0.5,
                cushionStepMultiple: 0.25,
                cycleBestDayBucketCount: 25,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                plan: toy(exempt),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
                ...extra,
            });
            appendFileSync('/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/diag2.txt', name + ' ' + JSON.stringify({
                states: r.reachedStateCount,
                sweeps: r.sweepCount,
                unconv: r.unconvergedLevelCount,
                err: r.valueErrorBound,
                init: r.initialValue,
                ms: Date.now() - t0,
            }) + '\n');
        }, 300_000);
    }
});
