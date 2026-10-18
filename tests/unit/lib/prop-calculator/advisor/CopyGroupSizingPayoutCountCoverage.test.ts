import { describe, expect, it } from 'vitest';

import {
    dollars,
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
} from '~/lib/prop-calculator';
import {
    copyGroupSizing,
    type CopyGroupSizingMember,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

import { fundedReconstructed } from '../../prop-accounts/reconstructionFixtures';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
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

function memberOf(
    id: string,
    options: {
        readonly cap?: number;
        readonly paid: null | number;
        readonly personalRequestOverride?: null | number;
        readonly personalRetainedCushion?: null | number;
    },
): CopyGroupSizingMember {
    return {
        account: readyFundedAccount(),
        accountPolicy:
            options.cap === undefined
                ? null
                : new StubTriggerPolicy([
                      new PayoutCountTotalTrigger(
                          options.cap,
                          CONFIRMED_SOURCE,
                      ),
                  ]),
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: options.paid,
        personalRequestOverride:
            options.personalRequestOverride === undefined ||
            options.personalRequestOverride === null
                ? null
                : dollars(options.personalRequestOverride),
        personalRetainedCushion:
            options.personalRetainedCushion === undefined ||
            options.personalRetainedCushion === null
                ? null
                : dollars(options.personalRetainedCushion),
    };
}

function readyFundedAccount(): ReconstructedFundedOrEvalAccount {
    const plan = registryPlan(MFF_PRO_ID);
    const balance = plan.accountSize + 20_000;
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
    return funded;
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function sizedOf(members: readonly CopyGroupSizingMember[]) {
    const result = copyGroupSizing({ members, rulebook: DEFAULT_RULEBOOK });
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('the group was rejected');
    }
    return result;
}

describe('the copy-group result says when the firm payout limit was not checked (PT-36n, F-145)', () => {
    it('lists the firm, with its members, when a member paid count is unknown and a verified firm cap exists', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: null }),
            memberOf('b', { cap: 4, paid: null }),
        ]);
        expect(result.payoutCountNotChecked).toEqual([
            { firm: FirmId.Mffu, memberIds: ['a', 'b'] },
        ]);
        expect(result.payoutCountBlocks).toEqual([]);
    });

    it('lists the firm when only one member paid count is unknown', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', { cap: 4, paid: null }),
        ]);
        expect(result.payoutCountNotChecked).toEqual([
            { firm: FirmId.Mffu, memberIds: ['a', 'b'] },
        ]);
    });

    it('says nothing when the paid count is unknown but no verified firm cap exists to check', () => {
        const result = sizedOf([
            memberOf('a', { paid: null }),
            memberOf('b', { paid: null }),
        ]);
        expect(result.payoutCountNotChecked).toEqual([]);
    });

    it('says nothing when every paid count is known', () => {
        const result = sizedOf([
            memberOf('a', { cap: 5, paid: 2 }),
            memberOf('b', { cap: 5, paid: 2 }),
        ]);
        expect(result.payoutCountNotChecked).toEqual([]);
        expect(result.payoutCountBlocks).toEqual([]);
    });
});

describe('a copy-group member carries its personal request and retained-cushion overrides so its readiness matches the board (PT-36n, F-145)', () => {
    it('blocks when both members are ready under the default request and cushion', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', { cap: 4, paid: 2 }),
        ]);
        expect(result.payoutCountBlocks).toHaveLength(1);
    });

    it('does not count a member as filing together while its personal retained cushion keeps it from requesting', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', {
                cap: 4,
                paid: 2,
                personalRetainedCushion: 1_000_000,
            }),
        ]);
        expect(result.payoutCountBlocks).toEqual([]);
    });

    it('does not count a member as filing together while its personal request is more than it can withdraw', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', {
                cap: 4,
                paid: 2,
                personalRequestOverride: 1_000_000,
            }),
        ]);
        expect(result.payoutCountBlocks).toEqual([]);
    });

    it('treats an explicit null override as no override', () => {
        const result = sizedOf([
            memberOf('a', { cap: 4, paid: 2 }),
            memberOf('b', {
                cap: 4,
                paid: 2,
                personalRequestOverride: null,
                personalRetainedCushion: null,
            }),
        ]);
        expect(result.payoutCountBlocks).toHaveLength(1);
    });
});
