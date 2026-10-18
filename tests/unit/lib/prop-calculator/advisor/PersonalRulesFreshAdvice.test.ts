import { describe, expect, it } from 'vitest';

import {
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    type AccountState,
    ApexVariant,
    dollars,
    EodTrailingDrawdown,
    findFirm,
    FirmId,
    fraction,
    newFundedCycleTracker,
    NO_PLAN_OPT_INS,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    PayoutRequestDecisionKind,
    type ReconstructedFundedOrEvalAccount,
    RetainedCushionBasis,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const apexPlan = registryPlan(APEX_EOD_ID);
const topStepPlan = registryPlan(TOPSTEP_STANDARD_ID).withOverrides({
    consistency: null,
    fundedConsistency: { kind: 'set', rule: null },
    fundedDrawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
    maxLifetimePayouts: undefined,
    minDaysAfterPassForPayout: 0,
    minPayoutProfit: dollars(0),
    minPayoutProfitPerCycle: dollars(0),
    payoutBalanceShareCap: undefined,
    payoutFloorEffect: PayoutFloorEffect.None,
    payoutLadder: null,
    payoutMethodFee: dollars(0),
    payoutRequestCap: undefined,
    payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }],
});

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const state = evalState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function evalAdvice(personal: {
    readonly personalCaps?: Partial<typeof NO_PERSONAL_CAPS>;
    readonly personalDll?: ReturnType<typeof dollars>;
}) {
    return new EvalSizingAdvisor({
        account: evalAccount(),
        maxEvalDays: 150,
        personalCaps: { ...NO_PERSONAL_CAPS, ...personal.personalCaps },
        personalDll: personal.personalDll ?? null,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).assemble([]);
}

function evalState(): AccountState {
    return {
        balance: 52_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
}

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const state = fundedState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan: topStepPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAdvisor(personal: {
    readonly personalPayoutOverride?: ReturnType<typeof dollars>;
    readonly personalRetainedCushion?: ReturnType<typeof dollars>;
}) {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        fundedHorizonDays: 252,
        personalPayoutOverride: personal.personalPayoutOverride ?? null,
        personalRetainedCushion: personal.personalRetainedCushion ?? null,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function fundedState(): AccountState {
    return {
        balance: 56_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function requestKeyOf(advisor: {
    optimumRequests: () => AdvisorWorkerRequest['requests'];
}): string {
    return advisorWorkerCacheKey({
        firmId: FirmId.TopStep,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(topStepPlan.id),
        requests: advisor.optimumRequests(),
    });
}

function riskOf(
    advice: ReturnType<typeof evalAdvice>,
): readonly (readonly [number, readonly string[]])[] {
    return (advice.dailyPlanCard?.rungs ?? []).map(
        (rung) => [rung.risk, rung.cappedBy] as const,
    );
}

describe('personal rules change the assembled advice without touching the engine request (PT-34e review)', () => {
    it('a personal daily loss limit of $300 shrinks the documented rungs and the daily plan card', () => {
        const base = evalAdvice({});
        const limited = evalAdvice({ personalDll: dollars(300) });

        expect(base.documented?.rungs.map((rung) => rung.risk)).toEqual([
            200, 300, 450, 50,
        ]);
        expect(limited.documented?.rungs.map((rung) => rung.risk)).toEqual([
            50, 50, 50, 150,
        ]);
        expect(riskOf(limited).map(([risk]) => risk)).toEqual([
            50, 50, 50, 150,
        ]);
        expect(
            riskOf(limited).every(([, capped]) =>
                capped.includes('personal-cap'),
            ),
        ).toBe(true);
    });

    it('a personal daily profit cap of $200 caps the documented ladder and the daily plan card alike (PT-68d)', () => {
        const base = evalAdvice({});
        const capped = evalAdvice({
            personalCaps: { dailyProfitCap: dollars(200) },
        });

        expect(riskOf(base).map(([risk]) => risk)).toEqual([200, 300, 450, 50]);
        expect(riskOf(capped).map(([risk]) => risk)).toEqual([
            100, 150, 200, 50,
        ]);
        expect(capped.documented?.rungs.map((rung) => rung.risk)).toEqual(
            riskOf(capped).map(([risk]) => risk),
        );
    });

    it('a personal max trades per day of 1 leaves one daily plan rung', () => {
        const single = evalAdvice({ personalCaps: { maxTradesPerDay: 1 } });

        expect(riskOf(single).map(([risk]) => risk)).toEqual([200]);
    });

    it('a personal retained cushion above the rulebook changes the headline payout decision', () => {
        const base = fundedAdvisor({}).assemble([]).payoutAdvice?.documented;
        const personal = fundedAdvisor({
            personalRetainedCushion: dollars(3000),
        }).assemble([]).payoutAdvice?.documented;

        expect(base?.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(personal?.kind).toBe(PayoutRequestDecisionKind.Request);
        if (
            base?.kind !== PayoutRequestDecisionKind.Request ||
            personal?.kind !== PayoutRequestDecisionKind.Request
        ) {
            return;
        }
        expect(base.retainedCushion).toBe(2000);
        expect(personal.retainedCushion).toBe(3000);
        expect(personal.retainedCushionBasis).toBe(
            RetainedCushionBasis.PersonalOverride,
        );
    });

    it('personal daily limits and caps change the engine request key, because the engine now simulates them (PT-68f)', () => {
        const base = requestKeyOf(fundedAdvisor({}));
        const advisor = new FundedSizingAdvisor({
            account: fundedAccount(),
            fundedHorizonDays: 252,
            personalCaps: {
                dailyProfitCap: dollars(200),
                maxRiskPerTrade: dollars(100),
                maxTradesPerDay: 1,
            },
            personalDll: dollars(300),
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
            trials: 20,
        });

        expect(requestKeyOf(advisor)).not.toBe(base);
    });

    it('a personal payout override changes the engine request key', () => {
        const overridden = requestKeyOf(
            fundedAdvisor({ personalPayoutOverride: dollars(1500) }),
        );

        expect(overridden).not.toBe(requestKeyOf(fundedAdvisor({})));
    });
});
