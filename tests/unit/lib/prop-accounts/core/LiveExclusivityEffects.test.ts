import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    type ExclusivityAccount,
    LiveExclusivityAction,
    liveExclusivityEffectsOf,
    type PurchaseBlockedFirm,
    purchaseBlockedFirms,
    PurchaseBlockReason,
} from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    FixedCooldown,
    type LiveExclusivityPolicy,
    PolicySourceKind,
    PolicyVerification,
    SimAccountEffect,
    UnknownCooldown,
} from '~/lib/prop-calculator';

function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) throw new Error(`expected ${label}`);
    return value;
}

const FIRM_A = required(ALL_FIRMS[0], 'at least one registered firm');
const FIRM_B = required(ALL_FIRMS[1], 'at least two registered firms');
const PLAN_A = required(FIRM_A.plans[0], 'the first firm to have a plan');

const CONFIRMED_QUOTE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
};

const CONFLICTED_QUOTE = {
    conflicting: {
        ...CONFIRMED_QUOTE,
        verification: PolicyVerification.Confirmed,
    },
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Conflict,
} as const;

function accountRow(
    overrides: Partial<ExclusivityAccount> & { readonly id: string },
): ExclusivityAccount {
    return {
        accountPolicy: policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Unknown,
        }),
        events: [],
        firmId: FIRM_A.id,
        plan: PLAN_A,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        ...overrides,
    };
}

function policyWith(
    policy: Omit<LiveExclusivityPolicy, 'source'> & {
        readonly source?: LiveExclusivityPolicy['source'];
    },
): FirmAccountPolicy {
    class StubPolicy extends FirmAccountPolicy {
        override liveExclusivityFor(): LiveExclusivityPolicy {
            return { source: undefined, ...policy };
        }
    }
    return new StubPolicy();
}

describe('liveExclusivityEffectsOf', () => {
    it('suspends same-firm active sim and eval accounts when the verified policy makes them dormant while live', () => {
        const dormantPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Dormant,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const live = accountRow({
            accountPolicy: dormantPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        const sibling = accountRow({
            accountPolicy: dormantPolicy,
            id: 'sibling',
        });
        const outcome = liveExclusivityEffectsOf([live, sibling], 'live');
        expect(outcome.effects).toEqual([
            { accountId: 'sibling', action: LiveExclusivityAction.Suspend },
        ]);
        expect(outcome.householdDisclosed).toBe(false);
    });

    it('only flags same-firm active accounts when the verified policy puts them on hold', () => {
        const holdPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Blocked,
            household: false,
            simAccountEffect: SimAccountEffect.UpgradedAccountOnHold,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const live = accountRow({
            accountPolicy: holdPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        const sibling = accountRow({
            accountPolicy: holdPolicy,
            id: 'sibling',
            stage: AccountStage.Funded,
        });
        const outcome = liveExclusivityEffectsOf([live, sibling], 'live');
        expect(outcome.effects).toEqual([
            { accountId: 'sibling', action: LiveExclusivityAction.Flag },
        ]);
    });

    it('has no effect for an unverified policy', () => {
        const live = accountRow({ id: 'live', stage: AccountStage.Live });
        const sibling = accountRow({ id: 'sibling' });
        const outcome = liveExclusivityEffectsOf([live, sibling], 'live');
        expect(outcome.effects).toEqual([]);
    });

    it('has no effect for a conflicted, needs-paste or not-found policy source, only a confirmed one', () => {
        for (const source of [
            CONFLICTED_QUOTE,
            { verification: PolicyVerification.NeedsPaste } as const,
            { verification: PolicyVerification.NotFound } as const,
        ]) {
            const dormantPolicy = policyWith({
                cooldown: new UnknownCooldown(),
                evalPurchaseEffect: EvalPurchaseEffect.Unknown,
                household: false,
                simAccountEffect: SimAccountEffect.Dormant,
                source,
            });
            const live = accountRow({
                accountPolicy: dormantPolicy,
                id: 'live',
                stage: AccountStage.Live,
            });
            const sibling = accountRow({
                accountPolicy: dormantPolicy,
                id: 'sibling',
            });
            const outcome = liveExclusivityEffectsOf([live, sibling], 'live');
            expect(outcome.effects).toEqual([]);
        }
    });

    it('never applies an effect to another firm, an inactive account or another live account', () => {
        const dormantPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Dormant,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const live = accountRow({
            accountPolicy: dormantPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        const otherFirm = accountRow({
            accountPolicy: dormantPolicy,
            firmId: FIRM_B.id,
            id: 'other-firm',
        });
        const suspended = accountRow({
            accountPolicy: dormantPolicy,
            id: 'already-suspended',
            status: AccountStatus.Suspended,
        });
        const otherLive = accountRow({
            accountPolicy: dormantPolicy,
            id: 'other-live',
            stage: AccountStage.Live,
        });
        const outcome = liveExclusivityEffectsOf(
            [live, otherFirm, suspended, otherLive],
            'live',
        );
        expect(outcome.effects).toEqual([]);
    });

    it('discloses household pooling without inventing effects for accounts it cannot see', () => {
        const householdPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: true,
            simAccountEffect: SimAccountEffect.Unknown,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const live = accountRow({
            accountPolicy: householdPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        const outcome = liveExclusivityEffectsOf([live], 'live');
        expect(outcome.effects).toEqual([]);
        expect(outcome.householdDisclosed).toBe(true);
    });
});

describe('purchaseBlockedFirms', () => {
    it('blocks a firm whose verified policy blocks new purchases while an account is active live', () => {
        const blockingPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Blocked,
            household: false,
            simAccountEffect: SimAccountEffect.Unknown,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const live = accountRow({
            accountPolicy: blockingPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        expect(purchaseBlockedFirms([live], '2026-09-30')).toEqual<
            readonly PurchaseBlockedFirm[]
        >([{ firmId: FIRM_A.id, reason: PurchaseBlockReason.LiveExclusivity }]);
    });

    it('does not block a firm whose live-exclusivity policy is unverified', () => {
        const live = accountRow({ id: 'live', stage: AccountStage.Live });
        expect(purchaseBlockedFirms([live], '2026-09-30')).toEqual([]);
    });

    it('does not block a firm whose live-exclusivity policy is conflicted', () => {
        const conflictedPolicy = policyWith({
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Blocked,
            household: false,
            simAccountEffect: SimAccountEffect.Unknown,
            source: CONFLICTED_QUOTE,
        });
        const live = accountRow({
            accountPolicy: conflictedPolicy,
            id: 'live',
            stage: AccountStage.Live,
        });
        expect(purchaseBlockedFirms([live], '2026-09-30')).toEqual([]);
    });

    it('does not block a cooldown for a conflicted live-exclusivity policy', () => {
        const conflictedCooldownPolicy = policyWith({
            cooldown: new FixedCooldown(21),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Unknown,
            source: CONFLICTED_QUOTE,
        });
        const busted = accountRow({
            accountPolicy: conflictedCooldownPolicy,
            events: [
                { kind: AccountEventKind.MovedLive, occurredOn: '2026-08-01' },
                { kind: AccountEventKind.Busted, occurredOn: '2026-09-10' },
            ],
            id: 'busted',
            stage: AccountStage.Eval,
        });
        expect(purchaseBlockedFirms([busted], '2026-09-20')).toEqual([]);
    });

    it('blocks a firm inside an active cooldown after a live bust', () => {
        const cooldownPolicy = policyWith({
            cooldown: new FixedCooldown(21),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Unknown,
            source: {
                ...CONFIRMED_QUOTE,
                verification: PolicyVerification.Confirmed,
            },
        });
        const busted = accountRow({
            accountPolicy: cooldownPolicy,
            events: [
                { kind: AccountEventKind.MovedLive, occurredOn: '2026-08-01' },
                { kind: AccountEventKind.Busted, occurredOn: '2026-09-10' },
            ],
            id: 'busted',
            stage: AccountStage.Eval,
        });
        expect(purchaseBlockedFirms([busted], '2026-09-20')).toEqual([
            { firmId: FIRM_A.id, reason: PurchaseBlockReason.Cooldown },
        ]);
        expect(purchaseBlockedFirms([busted], '2026-10-05')).toEqual([]);
    });
});
