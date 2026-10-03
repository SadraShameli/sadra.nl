import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    copyGroupSizing,
    type CopyGroupSizingMember,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

import { fundedReconstructed } from '../../prop-accounts/reconstructionFixtures';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

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

interface MemberOptions {
    readonly cap?: number;
    readonly counts?: PendingCounts;
    readonly isEval?: boolean;
    readonly isReadyToRequest?: boolean;
    readonly paid: null | number;
}

interface PendingCounts {
    readonly otherAccountsPendingPayoutCount: number;
    readonly pendingPayoutCount: number;
}

function blocksOf(members: readonly CopyGroupSizingMember[]) {
    const result = copyGroupSizing({ members, rulebook: DEFAULT_RULEBOOK });
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('the group was rejected');
    }
    return result.payoutCountBlocks;
}

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const evalState: AccountState = {
        ...state,
        balance: 50_600,
        qualifyingDays: 0,
        threshold: 48_500,
        thresholdLocked: false,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion: evalState.balance - evalState.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(APEX_EOD_ID),
        resolvedDailyLossLimit: null,
        state: evalState,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAccount(
    counts: PendingCounts | undefined,
    isReadyToRequest: boolean,
): ReconstructedFundedOrEvalAccount {
    const plan = registryPlan(MFF_PRO_ID);
    const balance = plan.accountSize + (isReadyToRequest ? 20_000 : 0);
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return { ...funded, ...counts };
}

function memberOf(id: string, options: MemberOptions): CopyGroupSizingMember {
    const policy =
        options.cap === undefined
            ? null
            : new StubTriggerPolicy([
                  new PayoutCountTotalTrigger(options.cap, CONFIRMED_SOURCE),
              ]);
    return {
        account:
            options.isEval === true
                ? evalAccount()
                : fundedAccount(
                      options.counts,
                      options.isReadyToRequest ?? true,
                  ),
        accountPolicy: policy,
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: options.paid,
        personalRequestOverride: null,
        personalRetainedCushion: null,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const OWN_REQUEST: PendingCounts = {
    otherAccountsPendingPayoutCount: 0,
    pendingPayoutCount: 1,
};

const SIBLING_REQUEST: PendingCounts = {
    otherAccountsPendingPayoutCount: 1,
    pendingPayoutCount: 0,
};

const TWO_OUTSIDE_REQUESTS: PendingCounts = {
    otherAccountsPendingPayoutCount: 2,
    pendingPayoutCount: 0,
};

describe('copy-group sizing checks the firm payout count against the group concurrent requests (PT-36l, F-145)', () => {
    it('blocks when two members request together and the second request is the one reaching the verified firm cap', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', { cap: 4, paid: 2 }),
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.memberIds).toEqual(['a', 'b']);
        expect(blocks[0]?.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 3,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 4,
            },
        });
    });

    it('stays clear while the concurrent requests leave the last one under the cap', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 5, paid: 2 }),
            memberOf('b', { cap: 5, paid: 2 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('counts a member that already has a request as pending, not as a new concurrent request', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 4, counts: OWN_REQUEST, paid: 2 }),
            memberOf('b', { cap: 4, counts: SIBLING_REQUEST, paid: 2 }),
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.reason).toMatchObject({
            trigger: { payoutsTaken: 3, scope: LiveTriggerScope.Firm },
        });
    });

    it('stays clear when the one member request already pending leaves the last request under the cap', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 5, counts: OWN_REQUEST, paid: 2 }),
            memberOf('b', { cap: 5, counts: SIBLING_REQUEST, paid: 2 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('counts the requests of accounts outside the group through each member other-accounts count', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 5, counts: TWO_OUTSIDE_REQUESTS, paid: 2 }),
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.reason).toMatchObject({
            trigger: { payoutsTaken: 4, scope: LiveTriggerScope.Firm },
        });
    });

    it('says nothing when the firm payout count is unknown, as the coverage already says not checked', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 2, paid: null }),
            memberOf('b', { cap: 2, paid: null }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('says nothing without a verified firm-total trigger', () => {
        const blocks = blocksOf([
            memberOf('a', { paid: 9 }),
            memberOf('b', { paid: 9 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('has no payout to check for an evaluation group', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 1, isEval: true, paid: 9 }),
            memberOf('b', { cap: 1, isEval: true, paid: 9 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('counts only the members that are ready to request as concurrent requests', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', { cap: 4, isReadyToRequest: false, paid: 2 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('blocks again once the second member is ready to request', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', { cap: 4, isReadyToRequest: true, paid: 2 }),
        ]);
        expect(blocks).toHaveLength(1);
    });

    it('says nothing when no member is ready to request', () => {
        const blocks = blocksOf([
            memberOf('a', { cap: 3, isReadyToRequest: false, paid: 2 }),
            memberOf('b', { cap: 3, isReadyToRequest: false, paid: 2 }),
        ]);
        expect(blocks).toEqual([]);
    });

    it('resolves the verified cap from every member policy, not only the first member', () => {
        const blocks = blocksOf([
            memberOf('a', { paid: 2 }),
            memberOf('b', { cap: 4, paid: 2 }),
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.reason).toMatchObject({
            trigger: { scope: LiveTriggerScope.Firm, triggerAtPayoutCount: 4 },
        });
    });
});
