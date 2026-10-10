import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceStalenessKind,
    AdviceStalenessReason,
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    InstantFundedEvalAdvisorError,
    LiveSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
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

function accountState(): AccountState {
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

function evalAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const commonOptions = {
    maxEvalDays: 150,
    rulebook: DEFAULT_RULEBOOK,
    snapshotAsOf: '2026-09-26',
    substate: null,
    today: '2026-09-26',
};

describe('createSizingAdvisor (PT-19f, F-118, step 15)', () => {
    it('builds an EvalSizingAdvisor for an eval account', () => {
        const advisor = createSizingAdvisor(
            evalAccount(registryPlan(APEX_EOD_ID)),
            commonOptions,
        );

        expect(advisor).toBeInstanceOf(EvalSizingAdvisor);
    });

    it('builds a FundedSizingAdvisor for a funded account', () => {
        const state = accountState();
        const advisor = createSizingAdvisor(
            {
                assumptions: [],
                contractLimit: null,
                cushion: state.balance - state.threshold,
                fundedTracker: null,
                kind: TradingPhase.Funded,
                plan: registryPlan(TOPSTEP_STANDARD_ID),
                resolvedDailyLossLimit: null,
                state,
                ...NO_PENDING_PAYOUT_COUNTS,
            },
            { fundedHorizonDays: 252, ...commonOptions },
        );

        expect(advisor).toBeInstanceOf(FundedSizingAdvisor);
    });

    it('builds a LiveSizingAdvisor for a live account', () => {
        const plan = registryPlan(TOPSTEP_STANDARD_ID);
        const advisor = createSizingAdvisor(
            {
                assumptions: [],
                cushion: null,
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                plan,
                state: null,
            },
            commonOptions,
        );

        expect(advisor).toBeInstanceOf(LiveSizingAdvisor);
    });

    it('throws a typed error for an instant-funded plan reconstructed as an eval account', () => {
        const instantFunded = registryPlan(APEX_EOD_ID).withOverrides({
            isInstantFunded: true,
        });

        expect(() =>
            createSizingAdvisor(evalAccount(instantFunded), commonOptions),
        ).toThrow(InstantFundedEvalAdvisorError);
    });

    it.each([
        ['eval', 'old-hash'],
        ['eval', null],
    ])(
        'passes the plan-rules fingerprint check through to a %s advisor (atAdvice %s)',
        (_stage, atAdvice) => {
            const advisor = createSizingAdvisor(
                evalAccount(registryPlan(APEX_EOD_ID)),
                {
                    ...commonOptions,
                    planRulesFingerprint: { atAdvice, current: 'new-hash' },
                },
            );

            const advice = advisor.assemble([]);

            expect(advice.provenance.planRulesFingerprint).toBe('new-hash');
            expect(advice.staleness.kind).toBe(
                atAdvice === null
                    ? AdviceStalenessKind.Fresh
                    : AdviceStalenessKind.Stale,
            );
        },
    );

    it('marks funded and live advice stale on a changed fingerprint and carries the current one', () => {
        const state = accountState();
        const planRulesFingerprint = {
            atAdvice: 'old-hash',
            current: 'new-hash',
        };
        const funded = createSizingAdvisor(
            {
                assumptions: [],
                contractLimit: null,
                cushion: state.balance - state.threshold,
                fundedTracker: null,
                kind: TradingPhase.Funded,
                plan: registryPlan(TOPSTEP_STANDARD_ID),
                resolvedDailyLossLimit: null,
                state,
                ...NO_PENDING_PAYOUT_COUNTS,
            },
            { fundedHorizonDays: 252, ...commonOptions, planRulesFingerprint },
        ).assemble([]);
        const live = createSizingAdvisor(
            {
                assumptions: [],
                cushion: null,
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                plan: registryPlan(TOPSTEP_STANDARD_ID),
                state: null,
            },
            { ...commonOptions, planRulesFingerprint },
        ).assemble([]);

        for (const advice of [funded, live]) {
            expect(advice.provenance.planRulesFingerprint).toBe('new-hash');
            expect(advice.staleness).toMatchObject({
                kind: AdviceStalenessKind.Stale,
                reasons: [AdviceStalenessReason.PlanRulesChanged],
            });
            expect(
                advice.differenceReasons.map((reason) => reason.kind),
            ).toContain(DifferenceReason.PlanRulesChanged);
        }
    });
});
