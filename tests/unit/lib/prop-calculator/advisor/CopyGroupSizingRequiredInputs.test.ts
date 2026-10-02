import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    findFirm,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type CopyGroupSizingMember,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const state: AccountState = {
    balance: 55_000,
    bestDayProfit: 0,
    consecutiveIdleDays: 0,
    intradayHighProfit: 0,
    peakDayCloseProfit: 0,
    peakIntradayProfit: 0,
    qualifyingDays: 20,
    startingBalance: 50_000,
    threshold: 50_100,
    thresholdLocked: true,
    todayPnL: 0,
    tradingDays: 20,
};

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

describe('a copy-group member must say its firm policy and firm payout count (PT-36h, F-145)', () => {
    it('fails to compile for a member that omits the account policy or the firm payout count', () => {
        const account = fundedAccount();
        // @ts-expect-error accountPolicy and paidPayoutsSinceLastLiveAccount are required
        const omitted: CopyGroupSizingMember = { account, id: 'a', label: 'a' };
        const explicit: CopyGroupSizingMember = {
            account,
            accountPolicy: null,
            id: 'a',
            label: 'a',
            paidPayoutsSinceLastLiveAccount: null,
        };

        expect(omitted.id).toBe(explicit.id);
    });
});
