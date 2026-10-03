import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    exclusivityAccountsOf,
    exclusivityFirmIdOf,
    exclusivityPlanOf,
    type ExclusivitySibling,
    isExclusivitySiblingReadable,
    liveExclusivityEffectsOf,
    suspendedAccountIdsOf,
    trackedAccountOf,
} from '~/lib/prop-accounts/core';
import { type ExclusivitySiblingRow } from '~/lib/prop-accounts/core/ExclusivityAccounts';
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

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

const FIRM = required(ALL_FIRMS[0], 'a registered firm');
const PLAN = required(FIRM.plans[0], 'a plan');
const OTHER_FIRM = required(
    ALL_FIRMS.find((firm) => firm.id !== FIRM.id),
    'a second firm',
);
const OTHER_PLAN = required(OTHER_FIRM.plans[0], 'a plan at another firm');

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class ExclusivityStub extends FirmAccountPolicy {
    constructor(private readonly effect: SimAccountEffect) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return {
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: this.effect,
            source: CONFIRMED_SOURCE,
        };
    }
}

const MOVED = {
    id: 'live',
    plan: PLAN,
    stage: AccountStage.Live,
    status: AccountStatus.Active,
};

function required<T>(value: T | undefined, label: string): T {
    if (value === undefined) throw new Error(`expected ${label}`);
    return value;
}

function sibling(
    id: string,
    overrides: Partial<ExclusivitySibling> = {},
): ExclusivitySibling {
    return {
        firmId: FIRM.id,
        id,
        isArchived: false,
        plan: PLAN,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        ...overrides,
    };
}

function siblingRow(overrides: Partial<ExclusivitySiblingRow> = {}) {
    return trackedAccountOf({
        accountSize: PLAN.id.accountSize,
        externalFirmId: null,
        firmId: FIRM.id,
        id: 'row',
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        readIssues: [],
        tracking: AccountTracking.Modeled,
        ...overrides,
    });
}

function suspendedFor(
    effect: SimAccountEffect,
    siblings: readonly ExclusivitySibling[],
): readonly string[] {
    return withPolicy(new ExclusivityStub(effect), () => {
        const accounts = exclusivityAccountsOf(MOVED, siblings);
        const outcome = liveExclusivityEffectsOf(accounts, 'live');
        return suspendedAccountIdsOf(outcome);
    });
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

describe('exclusivityAccountsOf', () => {
    it('puts the moved account first with the stage and status it is given', () => {
        const accounts = exclusivityAccountsOf(
            { ...MOVED, status: AccountStatus.Active },
            [sibling('eval')],
        );
        expect(accounts.map((account) => account.id)).toEqual(['live', 'eval']);
        expect(accounts[0]).toMatchObject({
            firmId: FIRM.id,
            plan: PLAN,
            stage: AccountStage.Live,
            status: AccountStatus.Active,
        });
    });

    it('skips an archived sibling and one whose firm is unknown', () => {
        const accounts = exclusivityAccountsOf(MOVED, [
            sibling('archived', { isArchived: true }),
            sibling('no-firm', { firmId: undefined }),
            sibling('kept'),
        ]);
        expect(accounts.map((account) => account.id)).toEqual(['live', 'kept']);
    });

    it('gives a sibling without a plan the moved account plan, since the effects ignore a sibling plan', () => {
        const accounts = exclusivityAccountsOf(MOVED, [
            sibling('ledger', { plan: null }),
        ]);
        expect(accounts[1]?.plan).toBe(PLAN);
    });

    it('keeps a sibling own plan and firm and uses the moved firm policy for all', () => {
        const accounts = exclusivityAccountsOf(MOVED, [
            sibling('elsewhere', {
                firmId: OTHER_FIRM.id,
                plan: OTHER_PLAN,
            }),
        ]);
        expect(accounts[1]).toMatchObject({
            accountPolicy: FIRM.accountPolicy,
            firmId: OTHER_FIRM.id,
            plan: OTHER_PLAN,
        });
    });

    it('returns nothing when the moved plan belongs to no registered firm', () => {
        const unknownFirmPlan = Object.create(PLAN, {
            id: { value: { ...PLAN.id, firm: 'no-such-firm' } },
        }) as typeof PLAN;
        const accounts = exclusivityAccountsOf(
            { ...MOVED, plan: unknownFirmPlan },
            [sibling('eval')],
        );
        expect(accounts).toEqual([]);
    });
});

describe('suspendedAccountIdsOf', () => {
    it('lists only the accounts the verified policy suspends', () => {
        const ids = suspendedFor(SimAccountEffect.Dormant, [
            sibling('eval'),
            sibling('funded', { stage: AccountStage.Funded }),
            sibling('busted', { status: AccountStatus.Busted }),
            sibling('elsewhere', { firmId: OTHER_FIRM.id, plan: OTHER_PLAN }),
        ]);
        expect(ids.toSorted(compareText)).toEqual(['eval', 'funded']);
    });

    it('lists nothing for a flag-only effect', () => {
        expect(
            suspendedFor(SimAccountEffect.UpgradedAccountOnHold, [
                sibling('eval'),
            ]),
        ).toEqual([]);
    });
});

describe('one exclusivity account builder', () => {
    it.each([
        'src/server/api/routers/propAccounts/event.ts',
        'src/app/(app)/prop-calculator/accounts/_components/detail/liveExclusivityPreview.ts',
    ])(
        '%s builds its accounts and Suspend ids through the shared helpers',
        (file) => {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            expect(source.includes('exclusivityAccountsOf(')).toBe(true);
            expect(source.includes('suspendedAccountIdsOf(')).toBe(true);
            expect(source.includes('accountPolicy:')).toBe(false);
            expect(source.includes('events: []')).toBe(false);
        },
    );
});

describe('one sibling readability rule (PT-36i)', () => {
    it('reads a modeled account whose plan resolves, at the plan firm', () => {
        expect(exclusivityFirmIdOf(siblingRow())).toBe(FIRM.id);
        expect(exclusivityPlanOf(siblingRow())).toBe(PLAN);
        expect(isExclusivitySiblingReadable(siblingRow())).toBe(true);
    });

    it('cannot read a modeled account whose plan no longer resolves', () => {
        const unresolved = siblingRow({ planSerial: 'no-such-plan' });
        expect(exclusivityFirmIdOf(unresolved)).toBeUndefined();
        expect(exclusivityPlanOf(unresolved)).toBeNull();
        expect(isExclusivitySiblingReadable(unresolved)).toBe(false);
    });

    it('reads a ledger-only account at a listed firm and not one at an external firm', () => {
        const listedFirm = siblingRow({
            externalFirmId: null,
            firmId: FIRM.id,
            planLabel: 'Funded 50K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const external = siblingRow({
            externalFirmId: 'my-external-firm',
            firmId: null,
            planLabel: 'Funded 50K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        expect(exclusivityFirmIdOf(listedFirm)).toBe(FIRM.id);
        expect(exclusivityPlanOf(listedFirm)).toBeNull();
        expect(isExclusivitySiblingReadable(listedFirm)).toBe(true);
        expect(exclusivityFirmIdOf(external)).toBeUndefined();
        expect(isExclusivitySiblingReadable(external)).toBe(false);
    });

    it.each([
        'src/server/api/routers/propAccounts/event.ts',
        'src/app/(app)/prop-calculator/accounts/_components/detail/liveExclusivityPreview.ts',
    ])(
        '%s decides sibling readability through the shared helper, with no plan-key resolution of its own',
        (file) => {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            expect(source.includes('isExclusivitySiblingReadable(')).toBe(true);
            expect(source.includes('resolvePlanKey(')).toBe(false);
            expect(source.includes('PlanKeyResolutionKind')).toBe(false);
        },
    );
});
