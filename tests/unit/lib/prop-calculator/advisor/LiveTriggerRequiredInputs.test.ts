import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type FundedCycleTracker,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCountPerAccountTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type FundedPayoutRuleContext,
    LIVE_TRIGGER_NOT_CHECKED,
    LiveTriggerCoverage,
    liveTriggerLimitsFor,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    payoutReadiness,
    PayoutReadinessKind,
    PayoutRequestDecisionKind,
    PayoutRequestRule,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const FULL_QUOTE = {
    fetchedOn: '2026-09-01',
    quote: 'Accounts convert after the third payout.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/per-account',
    verification: PolicyVerification.Confirmed,
} as const;

const CONFLICT_QUOTE = {
    conflicting: {
        fetchedOn: '2026-09-02',
        quote: 'The third payout converts the account.',
        sourceKind: PolicySourceKind.UserPaste,
        url: 'https://example.test/other',
    },
    fetchedOn: '2026-09-01',
    quote: 'Accounts convert after the third payout.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/per-account',
    verification: PolicyVerification.Conflict,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);

function contextFor(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    overrides: Partial<FundedPayoutRuleContext> = {},
): FundedPayoutRuleContext {
    return {
        liveTriggerFirmTotalCap: null,
        liveTriggerFirmTotalSource: null,
        liveTriggerPerAccountCap: null,
        liveTriggerPerAccountSource: null,
        otherAccountsPendingPayoutCount: 0,
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayoutCount: 0,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan,
        stage: SizingStage.Funded,
        state,
        tracker,
        ...overrides,
    };
}

function fundedState(): AccountState {
    return {
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
}

function registryPlan(): Plan {
    const found = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!found) throw new Error(`${serializePlanId(MFF_PRO_ID)} missing`);
    return found;
}

function trackerWith(
    state: AccountState,
    payoutsIssued: number,
): FundedCycleTracker {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = payoutsIssued;
    return tracker;
}

describe('the live-trigger inputs are required (PT-36g)', () => {
    const plan = registryPlan();

    it.each([
        'liveTriggerFirmTotalCap',
        'liveTriggerFirmTotalSource',
        'liveTriggerPerAccountCap',
        'liveTriggerPerAccountSource',
    ] as const)(
        'refuses a funded payout context that leaves out %s',
        (omitted) => {
            const state = fundedState();
            const context = contextFor(plan, state, trackerWith(state, 0));
            const withoutField = Object.fromEntries(
                Object.entries(context).filter(([key]) => key !== omitted),
            ) as unknown as FundedPayoutRuleContext;
            expect(() => rule.decide(withoutField)).toThrow(ZodError);
        },
    );

    it('refuses payoutReadiness options that leave out the live trigger', () => {
        const state = fundedState();
        const withoutLiveTrigger = {
            minRetainedCushion: 0,
        } as unknown as Parameters<typeof payoutReadiness>[3];
        expect(() =>
            payoutReadiness(
                plan,
                state,
                trackerWith(state, 2),
                withoutLiveTrigger,
            ),
        ).toThrow(TypeError);
    });

    it('exports one explicit not-checked value that never blocks and says so', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 2), {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
        expect(LIVE_TRIGGER_NOT_CHECKED.coverage).toBe(
            LiveTriggerCoverage.NotChecked,
        );
        expect(LIVE_TRIGGER_NOT_CHECKED.perAccountCap).toBeNull();
        expect(LIVE_TRIGGER_NOT_CHECKED.firmTotalCap).toBeNull();
    });
});

describe('a pending payout counts toward the live trigger (PT-36g)', () => {
    const plan = registryPlan();
    const perAccountThree = {
        ...LIVE_TRIGGER_NOT_CHECKED,
        perAccountCap: 3,
    };

    it('payoutReadiness: one payout taken and one pending makes the next request the third', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 1), {
            liveTrigger: perAccountThree,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(readiness).toMatchObject({
            kind: PayoutReadinessKind.Blocked,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: {
                    payoutsTaken: 2,
                    scope: LiveTriggerScope.Account,
                    triggerAtPayoutCount: 3,
                },
            },
        });
    });

    it('payoutReadiness: the same account with no pending payout is still eligible', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 1), {
            liveTrigger: perAccountThree,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 0,
            pendingPayouts: 0,
            statePendingPayoutsNetted: false,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('payoutReadiness: the firm-wide count includes a pending payout', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 0), {
            liveTrigger: {
                ...LIVE_TRIGGER_NOT_CHECKED,
                firmTotalCap: 10,
                paidPayoutsSinceLastLiveAccount: 8,
            },
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(readiness).toMatchObject({
            kind: PayoutReadinessKind.Blocked,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: {
                    payoutsTaken: 9,
                    scope: LiveTriggerScope.Firm,
                    triggerAtPayoutCount: 10,
                },
            },
        });
    });

    it('PayoutRequestRule: one payout taken and one pending makes the next request the third', () => {
        const state = fundedState();
        const decision = rule.decide(
            contextFor(plan, state, trackerWith(state, 1), {
                liveTriggerPerAccountCap: 3,
                pendingPayoutCount: 1,
                pendingPayouts: dollars(100),
            }),
        );
        expect(decision).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: {
                    payoutsTaken: 2,
                    scope: LiveTriggerScope.Account,
                    triggerAtPayoutCount: 3,
                },
            },
        });
    });

    it('PayoutRequestRule: the same account with no pending payout requests', () => {
        const state = fundedState();
        const decision = rule.decide(
            contextFor(plan, state, trackerWith(state, 1), {
                liveTriggerPerAccountCap: 3,
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
    });
});

describe('the live-trigger source schema follows PolicyCitation (PT-36g)', () => {
    const plan = registryPlan();

    it('accepts a full policy quote as the source and keeps only the citation fields', () => {
        const state = fundedState();
        const decision = rule.decide(
            contextFor(plan, state, trackerWith(state, 2), {
                liveTriggerPerAccountCap: 3,
                liveTriggerPerAccountSource: FULL_QUOTE,
            }),
        );
        expect(decision).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: {
                    source: {
                        fetchedOn: FULL_QUOTE.fetchedOn,
                        quote: FULL_QUOTE.quote,
                        url: FULL_QUOTE.url,
                    },
                },
            },
        });
        if (
            decision.kind !== PayoutRequestDecisionKind.NotEligible ||
            decision.reason.kind !== PayoutBlockReasonKind.WouldTriggerLive
        ) {
            return;
        }
        expect(
            Object.keys(decision.reason.trigger.source ?? {}).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(['fetchedOn', 'quote', 'url']);
    });

    it('still rejects a source with an empty quote', () => {
        const state = fundedState();
        expect(() =>
            rule.decide(
                contextFor(plan, state, trackerWith(state, 2), {
                    liveTriggerPerAccountCap: 3,
                    liveTriggerPerAccountSource: {
                        fetchedOn: '2026-09-01',
                        quote: '',
                        url: 'https://example.test/per-account',
                    },
                }),
            ),
        ).toThrow(ZodError);
    });
});

describe('a per-account trigger whose sources conflict but agree on the cap (PT-36g)', () => {
    const plan = registryPlan();

    it('still carries the primary quote as its source and stays not checked', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFLICT_QUOTE, 3),
            ]),
            plan,
            null,
        );
        expect(limits.perAccountCap).toBe(3);
        expect(limits.perAccountSource).toEqual({
            fetchedOn: CONFLICT_QUOTE.fetchedOn,
            quote: CONFLICT_QUOTE.quote,
            url: CONFLICT_QUOTE.url,
        });
        expect(limits.coverage).toBe(LiveTriggerCoverage.NotChecked);
    });

    it('applies no cap when the conflicting sources disagree on it', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFLICT_QUOTE, 4),
            ]),
            plan,
            null,
        );
        expect(limits.perAccountCap).toBeNull();
        expect(limits.perAccountSource).toBeNull();
    });
});
