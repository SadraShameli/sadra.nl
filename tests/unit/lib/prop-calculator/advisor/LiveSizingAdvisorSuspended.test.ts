import { describe, expect, it } from 'vitest';

import {
    buildMffuRapidLivePlan,
    dollars,
    findFirm,
    FirmId,
    type LiveAccountState,
    type LivePlan,
    MffuVariant,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AccountSubstate,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    LiveSizingAdvisor,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const livePlan: LivePlan = buildMffuRapidLivePlan(
    DEFAULT_RULEBOOK.live.cushionPercent,
);

function account(): ReconstructedLiveAccount {
    const state = liveState();
    return {
        assumptions: [],
        cushion: state.balance - state.threshold,
        kind: ReconstructedLiveKind.Live,
        livePlan,
        plan,
        state,
    };
}

function advisorAt(
    substate: AccountSubstate.Suspended | null = null,
): LiveSizingAdvisor {
    return new LiveSizingAdvisor({
        account: account(),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate,
        today: '2026-09-26',
    });
}

function liveState(): LiveAccountState {
    return { ...livePlan.initialState(), balance: 54_000, threshold: 50_000 };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(MFF_RAPID_ID);

describe('LiveSizingAdvisor Suspended gating (PT-19g, F-97, F-118)', () => {
    it('yields no sizing, no daily card, no payout advice and no risk check for a Suspended account', () => {
        const advisor = advisorAt(AccountSubstate.Suspended);

        const advice = advisor.assemble([]);

        expect(advisor.documented()).toBeNull();
        expect(advisor.dailyPlanCard()).toBeNull();
        expect(advisor.checkNextTradeRisk(dollars(100), ZERO_DAY)).toBeNull();
        expect(advice.documented).toBeNull();
        expect(advice.dailyPlanCard).toBeNull();
        expect(advice.payoutAdvice).toBeNull();
    });

    it('says why a Suspended account has no sizing, as one bare typed reason with readable text', () => {
        const advice = advisorAt(AccountSubstate.Suspended).assemble([]);

        expect(advice.differenceReasons).toEqual([
            { kind: DifferenceReason.Suspended },
        ]);
        expect(
            differenceReasonText({ kind: DifferenceReason.Suspended }),
        ).toContain('suspended');
    });

    it('gives no affordable risk to a Suspended account and the usual room to every other account', () => {
        expect(advisorAt(AccountSubstate.Suspended).caps().affordable).toBe(0);
        expect(advisorAt().caps().affordable).toBeGreaterThan(0);
    });

    it('adds no suspended reason when no substate is given', () => {
        expect(advisorAt().assemble([]).differenceReasons).toEqual([]);
    });
});
