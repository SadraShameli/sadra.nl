import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ALL_FIRMS,
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type FundedCycleTracker,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SingleDayProfitTrigger,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AssumptionKind,
    DAY_STOP_REASON_TEXT,
    DayStopReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    FundedSizingAdvisor,
    LiveTriggerCoverage,
    liveTriggerLimitsFor,
    LiveTriggerScope,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const TOPSTEP_CONSISTENCY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardConsistency,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const CITED_SOURCE = {
    fetchedOn: CONFIRMED_SOURCE.fetchedOn,
    quote: CONFIRMED_SOURCE.quote,
    url: CONFIRMED_SOURCE.url,
} as const;

const CONFLICTED_SOURCE = {
    conflicting: CONFIRMED_SOURCE,
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
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

function accountFor(
    plan: Plan,
    payoutsIssued: number,
    state: AccountState = fundedState(),
): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: trackerFor(state, payoutsIssued),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function advisorFor(
    account: ReconstructedFundedOrEvalAccount,
    options: {
        readonly accountPolicy?: FirmAccountPolicy;
        readonly paidPayoutsSinceLastLiveAccount?: null | number;
        readonly positionSizing?: {
            readonly instrument: InstrumentSymbol;
            readonly stopPoints: number;
        };
    } = {},
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account,
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        ...options,
    });
}

function fundedState(overrides: Partial<AccountState> = {}): AccountState {
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
        ...overrides,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function singleDayPolicy(amount: number): FirmAccountPolicy {
    return new StubTriggerPolicy([
        new SingleDayProfitTrigger(
            dollars(amount),
            true,
            false,
            CONFIRMED_SOURCE,
        ),
    ]);
}

function trackerFor(
    state: AccountState,
    payoutsIssued: number,
): FundedCycleTracker {
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = payoutsIssued;
    return tracker;
}

describe('FundedSizingAdvisor: verified live-trigger count limits (PT-36d, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('does not block an eligible payout on a firm whose live triggers are unverified (the default)', () => {
        const advice = advisorFor(accountFor(plan, 2)).assemble([]);
        expect(advice.payoutAdvice?.documented.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.payoutAdvice?.assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });

    it('blocks the third payout on a firm with a verified per-account trigger at 3 and names the account scope', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 2), {
            accountPolicy: policy,
        }).assemble([]);
        const decision = advice.payoutAdvice?.documented;
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                source: CITED_SOURCE,
                triggerAtPayoutCount: 3,
            },
        });
        expect(advice.differenceReasons).toContainEqual({
            kind: DifferenceReason.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                source: CITED_SOURCE,
                triggerAtPayoutCount: 3,
            },
        });
        expect(advice.payoutAdvice?.assumptions).toStrictEqual([]);
    });

    it('allows the second payout under the same verified per-account trigger', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 1), {
            accountPolicy: policy,
        }).assemble([]);
        expect(advice.payoutAdvice?.documented.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.payoutAdvice?.assumptions).toStrictEqual([]);
        expect(
            advice.differenceReasons.some(
                (reason) => reason.kind === DifferenceReason.WouldTriggerLive,
            ),
        ).toBe(false);
    });

    it('blocks the tenth firm payout on a verified firm-total trigger at 10 and names the firm scope', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 0), {
            accountPolicy: policy,
            paidPayoutsSinceLastLiveAccount: 9,
        }).assemble([]);
        const decision = advice.payoutAdvice?.documented;
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                source: CITED_SOURCE,
                triggerAtPayoutCount: 10,
            },
        });
    });

    it('keeps the live-triggers-not-checked disclosure when the firm total is verified but the firm count is not supplied', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 0), {
            accountPolicy: policy,
            paidPayoutsSinceLastLiveAccount: null,
        }).assemble([]);
        expect(advice.payoutAdvice?.documented.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.payoutAdvice?.assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });

    it('never blocks on a conflicted trigger and keeps the disclosure', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFLICTED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 2), {
            accountPolicy: policy,
        }).assemble([]);
        expect(advice.payoutAdvice?.documented.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
        expect(advice.payoutAdvice?.assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });

    it('still blocks on the verified count but keeps the disclosure while a verified trigger kind is not enforced (cumulative amount)', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
            new CumulativeAmountTrigger(dollars(50_000), CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 2), {
            accountPolicy: policy,
        }).assemble([]);
        expect(advice.payoutAdvice?.documented.kind).toBe(
            PayoutRequestDecisionKind.NotEligible,
        );
        expect(advice.payoutAdvice?.assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });

    it('keeps the advice-level engine disclosure for a verified firm, since the engine cannot enforce every trigger', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const advice = advisorFor(accountFor(plan, 1), {
            accountPolicy: policy,
        }).assemble([]);
        expect(advice.assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });
});

describe('FundedSizingAdvisor: verified single-day trigger caps the daily plan (PT-36d, F-154)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('leaves the daily card uncapped with no verified trigger', () => {
        const card = advisorFor(accountFor(plan, 0)).dailyPlanCard();
        expect(card?.rungs[0]?.risk).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100,
        );
        expect(card?.rungs[0]?.cappedBy).not.toContain(
            SizingConstraint.CeilingCap,
        );
    });

    it('caps each rung at (trigger minus margin minus running PnL) over the reward multiple', () => {
        const card = advisorFor(accountFor(plan, 0), {
            accountPolicy: singleDayPolicy(250),
        }).dailyPlanCard();
        const rr =
            DEFAULT_RULEBOOK.funded.takeProfitCents /
            DEFAULT_RULEBOOK.funded.riskCents;
        const first = card?.rungs[0];
        expect(first?.risk).toBe(100);
        expect(first?.takeProfit).toBe(100 * rr);
        expect(first?.cappedBy).toContain(SizingConstraint.CeilingCap);
        expect(card?.rungs[1]?.risk).toBe(150);
        expect(card?.rungs[1]?.takeProfit).toBe(300);
    });

    it('never ignores the tighter of the funded consistency ceiling and the trigger ceiling', () => {
        const consistencyPlan = registryPlan(TOPSTEP_CONSISTENCY_ID);
        const state = fundedState({
            balance: 50_600,
            qualifyingDays: 20,
            threshold: 48_000,
            thresholdLocked: false,
        });
        const wide = advisorFor(accountFor(consistencyPlan, 0, state), {
            accountPolicy: singleDayPolicy(10_000),
        }).dailyPlanCard();
        expect(wide?.rungs[0]?.takeProfit).toBe(400);
        const tight = advisorFor(accountFor(consistencyPlan, 0, state), {
            accountPolicy: singleDayPolicy(250),
        }).dailyPlanCard();
        expect(tight?.rungs[0]?.risk).toBe(100);
        expect(tight?.rungs[0]?.takeProfit).toBe(200);
    });

    it('says stop for today, never rounding up to one contract, when the room is below one contract at the stop', () => {
        const card = advisorFor(accountFor(plan, 0), {
            accountPolicy: singleDayPolicy(100),
            positionSizing: {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 20,
            },
        }).dailyPlanCard();
        expect(card?.rungs).toStrictEqual([]);
        expect(card?.stopReason).toBe(DayStopReason.CeilingReached);
        expect(
            DAY_STOP_REASON_TEXT[DayStopReason.CeilingReached].length,
        ).toBeGreaterThan(0);
    });

    it('places at least one contract of risk when the room covers one contract at the stop', () => {
        const card = advisorFor(accountFor(plan, 0), {
            accountPolicy: singleDayPolicy(250),
            positionSizing: {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 20,
            },
        }).dailyPlanCard();
        expect(card?.rungs[0]?.risk).toBeGreaterThanOrEqual(40);
    });

    it('keeps the flat rung and never says stop for today when one contract at the entered stop costs more than the flat risk and no trigger applies', () => {
        const card = advisorFor(accountFor(plan, 0), {
            positionSizing: {
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            },
        }).dailyPlanCard();
        expect(card?.stopReason).toBe(DayStopReason.MaxTrades);
        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungs[0]?.risk).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100,
        );
    });

    it('ignores an unconfirmed single-day trigger', () => {
        const policy = new StubTriggerPolicy([
            new SingleDayProfitTrigger(
                dollars(250),
                true,
                false,
                CONFLICTED_SOURCE,
            ),
        ]);
        const card = advisorFor(accountFor(plan, 0), {
            accountPolicy: policy,
        }).dailyPlanCard();
        expect(card?.rungs[0]?.risk).toBe(
            DEFAULT_RULEBOOK.funded.riskCents / 100,
        );
    });
});

describe('liveTriggerLimitsFor (PT-36d)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('reads nothing from a missing account policy', () => {
        expect(liveTriggerLimitsFor(undefined, plan, null)).toStrictEqual({
            coverage: LiveTriggerCoverage.NotChecked,
            firmTotalCap: null,
            firmTotalSource: null,
            paidPayoutsSinceLastLiveAccount: null,
            perAccountCap: null,
            perAccountSource: null,
            singleDayCeiling: null,
        });
    });

    it('takes the tightest confirmed cap of each kind and the combined single-day ceiling', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(5, CONFIRMED_SOURCE),
                new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
                new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
                ...[300, 500].map(
                    (amount) =>
                        new SingleDayProfitTrigger(
                            dollars(amount),
                            true,
                            false,
                            CONFIRMED_SOURCE,
                        ),
                ),
            ]),
            plan,
            4,
        );
        expect(limits).toStrictEqual({
            coverage: LiveTriggerCoverage.Enforced,
            firmTotalCap: 10,
            firmTotalSource: CITED_SOURCE,
            paidPayoutsSinceLastLiveAccount: 4,
            perAccountCap: 3,
            perAccountSource: CITED_SOURCE,
            singleDayCeiling: 250,
        });
    });

    it('does not cap at a per-account trigger the plan already concludes at (the same rule as the engine override)', () => {
        const limited = plan.withMaxLifetimePayouts(5);
        const limitsAt = (cap: number) =>
            liveTriggerLimitsFor(
                new StubTriggerPolicy([
                    new PayoutCountPerAccountTrigger(cap, CONFIRMED_SOURCE),
                ]),
                limited,
                null,
            );
        expect(limitsAt(6).perAccountCap).toBeNull();
        expect(limitsAt(5).perAccountCap).toBeNull();
        expect(limitsAt(4).perAccountCap).toBe(4);
    });

    it('caps at a conflicted per-account trigger only when both readings agree, and never calls it enforced', () => {
        const agreeing = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFLICTED_SOURCE, 3),
            ]),
            plan,
            null,
        );
        expect(agreeing.perAccountCap).toBe(3);
        expect(agreeing.coverage).toBe(LiveTriggerCoverage.NotChecked);
        const disagreeing = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFLICTED_SOURCE, 4),
            ]),
            plan,
            null,
        );
        expect(disagreeing.perAccountCap).toBeNull();
    });

    it('is not checked for an empty trigger list', () => {
        expect(
            liveTriggerLimitsFor(new StubTriggerPolicy([]), plan, null)
                .coverage,
        ).toBe(LiveTriggerCoverage.NotChecked);
    });
});

describe('real firm registry (PT-36d)', () => {
    it('resolves no cap, no ceiling and no enforced coverage for any real firm plan while every firm is unverified (PT-35b has not landed)', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(
                    liveTriggerLimitsFor(firm.accountPolicy, plan, 0),
                    `${firm.id} ${serializePlanId(plan.id)}`,
                ).toStrictEqual({
                    coverage: LiveTriggerCoverage.NotChecked,
                    firmTotalCap: null,
                    firmTotalSource: null,
                    paidPayoutsSinceLastLiveAccount: 0,
                    perAccountCap: null,
                    perAccountSource: null,
                    singleDayCeiling: null,
                });
            }
        }
    });
});
