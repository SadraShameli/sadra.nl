import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
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
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    type FundedPayoutRuleContext,
    FundedSizingAdvisor,
    liveTriggerCountText,
    liveTriggerLimitsFor,
    LiveTriggerScope,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    PayoutRequestRule,
    type ReconstructedFundedOrEvalAccount,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const FIRST_QUOTE = {
    fetchedOn: '2026-09-01',
    quote: 'Accounts convert after the third payout.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/per-account',
    verification: PolicyVerification.Confirmed,
} as const;

const SECOND_QUOTE = {
    fetchedOn: '2026-09-02',
    quote: 'Ten payouts across accounts trigger a live account.',
    sourceKind: PolicySourceKind.UserPaste,
    url: 'https://example.test/firm-total',
    verification: PolicyVerification.Confirmed,
} as const;

const TIGHTER_QUOTE = {
    fetchedOn: '2026-09-03',
    quote: 'The second payout converts the account.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/tighter',
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

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(MFF_PRO_ID);

function advisorFor(
    policy: FirmAccountPolicy,
    payoutsIssued: number,
    paidPayoutsSinceLastLiveAccount: null | number = null,
): FundedSizingAdvisor {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = payoutsIssued;
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
    return new FundedSizingAdvisor({
        account,
        accountPolicy: policy,
        fundedHorizonDays: 252,
        paidPayoutsSinceLastLiveAccount,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

describe('liveTriggerLimitsFor carries the verified trigger source (PT-36f, step 5)', () => {
    it('returns the url, quote and fetch date of the tightest verified per-account trigger', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(5, FIRST_QUOTE),
                new PayoutCountPerAccountTrigger(4, TIGHTER_QUOTE),
            ]),
            plan,
            null,
        );

        expect(limits.perAccountCap).toBe(4);
        expect(limits.perAccountSource).toStrictEqual({
            fetchedOn: TIGHTER_QUOTE.fetchedOn,
            quote: TIGHTER_QUOTE.quote,
            url: TIGHTER_QUOTE.url,
        });
    });

    it('returns the source of the tightest verified firm-total trigger', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountTotalTrigger(10, SECOND_QUOTE),
            ]),
            plan,
            3,
        );

        expect(limits.firmTotalSource).toStrictEqual({
            fetchedOn: SECOND_QUOTE.fetchedOn,
            quote: SECOND_QUOTE.quote,
            url: SECOND_QUOTE.url,
        });
        expect(limits.perAccountSource).toBeNull();
    });

    it('prefers the cited trigger when an uncited reading ties on the cap', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(
                    3,
                    {
                        conflicting: FIRST_QUOTE,
                        fetchedOn: '2026-09-01',
                        quote: 'a conflicting reading',
                        sourceKind: PolicySourceKind.LiveFetch,
                        url: 'https://example.test/conflict',
                        verification: PolicyVerification.Conflict,
                    },
                    3,
                ),
                new PayoutCountPerAccountTrigger(3, FIRST_QUOTE),
            ]),
            plan,
            null,
        );

        expect(limits.perAccountSource?.url).toBe(FIRST_QUOTE.url);
    });

    it('carries no source when no trigger is verified', () => {
        const limits = liveTriggerLimitsFor(
            new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(
                    3,
                    {
                        conflicting: FIRST_QUOTE,
                        fetchedOn: '2026-09-01',
                        quote: 'a conflicting reading',
                        sourceKind: PolicySourceKind.LiveFetch,
                        url: 'https://example.test/conflict',
                        verification: PolicyVerification.Conflict,
                    },
                    3,
                ),
            ]),
            plan,
            null,
        );

        expect(limits.perAccountCap).toBe(3);
        expect(limits.perAccountSource).toBeNull();
        expect(limits.firmTotalSource).toBeNull();
    });
});

describe('WouldTriggerLive cites the verified trigger source (PT-36f, step 5)', () => {
    const perAccountPolicy = new StubTriggerPolicy([
        new PayoutCountPerAccountTrigger(3, FIRST_QUOTE),
    ]);
    const firmTotalPolicy = new StubTriggerPolicy([
        new PayoutCountTotalTrigger(10, SECOND_QUOTE),
    ]);

    it('carries the per-account source through the payout rule context and the difference reason', () => {
        const advice = advisorFor(perAccountPolicy, 2).assemble([]);
        const decision = advice.payoutAdvice?.documented;

        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                source: {
                    fetchedOn: FIRST_QUOTE.fetchedOn,
                    quote: FIRST_QUOTE.quote,
                    url: FIRST_QUOTE.url,
                },
                triggerAtPayoutCount: 3,
            },
        });
        const reason = advice.differenceReasons.find(
            (detail) => detail.kind === DifferenceReason.WouldTriggerLive,
        );
        expect(reason).toBeDefined();
        if (reason === undefined) return;
        const text = differenceReasonText(reason);
        expect(text).toContain(FIRST_QUOTE.url);
        expect(text).toContain(FIRST_QUOTE.quote);
        expect(text).toContain(FIRST_QUOTE.fetchedOn);
    });

    it('carries the firm-total source for the firm scope', () => {
        const advice = advisorFor(firmTotalPolicy, 0, 9).assemble([]);
        const decision = advice.payoutAdvice?.documented;

        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                scope: LiveTriggerScope.Firm,
                source: { url: SECOND_QUOTE.url },
            },
        });
    });

    it('words the count with its citation only when a source is present', () => {
        const bare = liveTriggerCountText({
            payoutsTaken: 2,
            scope: LiveTriggerScope.Account,
            triggerAtPayoutCount: 3,
        });
        const cited = liveTriggerCountText({
            payoutsTaken: 2,
            scope: LiveTriggerScope.Account,
            source: {
                fetchedOn: FIRST_QUOTE.fetchedOn,
                quote: FIRST_QUOTE.quote,
                url: FIRST_QUOTE.url,
            },
            triggerAtPayoutCount: 3,
        });

        expect(bare).toBe('2 of 3 payouts taken on this account');
        expect(cited.startsWith(bare)).toBe(true);
        expect(cited).toContain(FIRST_QUOTE.url);
        expect(cited).toContain(FIRST_QUOTE.quote);
        expect(cited).toContain(FIRST_QUOTE.fetchedOn);
    });
});

describe('the strict payout rule context accepts the source fields (PT-36f, step 5)', () => {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    const baseContext: FundedPayoutRuleContext = {
        liveTriggerPerAccountCap: 3,
        liveTriggerPerAccountSource: {
            fetchedOn: FIRST_QUOTE.fetchedOn,
            quote: FIRST_QUOTE.quote,
            url: FIRST_QUOTE.url,
        },
        paidPayoutsSinceLastLiveAccount: null,
        pendingPayouts: dollars(0),
        personalRequestOverride: null,
        personalRetainedCushion: null,
        plan,
        stage: SizingStage.Funded,
        state,
        tracker,
    };

    it('parses a context that carries the cited source', () => {
        expect(() =>
            new PayoutRequestRule(DEFAULT_RULEBOOK).decide(baseContext),
        ).not.toThrow();
    });

    it('rejects a source with an extra or missing field', () => {
        const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);

        expect(() =>
            rule.decide({
                ...baseContext,
                liveTriggerPerAccountSource: { url: FIRST_QUOTE.url } as never,
            }),
        ).toThrow(ZodError);
    });
});

describe('one verification check for the live triggers (PT-36f, step 7)', () => {
    it('reads PolicyVerification.Confirmed once in PayoutAdvice.ts, through the shared citation helper', () => {
        const text = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../../../../../src/lib/prop-calculator/advisor/PayoutAdvice.ts',
            ),
            'utf8',
        );

        expect(text.match(/PolicyVerification\.Confirmed/g)).toHaveLength(1);
    });
});
