import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    findLivePlanBuilder,
    FirmId,
    type FundedCycleTracker,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    documentedPayoutRequest,
    type FundedPayoutRuleContext,
    type LivePayoutRuleContext,
    PayoutRequestDecisionKind,
    PayoutRequestNotice,
    PayoutRequestRule,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { resolveDocumentedPayoutRequestSize } from '~/lib/prop-calculator/advisor/policy';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function engineRequestOf(
    plan: Plan,
    rulebook: RulebookParameters,
    override: null | number,
): number {
    const { policy } = buildEnginePolicy({
        accountPolicy: undefined,
        fundedHorizonDays: 252,
        plan,
        rulebook,
    });
    return resolveDocumentedPayoutRequestSize(
        plan,
        { ...policy, payoutRequestOverride: override },
        rulebook.payout,
    );
}

function fundedContext(
    override: null | number,
): { context: FundedPayoutRuleContext; plan: Plan } {
    const plan = registryPlan(MFF_PRO_ID);
    const state = fundedState();
    const tracker: FundedCycleTracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    tracker.restoreCalendarDayGateProgress(20);
    return {
        context: {
            paidPayoutsSinceLastLiveAccount: null,
            pendingPayouts: dollars(0),
            personalRequestOverride: override === null ? null : dollars(override),
            personalRetainedCushion: null,
            plan,
            stage: SizingStage.Funded,
            state,
            tracker,
        },
        plan,
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

function liveContext(override: null | number) {
    const builder = findLivePlanBuilder(FirmId.TopStep);
    if (!builder) throw new Error('missing TopStep live plan builder');
    const livePlan = builder(TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT);
    const state = livePlan.initialState();
    state.qualifyingDays = 30;
    state.balance =
        state.startingBalance + livePlan.defaultRetainedCushion() + 5000;
    const context: LivePayoutRuleContext = {
        livePlan,
        paidPayoutsSinceLastLiveAccount: null,
        personalRequestOverride: override === null ? null : dollars(override),
        personalRetainedCushion: null,
        stage: SizingStage.Live,
        state,
    };
    return context;
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function rulebookWith(requestCents: number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: { ...DEFAULT_RULEBOOK.payout, requestCents },
    };
}

describe('PayoutRequestRule reads the one documented payout request (PT-19h, F-128)', () => {
    it('keeps no copy of the rulebook request conversion in PayoutRequestRule.ts', () => {
        const source = readFileSync(
            path.join(
                REPO_ROOT,
                'src/lib/prop-calculator/advisor/PayoutRequestRule.ts',
            ),
            'utf8',
        );

        expect(source).not.toMatch(/requestCents\s*\/\s*CENTS_PER_DOLLAR/);
        expect(source).not.toMatch(/personalRequestOverride\s*\?\?/);
    });

    it.each([
        { label: 'no override', override: null },
        { label: 'a personal override', override: 1234 },
        { label: 'an override below the firm minimum', override: 1 },
    ])(
        'funded: requests the same amount as the engine documented request with $label',
        ({ override }) => {
            const rulebook = rulebookWith(75_000);
            const { context, plan } = fundedContext(override);

            const decision = new PayoutRequestRule(rulebook).decide(context);

            expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
            if (decision.kind !== PayoutRequestDecisionKind.Request) return;
            expect(decision.requestAmount).toBe(
                engineRequestOf(plan, rulebook, override),
            );
        },
    );

    it.each([
        { label: 'no override', override: null },
        { label: 'a personal override', override: 800 },
    ])(
        'live: requests the one documented request with $label',
        ({ override }) => {
            const rulebook = rulebookWith(50_000);
            const context = liveContext(override);

            const decision = new PayoutRequestRule(rulebook).decide(context);

            expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
            if (decision.kind !== PayoutRequestDecisionKind.Request) return;
            expect(decision.requestAmount).toBe(
                documentedPayoutRequest(
                    context.livePlan,
                    override,
                    rulebook.payout,
                ).effective,
            );
            expect(decision.requestAmount).toBe(override ?? 500);
        },
    );

    it('notes a firm minimum above the requested amount from the same raw request', () => {
        const rulebook = rulebookWith(75_000);
        const { context } = fundedContext(1);

        const decision = new PayoutRequestRule(rulebook).decide(context);

        expect(decision.kind).toBe(PayoutRequestDecisionKind.Request);
        if (decision.kind !== PayoutRequestDecisionKind.Request) return;
        expect(decision.notice?.kind).toBe(
            PayoutRequestNotice.FirmMinimumAboveRequest,
        );
    });
});
