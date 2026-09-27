import { describe, expect, it } from 'vitest';

import {
    CumulativeAmountTrigger,
    DiscretionaryTrigger,
    dollars,
    FirmAccountPolicy,
    FirmId,
    LifetimePayoutCapOverrideKind,
    type LiveTransitionTrigger,
    LiveTriggerKind,
    NotCheckedLiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PER_PLAN_CAP_POLICY,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    resolveLifetimePayoutCapOverride,
    SingleDayProfitTrigger,
    TradingFirm,
    TradingPhase,
    UNVERIFIED_LIVE_EXCLUSIVITY_POLICY,
    UnverifiedFirmAccountPolicy,
    unverifiedInactivityPolicyFor,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const ALL_PLANS = ALL_FIRMS.flatMap((firm) => firm.plans);
const REGISTRY_FIRST_PLAN = ALL_PLANS[0];
if (REGISTRY_FIRST_PLAN === undefined) throw new Error('registry has no plans');
const BASE_PLAN: Plan = REGISTRY_FIRST_PLAN;

function confirmedSource(): {
    fetchedOn: string;
    quote: string;
    sourceKind: PolicySourceKind;
    url: string;
    verification: PolicyVerification.Confirmed;
} {
    return {
        fetchedOn: '2026-09-26',
        quote: 'quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid',
        verification: PolicyVerification.Confirmed,
    };
}

function conflictSource(): {
    conflicting: {
        fetchedOn: string;
        quote: string;
        sourceKind: PolicySourceKind;
        url: string;
    };
    fetchedOn: string;
    quote: string;
    sourceKind: PolicySourceKind;
    url: string;
    verification: PolicyVerification.Conflict;
} {
    return {
        ...confirmedSource(),
        conflicting: {
            fetchedOn: '2026-09-01',
            quote: 'other quote',
            sourceKind: PolicySourceKind.UserPaste,
            url: 'https://example.invalid/old',
        },
        verification: PolicyVerification.Conflict,
    };
}

function planWithOwnCount(ownCount: number): Plan {
    return BASE_PLAN.withOverrides({
        maxLifetimePayouts: ownCount,
        payoutLadder: undefined,
    });
}

describe('resolveLifetimePayoutCapOverride', () => {
    it('is NotChecked when there are no triggers at all', () => {
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), []).kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
    });

    it('is NotChecked for the default NotChecked trigger', () => {
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [
                new NotCheckedLiveTransitionTrigger(),
            ]).kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
    });

    it('is NoCountTrigger when every trigger is discretionary, single-day or cumulative', () => {
        const triggers: LiveTransitionTrigger[] = [
            new DiscretionaryTrigger(confirmedSource()),
            new SingleDayProfitTrigger(
                dollars(10_000),
                true,
                true,
                confirmedSource(),
            ),
            new CumulativeAmountTrigger(dollars(100_000), confirmedSource()),
        ];
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), triggers)
                .kind,
        ).toBe(LifetimePayoutCapOverrideKind.NoCountTrigger);
    });

    it('is Capped strictly below the plan\'s own conclusion count, never at or above it', () => {
        const plan = planWithOwnCount(10);
        const capped = resolveLifetimePayoutCapOverride(plan, [
            new PayoutCountPerAccountTrigger(5, confirmedSource()),
        ]);
        expect(capped).toStrictEqual({
            cap: 5,
            kind: LifetimePayoutCapOverrideKind.Capped,
        });

        const atLimit = resolveLifetimePayoutCapOverride(plan, [
            new PayoutCountPerAccountTrigger(10, confirmedSource()),
        ]);
        expect(atLimit.kind).toBe(
            LifetimePayoutCapOverrideKind.PlanAlreadyConcludes,
        );

        const aboveLimit = resolveLifetimePayoutCapOverride(plan, [
            new PayoutCountPerAccountTrigger(15, confirmedSource()),
        ]);
        expect(aboveLimit.kind).toBe(
            LifetimePayoutCapOverrideKind.PlanAlreadyConcludes,
        );
    });

    it('the resolved cap never overrides the plan above its own conclusion count', () => {
        const plan = planWithOwnCount(10);
        const resolved = resolveLifetimePayoutCapOverride(plan, [
            new PayoutCountPerAccountTrigger(5, confirmedSource()),
        ]);
        if (resolved.kind !== LifetimePayoutCapOverrideKind.Capped) {
            throw new Error('expected Capped');
        }
        expect(plan.withMaxLifetimePayouts(resolved.cap).isAccountConcluded(
            resolved.cap,
        )).toBe(true);
        expect(
            plan
                .withMaxLifetimePayouts(resolved.cap)
                .isAccountConcluded(resolved.cap - 1),
        ).toBe(false);
    });

    it('is NotChecked for a NeedsPaste or NotFound source', () => {
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [
                new PayoutCountPerAccountTrigger(5, {
                    verification: PolicyVerification.NeedsPaste,
                }),
            ]).kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [
                new PayoutCountPerAccountTrigger(5, {
                    verification: PolicyVerification.NotFound,
                }),
            ]).kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [
                new PayoutCountPerAccountTrigger(5, undefined),
            ]).kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
    });

    it('a Conflict with two different Capped outcomes is NotChecked, pending Q14', () => {
        const trigger = new PayoutCountPerAccountTrigger(
            3,
            conflictSource(),
            5,
        );
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [trigger])
                .kind,
        ).toBe(LifetimePayoutCapOverrideKind.NotChecked);
    });

    it('a Conflict where both candidate counts already conclude the plan resolves to PlanAlreadyConcludes regardless', () => {
        const trigger = new PayoutCountPerAccountTrigger(
            10,
            conflictSource(),
            12,
        );
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [trigger])
                .kind,
        ).toBe(LifetimePayoutCapOverrideKind.PlanAlreadyConcludes);
    });

    it('a Conflict where both sides agree on the same cap resolves Capped with that cap', () => {
        const trigger = new PayoutCountPerAccountTrigger(
            5,
            conflictSource(),
            5,
        );
        expect(
            resolveLifetimePayoutCapOverride(planWithOwnCount(10), [trigger]),
        ).toStrictEqual({ cap: 5, kind: LifetimePayoutCapOverrideKind.Capped });
    });
});

describe('UnverifiedFirmAccountPolicy (the default every firm gets)', () => {
    const policy = new UnverifiedFirmAccountPolicy();

    it('gives PerPlanCapPolicy', () => {
        expect(policy.capPolicyFor(BASE_PLAN)).toStrictEqual(
            PER_PLAN_CAP_POLICY,
        );
    });

    it('gives no conduct patterns', () => {
        expect(policy.conductPatterns(BASE_PLAN)).toStrictEqual([]);
    });

    it('gives the unverified live exclusivity policy', () => {
        expect(policy.liveExclusivityFor(BASE_PLAN)).toStrictEqual(
            UNVERIFIED_LIVE_EXCLUSIVITY_POLICY,
        );
    });

    it('gives a single NotChecked live trigger', () => {
        const triggers = policy.liveTriggersFor(BASE_PLAN);
        expect(triggers).toHaveLength(1);
        expect(triggers[0]?.kind).toBe(LiveTriggerKind.NotChecked);
    });

    it('resolves lifetimePayoutCapOverride to NotChecked', () => {
        expect(policy.lifetimePayoutCapOverride(BASE_PLAN).kind).toBe(
            LifetimePayoutCapOverrideKind.NotChecked,
        );
    });

    it("gives the plan's own inactivity policy with an unverified basis", () => {
        expect(policy.inactivityFor(BASE_PLAN, TradingPhase.Funded)).toStrictEqual(
            unverifiedInactivityPolicyFor(BASE_PLAN, TradingPhase.Funded),
        );
    });
});

class CustomAccountPolicy extends FirmAccountPolicy {}

class NoAccountPolicyOverrideFirm extends TradingFirm {
    readonly displayName = 'NoAccountPolicyOverrideFirm';
    readonly id = FirmId.TopStep;
    readonly plans: readonly Plan[] = [];
    readonly website = 'https://example.invalid';
}

class OverriddenAccountPolicyFirm extends TradingFirm {
    readonly accountPolicy = new CustomAccountPolicy();
    readonly displayName = 'OverriddenAccountPolicyFirm';
    readonly id = FirmId.TopStep;
    readonly plans: readonly Plan[] = [];
    readonly website = 'https://example.invalid';
}

describe('TradingFirm.accountPolicy (PT-35 step 3)', () => {
    it('a firm with no override gets the concrete unverified default', () => {
        expect(new NoAccountPolicyOverrideFirm().accountPolicy).toBeInstanceOf(
            UnverifiedFirmAccountPolicy,
        );
    });

    it('accountPolicy is concrete and overridable', () => {
        expect(new OverriddenAccountPolicyFirm().accountPolicy).toBeInstanceOf(
            CustomAccountPolicy,
        );
    });

    it("maxFundedAccounts(plan) is unchanged for every registered firm's plan", () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(firm.maxFundedAccounts(plan)).toBe(
                    plan.maxFundedAccounts,
                );
            }
        }
    });
});
