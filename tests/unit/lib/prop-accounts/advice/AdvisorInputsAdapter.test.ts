import { describe, expect, it } from 'vitest';

import {
    advisorInputsFrom,
    type AdvisorPersonalInputs,
} from '~/lib/prop-accounts/advice/AdvisorInputsAdapter';
import {
    AccountEventKind,
    AccountStatus,
    type PersonalRules,
    usdCents,
} from '~/lib/prop-accounts/core';
import { RebuyLagBasis, replacementStats } from '~/lib/prop-accounts/metrics';
import { dollars } from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    purchased,
} from '../metrics/ledgerFixtures';

function statsWithMeasuredLag() {
    const bustedMonday = account(EVAL_PLAN, { status: AccountStatus.Busted });
    const afterMonday = account(EVAL_PLAN, {
        purchasedOn: '2026-09-10',
        replacesAccountId: bustedMonday.id,
    });
    return replacementStats(
        ledger({
            accounts: [bustedMonday, afterMonday],
            events: [
                purchased(bustedMonday),
                event(bustedMonday, AccountEventKind.Busted, '2026-09-07'),
                purchased(afterMonday),
            ],
        }),
    );
}

describe('advisorInputsFrom', () => {
    it('maps every PersonalRules cents field to its Dollars counterpart', () => {
        const personalRules: PersonalRules = {
            dailyLossLimitCents: usdCents(30_000),
            dailyProfitCapCents: usdCents(50_000),
            maxRiskPerTradeCents: usdCents(10_000),
            maxTradesPerDay: 5,
            payoutRequestOverrideCents: usdCents(75_000),
            retainedCushionCents: usdCents(250_000),
        };
        const result = advisorInputsFrom(
            personalRules,
            statsWithMeasuredLag(),
            EVAL_PLAN.serial,
        );
        expect(result).toEqual<AdvisorPersonalInputs>({
            payoutRequestOverride: dollars(750),
            personalCaps: {
                dailyProfitCap: dollars(500),
                maxRiskPerTrade: dollars(100),
                maxTradesPerDay: 5,
            },
            personalDll: dollars(300),
            rebuyLagBasis: RebuyLagBasis.Measured,
            rebuyLagDays: 2,
            retainedCushionRequest: dollars(2500),
        });
    });

    it('maps every absent field to null, with no measured lag falling back to assumed zero', () => {
        const result = advisorInputsFrom(
            {},
            statsWithMeasuredLag(),
            INSTANT_PLAN.serial,
        );
        expect(result).toEqual<AdvisorPersonalInputs>({
            payoutRequestOverride: null,
            personalCaps: {
                dailyProfitCap: null,
                maxRiskPerTrade: null,
                maxTradesPerDay: null,
            },
            personalDll: null,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: null,
        });
    });
});
