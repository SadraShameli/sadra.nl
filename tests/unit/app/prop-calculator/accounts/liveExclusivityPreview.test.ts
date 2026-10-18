import { describe, expect, it } from 'vitest';

import {
    liveExclusivityPreviewOf,
    type LivePreviewAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/liveExclusivityPreview';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    LiveExclusivityAction,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    type LiveExclusivityPolicy,
    NO_PLAN_OPT_INS,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SimAccountEffect,
    UnknownCooldown,
} from '~/lib/prop-calculator';

const FIRM = required(ALL_FIRMS[0], 'a registered firm');
const OTHER_FIRM = required(
    ALL_FIRMS.find((firm) => firm.id !== FIRM.id),
    'a second firm',
);
const PLAN = required(FIRM.plans[0], 'a plan');
const OTHER_PLAN = required(OTHER_FIRM.plans[0], 'a plan at another firm');

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class ExclusivityStub extends FirmAccountPolicy {
    constructor(
        private readonly effect: SimAccountEffect,
        private readonly source: LiveExclusivityPolicy['source'],
        private readonly isHousehold = false,
    ) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return {
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: this.isHousehold,
            simAccountEffect: this.effect,
            source: this.source,
        };
    }
}

function listed(
    id: string,
    overrides: Partial<LivePreviewAccount> = {},
): LivePreviewAccount {
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        externalFirmId: null,
        firmId: FIRM.id,
        id,
        label: `Account ${id}`,
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) throw new Error(`expected ${label}`);
    return value;
}

function withPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = FIRM as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

const SUSPEND_POLICY = new ExclusivityStub(
    SimAccountEffect.Dormant,
    CONFIRMED_SOURCE,
);

describe('liveExclusivityPreviewOf', () => {
    it('lists each affected sibling and confirms exactly the ones the policy suspends', () => {
        const preview = withPolicy(SUSPEND_POLICY, () =>
            liveExclusivityPreviewOf(
                [
                    listed('live', {
                        label: 'Alpha',
                        stage: AccountStage.Funded,
                    }),
                    listed('eval'),
                    listed('funded', { stage: AccountStage.Funded }),
                    listed('already-live', { stage: AccountStage.Live }),
                    listed('busted', { status: AccountStatus.Busted }),
                    listed('suspended', { status: AccountStatus.Suspended }),
                    listed('archived', { archivedAt: new Date() }),
                    listed('elsewhere', {
                        accountSize: OTHER_PLAN.id.accountSize,
                        firmId: OTHER_FIRM.id,
                        planSerial: serializePlanId(OTHER_PLAN.id),
                    }),
                ],
                'live',
            ),
        );
        expect(preview?.confirmedAccountIds.toSorted(compareText)).toEqual([
            'eval',
            'funded',
        ]);
        expect(preview?.effects.map((effect) => effect.accountId)).toEqual([
            'eval',
            'funded',
        ]);
        expect(
            preview?.effects.every(
                (effect) => effect.action === LiveExclusivityAction.Suspend,
            ),
        ).toBe(true);
        expect(preview?.title).toBe(
            'Alpha going live changes 2 other accounts',
        );
        expect(preview?.lines).toEqual([
            "Account eval: suspended, because the firm's verified policy takes its other accounts out of play while live",
            "Account funded: suspended, because the firm's verified policy takes its other accounts out of play while live",
        ]);
    });

    it('lists a sibling the firm only puts on hold without confirming it, since recording changes nothing there', () => {
        const preview = withPolicy(
            new ExclusivityStub(
                SimAccountEffect.UpgradedAccountOnHold,
                CONFIRMED_SOURCE,
            ),
            () =>
                liveExclusivityPreviewOf(
                    [
                        listed('live', { stage: AccountStage.Funded }),
                        listed('eval'),
                    ],
                    'live',
                ),
        );
        expect(preview?.confirmedAccountIds).toEqual([]);
        expect(preview?.effects).toEqual([
            expect.objectContaining({
                accountId: 'eval',
                action: LiveExclusivityAction.Flag,
            }),
        ]);
        expect(preview?.lines).toEqual([
            "Account eval: flagged, because the firm's verified policy puts its other accounts on hold while live; record that yourself, moving live does not change it",
        ]);
    });

    it('says nothing for an unverified firm policy, which is every real firm today', () => {
        expect(
            liveExclusivityPreviewOf(
                [
                    listed('live', { stage: AccountStage.Funded }),
                    listed('eval'),
                ],
                'live',
            ),
        ).toBeNull();
    });

    it('says nothing for a conflicted, needs-paste or not-found source', () => {
        for (const source of [
            { verification: PolicyVerification.NeedsPaste } as const,
            { verification: PolicyVerification.NotFound } as const,
            {
                ...CONFIRMED_SOURCE,
                conflicting: CONFIRMED_SOURCE,
                verification: PolicyVerification.Conflict,
            } as const,
        ]) {
            expect(
                withPolicy(
                    new ExclusivityStub(SimAccountEffect.Dormant, source),
                    () =>
                        liveExclusivityPreviewOf(
                            [
                                listed('live', { stage: AccountStage.Funded }),
                                listed('eval'),
                            ],
                            'live',
                        ),
                ),
            ).toBeNull();
        }
    });

    it('says nothing when the firm has no other open account to affect', () => {
        expect(
            withPolicy(SUSPEND_POLICY, () =>
                liveExclusivityPreviewOf(
                    [listed('live', { stage: AccountStage.Funded })],
                    'live',
                ),
            ),
        ).toBeNull();
    });

    it('discloses a household rule it cannot check, even when no account here is affected', () => {
        const preview = withPolicy(
            new ExclusivityStub(
                SimAccountEffect.Dormant,
                CONFIRMED_SOURCE,
                true,
            ),
            () =>
                liveExclusivityPreviewOf(
                    [listed('live', { stage: AccountStage.Funded })],
                    'live',
                ),
        );
        expect(preview?.confirmedAccountIds).toEqual([]);
        expect(preview?.effects).toEqual([]);
        expect(preview?.lines).toEqual([
            "The firm's rules also reach accounts held by others in your household; those are not tracked here and are not changed.",
        ]);
    });

    it('offers a ledger-only sibling at the same listed firm', () => {
        const preview = withPolicy(SUSPEND_POLICY, () =>
            liveExclusivityPreviewOf(
                [
                    listed('live', { stage: AccountStage.Funded }),
                    listed('ledger', {
                        planLabel: 'Hand typed plan',
                        planSerial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                ],
                'live',
            ),
        );
        expect(preview?.confirmedAccountIds).toEqual(['ledger']);
    });

    it('does not offer a ledger-only sibling at an external firm, and names a same-firm sibling whose plan cannot be read', () => {
        const preview = withPolicy(SUSPEND_POLICY, () =>
            liveExclusivityPreviewOf(
                [
                    listed('live', { stage: AccountStage.Funded }),
                    listed('external', {
                        externalFirmId: 'external-firm',
                        firmId: null,
                        planLabel: 'Somewhere else',
                        planSerial: null,
                        tracking: AccountTracking.LedgerOnly,
                    }),
                    listed('unreadable', { planSerial: 'no-such-plan' }),
                    listed('eval'),
                ],
                'live',
            ),
        );
        expect(preview?.confirmedAccountIds).toEqual(['eval']);
        expect(preview?.lines.at(-1)).toBe(
            '1 account at this firm has a plan that cannot be read, so it is not offered here and keeps its status.',
        );
    });

    it('says nothing when the account moving live is not found, ledger only or unreadable', () => {
        const siblings = [listed('eval')];
        for (const moved of [
            null,
            listed('live', {
                planLabel: 'Hand typed plan',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
            listed('live', { planSerial: 'no-such-plan' }),
        ]) {
            expect(
                withPolicy(SUSPEND_POLICY, () =>
                    liveExclusivityPreviewOf(
                        moved === null ? siblings : [moved, ...siblings],
                        'live',
                    ),
                ),
            ).toBeNull();
        }
    });
});
