import { describe, expect, it } from 'vitest';

import { AccountStage } from '~/lib/prop-accounts/core';
import {
    LiveProximityStatus,
    liveTransitionProximity,
} from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    dollars,
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    ledger,
    payout,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from './ledgerFixtures';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const CONFLICTED_SOURCE = {
    conflicting: CONFIRMED_SOURCE,
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Conflict,
} as const;

class MultiPlanTriggerPolicy extends FirmAccountPolicy {
    constructor(
        private readonly triggersBySerial: ReadonlyMap<
            string,
            readonly LiveTransitionTrigger[]
        >,
    ) {
        super();
    }

    override liveTriggersFor(plan: Plan): readonly LiveTransitionTrigger[] {
        return this.triggersBySerial.get(serializePlanId(plan.id)) ?? [];
    }
}

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function withStubbedPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = EVAL_PLAN.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('liveTransitionProximity', () => {
    it('reports the per-account trigger distance only when the trigger is confirmed', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({
                    accounts: [acc],
                    payouts: [
                        payout(acc, 50_000, { paidOn: '2026-09-05' }),
                        payout(acc, 50_000, { paidOn: '2026-09-10' }),
                    ],
                }),
                '2026-09-30',
            ),
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                paidPayouts: 2,
                remaining: 1,
                status: LiveProximityStatus.Verified,
                triggerCount: 3,
            }),
        ]);
    });

    it('never gives a number for a conflicted per-account trigger', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFLICTED_SOURCE),
        ]);
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({
                    accounts: [acc],
                    payouts: [payout(acc, 50_000, { paidOn: '2026-09-05' })],
                }),
                '2026-09-30',
            ),
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                remaining: null,
                status: LiveProximityStatus.Unverified,
                triggerCount: null,
            }),
        ]);
    });

    it('reports the firm-total distance since the firm-wide count from FirmPayoutCount', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const accounts = Array.from({ length: 9 }, () =>
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
        );
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({
                    accounts,
                    payouts: accounts.map((acc, index) =>
                        payout(acc, 50_000, {
                            paidOn: `2026-09-${String(index + 1).padStart(2, '0')}`,
                        }),
                    ),
                }),
                '2026-09-30',
            ),
        );
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                firmId: EVAL_PLAN.firm.id,
                paidPayoutsSinceLastLiveAccount: 9,
                remaining: 1,
                status: LiveProximityStatus.Verified,
                triggerCount: 10,
            }),
        ]);
    });

    it('gives no number for an unverified firm (the default for every firm today)', () => {
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = liveTransitionProximity(
            ledger({
                accounts: [acc],
                payouts: [payout(acc, 50_000, { paidOn: '2026-09-05' })],
            }),
            '2026-09-30',
        );
        expect(proximity.byAccount).toEqual([
            expect.objectContaining({
                status: LiveProximityStatus.Unverified,
                triggerCount: null,
            }),
        ]);
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                status: LiveProximityStatus.Unverified,
                triggerCount: null,
            }),
        ]);
        expect(proximity.singleDayFacts).toEqual([]);
    });

    it('lists a confirmed single-day trigger as a static fact with its quote, never a computed number', () => {
        const policy = new StubTriggerPolicy([
            new SingleDayProfitTrigger(
                dollars(10_000),
                true,
                false,
                CONFIRMED_SOURCE,
            ),
        ]);
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(ledger({ accounts: [acc] }), '2026-09-30'),
        );
        expect(proximity.singleDayFacts).toEqual([
            expect.objectContaining({
                amount: 10_000,
                firmId: EVAL_PLAN.firm.id,
                isAutomatic: true,
                isExcessForfeited: false,
                quote: CONFIRMED_SOURCE,
            }),
        ]);
    });

    it('drops an unconfirmed single-day trigger from the static facts', () => {
        const policy = new StubTriggerPolicy([
            new SingleDayProfitTrigger(
                dollars(10_000),
                true,
                false,
                CONFLICTED_SOURCE,
            ),
        ]);
        const acc = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(ledger({ accounts: [acc] }), '2026-09-30'),
        );
        expect(proximity.singleDayFacts).toEqual([]);
    });

    it('lists a confirmed single-day trigger fact for every plan at the firm, not only the first-encountered plan', () => {
        const evalSerial = serializePlanId(EVAL_PLAN.plan.id);
        const secondSerial = serializePlanId(
            SAME_FIRM_SECOND_EVAL_PLAN.plan.id,
        );
        const evalTriggers = [
            new SingleDayProfitTrigger(
                dollars(10_000),
                true,
                false,
                CONFIRMED_SOURCE,
            ),
        ];
        const secondTriggers = [
            new SingleDayProfitTrigger(
                dollars(20_000),
                true,
                false,
                CONFIRMED_SOURCE,
            ),
        ];
        const policy = new MultiPlanTriggerPolicy(
            new Map([
                [evalSerial, evalTriggers],
                [secondSerial, secondTriggers],
            ]),
        );
        const accA = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const accB = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({ accounts: [accA, accB] }),
                '2026-09-30',
            ),
        );
        expect(proximity.singleDayFacts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    amount: 10_000,
                    planSerial: evalSerial,
                }),
                expect.objectContaining({
                    amount: 20_000,
                    planSerial: secondSerial,
                }),
            ]),
        );
        expect(proximity.singleDayFacts).toHaveLength(2);
    });

    it("treats a firm-total trigger cap that disagrees across the firm's own plans as unverified rather than guessing", () => {
        const evalSerial = serializePlanId(EVAL_PLAN.plan.id);
        const secondSerial = serializePlanId(
            SAME_FIRM_SECOND_EVAL_PLAN.plan.id,
        );
        const policy = new MultiPlanTriggerPolicy(
            new Map([
                [
                    evalSerial,
                    [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
                ],
                [
                    secondSerial,
                    [new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE)],
                ],
            ]),
        );
        const accA = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const accB = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({ accounts: [accA, accB] }),
                '2026-09-30',
            ),
        );
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                remaining: null,
                status: LiveProximityStatus.Unverified,
                triggerCount: null,
            }),
        ]);
    });

    it('agrees on a firm-total trigger cap that is the same on every plan at the firm', () => {
        const evalSerial = serializePlanId(EVAL_PLAN.plan.id);
        const secondSerial = serializePlanId(
            SAME_FIRM_SECOND_EVAL_PLAN.plan.id,
        );
        const policy = new MultiPlanTriggerPolicy(
            new Map([
                [
                    evalSerial,
                    [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
                ],
                [
                    secondSerial,
                    [new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE)],
                ],
            ]),
        );
        const accA = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const accB = account(SAME_FIRM_SECOND_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const proximity = withStubbedPolicy(policy, () =>
            liveTransitionProximity(
                ledger({
                    accounts: [accA, accB],
                    payouts: [payout(accA, 50_000, { paidOn: '2026-09-05' })],
                }),
                '2026-09-30',
            ),
        );
        expect(proximity.byFirm).toEqual([
            expect.objectContaining({
                status: LiveProximityStatus.Verified,
                triggerCount: 10,
            }),
        ]);
    });

    it('keeps every real firm unverified until PT-35b ships verified data (registry pin)', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                for (const trigger of firm.accountPolicy.liveTriggersFor(
                    plan,
                )) {
                    expect(trigger.source).toBeUndefined();
                }
            }
        }
    });
});
