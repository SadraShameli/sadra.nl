import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type FundedPayoutRuleContext,
    LIVE_TRIGGER_NOT_CHECKED,
    LiveTriggerScope,
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

const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);

const WOULD_TRIGGER_LIVE = {
    kind: PayoutBlockReasonKind.WouldTriggerLive,
    trigger: {
        payoutsTaken: 2,
        scope: LiveTriggerScope.Account,
        triggerAtPayoutCount: 3,
    },
};

function contextFor(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    overrides: Partial<FundedPayoutRuleContext> = {},
): FundedPayoutRuleContext {
    return {
        liveTriggerFirmTotalCap: null,
        liveTriggerFirmTotalSource: null,
        liveTriggerPerAccountCap: 3,
        liveTriggerPerAccountSource: null,
        paidPayoutsSinceLastLiveAccount: null,
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

function fundedState(balance: number): AccountState {
    return {
        balance,
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

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function trackerAfterTwoPayouts(
    state: AccountState,
    calendarDays: number,
): FundedCycleTracker {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(calendarDays);
    tracker.payoutsIssued = 2;
    return tracker;
}

describe('the live trigger is checked before every wait (PT-36f, step 4)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    describe('PayoutRequestRule', () => {
        it('says the next payout goes live for an account still waiting on profit, one payout under the cap', () => {
            const state = fundedState(50_050);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const withoutCap = rule.decide(
                contextFor(plan, state, tracker, {
                    liveTriggerPerAccountCap: null,
                }),
            );

            expect(withoutCap.kind).toBe(PayoutRequestDecisionKind.Wait);
            expect(rule.decide(contextFor(plan, state, tracker))).toEqual({
                kind: PayoutRequestDecisionKind.NotEligible,
                reason: WOULD_TRIGGER_LIVE,
                sources: withoutCap.sources,
            });
        });

        it('says the next payout goes live for an account still waiting on the day gate', () => {
            const state = fundedState(55_000);
            const tracker = trackerAfterTwoPayouts(state, 0);
            const withoutCap = rule.decide(
                contextFor(plan, state, tracker, {
                    liveTriggerPerAccountCap: null,
                }),
            );

            expect(withoutCap.kind).toBe(PayoutRequestDecisionKind.Wait);
            const decision = rule.decide(contextFor(plan, state, tracker));
            expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
            if (decision.kind !== PayoutRequestDecisionKind.NotEligible) {
                return;
            }
            expect(decision.reason).toEqual(WOULD_TRIGGER_LIVE);
        });

        it('says the firm-wide count goes live for a waiting account', () => {
            const state = fundedState(50_050);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const decision = rule.decide(
                contextFor(plan, state, tracker, {
                    liveTriggerFirmTotalCap: 10,
                    liveTriggerPerAccountCap: null,
                    paidPayoutsSinceLastLiveAccount: 9,
                }),
            );

            expect(decision).toMatchObject({
                kind: PayoutRequestDecisionKind.NotEligible,
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

        it('still waits for a waiting account that is further than one payout under the cap', () => {
            const state = fundedState(50_050);
            const tracker = trackerAfterTwoPayouts(state, 20);
            tracker.payoutsIssued = 1;

            expect(rule.decide(contextFor(plan, state, tracker)).kind).toBe(
                PayoutRequestDecisionKind.Wait,
            );
        });

        it('keeps a payout already pending ahead of the live trigger', () => {
            const state = fundedState(55_000);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const decision = rule.decide(
                contextFor(plan, state, tracker, {
                    liveTriggerPerAccountCap: null,
                    pendingPayouts: dollars(4900),
                }),
            );
            const withCap = rule.decide(
                contextFor(plan, state, tracker, {
                    pendingPayouts: dollars(4900),
                }),
            );

            expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
            expect(withCap).toEqual(decision);
        });

        it('keeps an account the plan concludes at on its terminal gate, never telling it the next payout goes live', () => {
            const concluding = plan.withMaxLifetimePayouts(2);
            const state = fundedState(55_000);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const decision = rule.decide(
                contextFor(concluding, state, tracker),
            );

            expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
            if (decision.kind !== PayoutRequestDecisionKind.NotEligible) {
                return;
            }
            expect(decision.reason.kind).toBe(PayoutBlockReasonKind.Gate);
        });
    });

    describe('payoutReadiness', () => {
        it('blocks a waiting account with WouldTriggerLive and keeps its wait', () => {
            const state = fundedState(50_050);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const waiting = payoutReadiness(plan, state, tracker, {
                liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
                minRetainedCushion: 0,
            });
            const readiness = payoutReadiness(plan, state, tracker, {
                liveTrigger: {
                    firmTotalCap: null,
                    firmTotalSource: null,
                    paidPayoutsSinceLastLiveAccount: null,
                    perAccountCap: 3,
                    perAccountSource: null,
                },
                minRetainedCushion: 0,
            });

            expect(waiting.kind).toBe(PayoutReadinessKind.Blocked);
            expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
            if (
                readiness.kind !== PayoutReadinessKind.Blocked ||
                waiting.kind !== PayoutReadinessKind.Blocked
            ) {
                return;
            }
            expect(readiness.reason).toEqual(WOULD_TRIGGER_LIVE);
            expect(readiness.wait).toEqual(waiting.wait);
        });

        it('keeps the terminal gate of a concluded account ahead of the live trigger', () => {
            const state = fundedState(55_000);
            const tracker = trackerAfterTwoPayouts(state, 20);
            const readiness = payoutReadiness(
                plan.withMaxLifetimePayouts(2),
                state,
                tracker,
                {
                    liveTrigger: {
                        firmTotalCap: null,
                        firmTotalSource: null,
                        paidPayoutsSinceLastLiveAccount: null,
                        perAccountCap: 3,
                        perAccountSource: null,
                    },
                    minRetainedCushion: 0,
                },
            );

            expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
            if (readiness.kind !== PayoutReadinessKind.Blocked) return;
            expect(readiness.reason.kind).toBe(PayoutBlockReasonKind.Gate);
        });
    });
});
