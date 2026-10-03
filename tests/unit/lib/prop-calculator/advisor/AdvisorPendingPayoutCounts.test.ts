import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
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
    PayoutCountTotalTrigger,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import * as advisorBarrel from '~/lib/prop-calculator/advisor';
import {
    AccountReconstruction,
    createSizingAdvisor,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    fundedPayoutRuleContextOf,
    LIVE_TRIGGER_NOT_CHECKED,
    liveTriggerBlockReasonFor,
    liveTriggerLimitsFor,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    payoutReadiness,
    PayoutReadinessKind,
    PayoutRequestDecisionKind,
    PayoutRequestRule,
    type ReconstructedFundedOrEvalAccount,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

const SCANNED_SOURCE_DIRECTORIES = [
    'src/lib/prop-accounts',
    'src/lib/prop-calculator/advisor',
    'src/app/(app)/prop-calculator',
] as const;

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

const PER_ACCOUNT_FOUR = new StubTriggerPolicy([
    new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE),
]);

const FIRM_TOTAL_FIVE = new StubTriggerPolicy([
    new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE),
]);

const rule = new PayoutRequestRule(DEFAULT_RULEBOOK);

function documentedDecisionOf(
    account: ReconstructedFundedOrEvalAccount,
    options: {
        readonly accountPolicy: FirmAccountPolicy;
        readonly paidPayoutsSinceLastLiveAccount: null | number;
    },
) {
    return createSizingAdvisor(account, {
        ...options,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).assemble([]).payoutAdvice?.documented;
}

function fundedAccount(
    plan: Plan,
    payoutsIssued: number,
    counts: {
        readonly otherAccountsPendingPayoutCount: number;
        readonly pendingPayoutCount: number;
        readonly pendingPayouts: number;
    },
): ReconstructedFundedOrEvalAccount {
    const state = fundedState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: trackerFor(state, payoutsIssued),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...counts,
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

function liveTriggerBlockWithoutOtherAccountCount() {
    const limits = liveTriggerLimitsFor(
        FIRM_TOTAL_FIVE,
        registryPlan(MFF_PRO_ID),
        1,
    );
    // @ts-expect-error the other accounts pending count is required
    return liveTriggerBlockReasonFor(0, limits, 0);
}

function payoutReadinessNettedWithoutCounts() {
    const state = fundedState();
    const plan = registryPlan(MFF_PRO_ID);
    const tracker = trackerFor(state, 0);
    const options = {
        liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
        minRetainedCushion: 0,
        statePendingPayoutsNetted: true,
    } as const;
    // @ts-expect-error the pending payout counts are required when the state is netted
    return payoutReadiness(plan, state, tracker, options);
}

function payoutReadinessWithoutCounts() {
    const state = fundedState();
    const plan = registryPlan(MFF_PRO_ID);
    const tracker = trackerFor(state, 0);
    const options = {
        liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
        minRetainedCushion: 0,
    };
    // @ts-expect-error the pending payout counts are required when the options omit the netting flag
    return payoutReadiness(plan, state, tracker, options);
}

function rebuildWithoutCounts() {
    // @ts-expect-error the pending payout counts are required
    return AccountReconstruction.rebuild(
        {
            asOf: '2026-09-26',
            balance: dollars(55_000),
            dashboardConvention: DashboardBalanceConvention.Nominal,
            stage: SizingStage.Funded,
        },
        registryPlan(MFF_PRO_ID),
        null,
    );
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function sourceFilesUnder(directory: string): readonly string[] {
    return readdirSync(directory).flatMap((entry) => {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) return sourceFilesUnder(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
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

function withoutKey(
    context: Record<string, unknown>,
    key: string,
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(context).filter(([name]) => name !== key),
    );
}

describe('the advisor payout rule counts several own requests like the board (PT-36m, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('blocks on the advisor with a per-account cap of 4, one issued and two own requests, as the board does', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 1, {
                otherAccountsPendingPayoutCount: 0,
                pendingPayoutCount: 2,
                pendingPayouts: 1000,
            }),
            {
                accountPolicy: PER_ACCOUNT_FOUR,
                paidPayoutsSinceLastLiveAccount: null,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 3,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 4,
            },
        });
        const state = fundedState();
        const board = payoutReadiness(plan, state, trackerFor(state, 1), {
            liveTrigger: liveTriggerLimitsFor(PER_ACCOUNT_FOUR, plan, null),
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 2,
            statePendingPayoutsNetted: true,
        });
        expect(board.kind).toBe(PayoutReadinessKind.Blocked);
        if (board.kind !== PayoutReadinessKind.Blocked) return;
        expect(board.reason).toEqual(decision.reason);
    });

    it('blocks on a request made before the snapshot, which nets no dollars', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 2, {
                otherAccountsPendingPayoutCount: 0,
                pendingPayoutCount: 1,
                pendingPayouts: 0,
            }),
            {
                accountPolicy: PER_ACCOUNT_FOUR,
                paidPayoutsSinceLastLiveAccount: null,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            trigger: { payoutsTaken: 3, scope: LiveTriggerScope.Account },
        });
    });

    it('stays eligible with one own request under the same cap', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 1, {
                otherAccountsPendingPayoutCount: 0,
                pendingPayoutCount: 1,
                pendingPayouts: 500,
            }),
            {
                accountPolicy: PER_ACCOUNT_FOUR,
                paidPayoutsSinceLastLiveAccount: null,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('adds the firm paid count, the other accounts requests and every own request for a firm-total cap, with no bridge', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 0, {
                otherAccountsPendingPayoutCount: 1,
                pendingPayoutCount: 2,
                pendingPayouts: 900,
            }),
            {
                accountPolicy: FIRM_TOTAL_FIVE,
                paidPayoutsSinceLastLiveAccount: 1,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
        if (decision?.kind !== PayoutRequestDecisionKind.NotEligible) return;
        expect(decision.reason).toMatchObject({
            trigger: {
                payoutsTaken: 4,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 5,
            },
        });
    });
});

describe('FundedPayoutRuleContext carries the pending payout counts (PT-36m, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);
    const state = fundedState();

    function contextFor(counts: Record<string, unknown>) {
        return {
            liveTriggerFirmTotalCap: null,
            liveTriggerFirmTotalSource: null,
            liveTriggerPerAccountCap: 4,
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
            tracker: trackerFor(state, 1),
            ...counts,
        } as const;
    }

    it('blocks on the context counts even when no pending dollars are entered', () => {
        const decision = rule.decide(
            contextFor({ pendingPayoutCount: 2, pendingPayouts: dollars(0) }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.NotEligible);
    });

    it('does not turn pending dollars into one request when the context counts none', () => {
        const decision = rule.decide(
            contextFor({
                pendingPayoutCount: 0,
                pendingPayouts: dollars(500),
            }),
        );
        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('rejects a context without the counts, a fractional count and a negative count', () => {
        const withoutOwn = withoutKey(contextFor({}), 'pendingPayoutCount');
        const withoutOther = withoutKey(
            contextFor({}),
            'otherAccountsPendingPayoutCount',
        );
        expect(() => rule.decide(withoutOwn as never)).toThrow(ZodError);
        expect(() => rule.decide(withoutOther as never)).toThrow(ZodError);
        expect(() =>
            rule.decide(contextFor({ pendingPayoutCount: 1.5 })),
        ).toThrow(ZodError);
        expect(() =>
            rule.decide(contextFor({ otherAccountsPendingPayoutCount: -1 })),
        ).toThrow(ZodError);
    });

    it('is built by fundedPayoutRuleContextOf from the counts it is given', () => {
        const built = fundedPayoutRuleContextOf({
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            otherAccountsPendingPayoutCount: 3,
            pendingPayoutCount: 2,
            pendingPayouts: 900,
            personalRequestOverride: null,
            personalRetainedCushion: null,
            plan,
            state,
            tracker: trackerFor(state, 0),
        });
        expect(built.pendingPayoutCount).toBe(2);
        expect(built.otherAccountsPendingPayoutCount).toBe(3);
    });
});

describe('the reconstruction takes the pending counts it is given (PT-36m, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    const baseInput = {
        asOf: '2026-09-26',
        balance: dollars(55_000),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        highestEodBalance: dollars(55_000),
        pendingPayouts: dollars(500),
        stage: SizingStage.Funded,
    } as const;

    it('exposes a named not-checked value of zero counts', () => {
        expect(NO_PENDING_PAYOUT_COUNTS).toStrictEqual({
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 0,
        });
    });

    it('does not derive a request from pending dollars when the named value is given', () => {
        const rebuilt = AccountReconstruction.rebuild(
            baseInput,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (rebuilt.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded account');
        }
        expect(rebuilt.pendingPayoutCount).toBe(0);
        expect(rebuilt.otherAccountsPendingPayoutCount).toBe(0);
    });

    it('carries real counts onto the funded account', () => {
        const rebuilt = AccountReconstruction.rebuild(baseInput, plan, null, {
            otherAccountsPendingPayoutCount: 2,
            pendingPayoutCount: 3,
        });
        if (rebuilt.kind !== TradingPhase.Funded) {
            throw new Error('expected a funded account');
        }
        expect(rebuilt.pendingPayoutCount).toBe(3);
        expect(rebuilt.otherAccountsPendingPayoutCount).toBe(2);
    });

    it('gives an evaluation account no requests of its own', () => {
        const rebuilt = AccountReconstruction.rebuild(
            {
                ...baseInput,
                pendingPayouts: undefined,
                stage: SizingStage.Eval,
            },
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        if (rebuilt.kind !== TradingPhase.Eval) {
            throw new Error('expected an eval account');
        }
        expect(rebuilt.pendingPayoutCount).toBe(0);
        expect(rebuilt.otherAccountsPendingPayoutCount).toBe(0);
    });

    it('fails to compile for a reconstruction that omits the counts', () => {
        expect(rebuildWithoutCounts).toBeTypeOf('function');
    });
});

describe('no readiness caller can omit the pending counts (PT-36m, F-145)', () => {
    it('fails to compile for a readiness call that omits the counts on either options shape', () => {
        expect(payoutReadinessWithoutCounts).toBeTypeOf('function');
        expect(payoutReadinessNettedWithoutCounts).toBeTypeOf('function');
    });

    it('fails to compile for the one fold called without the other accounts count', () => {
        expect(liveTriggerBlockWithoutOtherAccountCount).toBeTypeOf('function');
    });

    it('source holds no zero default for a count in the readiness module', () => {
        const text = readFileSync(
            path.join(
                ROOT,
                'src/lib/prop-calculator/advisor/PayoutReadiness.ts',
            ),
            'utf8',
        );
        expect(text).not.toMatch(/PendingPayoutCount\??\s*=\s*0/);
        expect(text).not.toMatch(/PendingPayoutCount\s*\?\?\s*0/);
    });
});

describe('an unreadable firm paid count ignores requests in flight for the firm-total cap (PT-36m, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('does not block on the firm total whatever the other accounts request when the paid count is null', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 0, {
                otherAccountsPendingPayoutCount: 9,
                pendingPayoutCount: 3,
                pendingPayouts: 900,
            }),
            {
                accountPolicy: FIRM_TOTAL_FIVE,
                paidPayoutsSinceLastLiveAccount: null,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.Request);
    });

    it('still counts the own requests against a per-account cap when the paid count is null', () => {
        const decision = documentedDecisionOf(
            fundedAccount(plan, 1, {
                otherAccountsPendingPayoutCount: 0,
                pendingPayoutCount: 2,
                pendingPayouts: 900,
            }),
            {
                accountPolicy: PER_ACCOUNT_FOUR,
                paidPayoutsSinceLastLiveAccount: null,
            },
        );
        expect(decision?.kind).toBe(PayoutRequestDecisionKind.NotEligible);
    });
});

describe('liveTriggerBlockReasonFor is the one fold (PT-36m, F-145)', () => {
    const REMOVED_BRIDGES = [
        'firmPayoutCountWithPendingCountsOf',
        'firmPayoutCountWithPendingOf',
        'pendingPayoutCountOf',
        'pendingPayoutCountsCoveringDollars',
    ] as const;

    const sources = new Map<string, string>();

    beforeAll(() => {
        const files = SCANNED_SOURCE_DIRECTORIES.flatMap((directory) =>
            sourceFilesUnder(path.join(ROOT, directory)),
        );
        for (const file of files) {
            sources.set(file, readFileSync(file, 'utf8'));
        }
    }, 10_000);

    it.each(REMOVED_BRIDGES)('the barrel no longer exports %s', (name) => {
        expect(Object.keys(advisorBarrel)).not.toContain(name);
    });

    it('no source file mentions a removed bridge', () => {
        const offenders = [...sources]
            .filter(([, text]) =>
                REMOVED_BRIDGES.some((name) => text.includes(name)),
            )
            .map(([file]) => path.relative(ROOT, file));
        expect(offenders).toEqual([]);
    });

    it('only its definition and the readiness module build a would-trigger-live reason', () => {
        const callers = [...sources]
            .filter(([, text]) => text.includes('wouldTriggerLiveBlockReason('))
            .map(([file]) => path.basename(file))
            .toSorted((left, right) => left.localeCompare(right));
        expect(callers).toEqual(['PayoutBlockReason.ts', 'PayoutReadiness.ts']);
    });
});
