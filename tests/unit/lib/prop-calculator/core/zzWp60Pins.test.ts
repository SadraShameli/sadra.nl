import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    dollars,
    FirmId,
    FtmoFuturesVariant,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

import { exactFundedPolicyValue } from '../fundedStateValueToy';

describe('pins', () => {
    it.each([0, 1])(
        'ftmo baseline multiple %s',
        async (multiple) => {
            await warmFirmsRegistryCache();
            const plan = ALL_FIRMS.find(
                (f) => f.id === FirmId.FtmoFutures,
            )?.findPlan({
                accountSize: 50_000,
                firm: FirmId.FtmoFutures,
                variant: FtmoFuturesVariant.Growth,
            });
            if (!plan) throw new Error('x');
            const cfg = {
                actionStepMultiple: 1,
                convergenceTolerance: 1e-9,
                cushionStepMultiple: 0.5,
                cycleBaselineFineRangeMultiple: multiple,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                maxTailCushionMultiple: 6,
                meanHorizonDays: 20,
                payoutRegimeCap: 2,
                plan: plan.withOverrides({}),
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.5,
            };
            const r = computeFundedStateValue(cfg);
            const ex = [40, 80, 150].map(
                (d) => `${d}:${exactFundedPolicyValue(cfg, r, d).toFixed(3)}`,
            );
            console.log(
                'PINS ftmo multiple',
                multiple,
                'dp',
                r.initialValue,
                'exact',
                ex.join(' '),
            );
            expect(1).toBe(1);
        },
        280_000,
    );
});
