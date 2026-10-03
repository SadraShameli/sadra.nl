import { describe, expect, it } from 'vitest';

import { advisorWorkerCacheKey } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    NO_PLAN_OPT_INS,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type EngineOptimumRequest,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

function cacheKeyFor(personal: null | number): string {
    return advisorWorkerCacheKey({
        firmId: FirmId.TopStep,
        optIns: NO_PLAN_OPT_INS,
        planSerial: 'p',
        requests: requestsFor(personal),
    });
}

function fundedAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 51_500,
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
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function requestsFor(
    personalRetainedCushion: null | number | undefined,
): readonly EngineOptimumRequest[] {
    const plan = topStepPlan();
    return new FundedSizingAdvisor({
        account: fundedAccount(plan),
        fundedHorizonDays: 252,
        personalRetainedCushion:
            personalRetainedCushion === undefined ||
            personalRetainedCushion === null
                ? personalRetainedCushion
                : dollars(personalRetainedCushion),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).optimumRequests();
}

function rulebookWithCushion(
    retainedCushionCents: number,
    isBelowHardRule2Allowed = false,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        payout: {
            ...DEFAULT_RULEBOOK.payout,
            allowBelowHardRule2: isBelowHardRule2Allowed,
            retainedCushionCents,
        },
    };
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    return plan;
}

describe('buildEnginePolicy: personal retained cushion (PT-36d, PT-34e leftover)', () => {
    const plan = topStepPlan();

    it('uses the personal cushion when it is above the rulebook cushion', () => {
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: 90,
            personalRetainedCushion: dollars(5000),
            plan,
            rulebook: DEFAULT_RULEBOOK,
        });
        expect(policy.retainedCushionRequest).toBe(5000);
    });

    it('keeps the rulebook cushion when the personal cushion is below it, absent or null', () => {
        for (const personalRetainedCushion of [dollars(500), null, undefined]) {
            const { policy } = buildEnginePolicy({
                fundedHorizonDays: 90,
                personalRetainedCushion,
                plan,
                rulebook: DEFAULT_RULEBOOK,
            });
            expect(policy.retainedCushionRequest).toBe(2000);
        }
    });

    it('never goes below Hard Rule 2 unless the rulebook waives it', () => {
        const belowFloor = rulebookWithCushion(100_000);
        expect(
            buildEnginePolicy({
                fundedHorizonDays: 90,
                plan,
                rulebook: belowFloor,
            }).policy.retainedCushionRequest,
        ).toBe(2000);
        const waived = rulebookWithCushion(100_000, true);
        expect(
            buildEnginePolicy({
                fundedHorizonDays: 90,
                plan,
                rulebook: waived,
            }).policy.retainedCushionRequest,
        ).toBe(1000);
        expect(
            buildEnginePolicy({
                fundedHorizonDays: 90,
                personalRetainedCushion: dollars(3000),
                plan,
                rulebook: waived,
            }).policy.retainedCushionRequest,
        ).toBe(3000);
    });
});

describe('FundedSizingAdvisor: personal retained cushion reaches every engine request (PT-36d)', () => {
    it('carries the larger personal cushion in the fresh sweep, the from-state sweep, the payout optimum and the next payout projection', () => {
        const requests = requestsFor(5000);
        expect(requests.map((request) => request.source)).toStrictEqual([
            AdviceSource.FundedSweepFresh,
            AdviceSource.FundedSweepFromState,
            AdviceSource.PayoutSizeSweep,
            AdviceSource.NextPayoutProjection,
        ]);
        for (const request of requests) {
            const policy =
                request.source === AdviceSource.PayoutSizeSweep
                    ? request.spec.enginePolicy
                    : 'policy' in request
                      ? request.policy
                      : null;
            expect(policy?.retainedCushionRequest, request.source).toBe(5000);
        }
    });

    it('keeps the rulebook cushion when the personal cushion is lower', () => {
        const [first] = requestsFor(500);
        expect(
            first !== undefined && 'policy' in first
                ? first.policy.retainedCushionRequest
                : null,
        ).toBe(2000);
    });

    it('is part of the advice worker cache key, so a changed personal cushion never reuses a run', () => {
        expect(cacheKeyFor(5000)).not.toBe(cacheKeyFor(null));
        expect(cacheKeyFor(5000)).not.toBe(cacheKeyFor(6000));
        expect(cacheKeyFor(5000)).toBe(cacheKeyFor(5000));
    });
});
