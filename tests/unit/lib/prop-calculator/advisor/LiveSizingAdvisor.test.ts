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
    AssumptionKind,
    DEFAULT_RULEBOOK,
    LiveSizingAdvisor,
    NO_PERSONAL_CAPS,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const livePlan: LivePlan = buildMffuRapidLivePlan(
    DEFAULT_RULEBOOK.live.cushionPercent,
);

const MFF_RAPID_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
};

function account(
    overrides: Partial<ReconstructedLiveAccount> = {},
): ReconstructedLiveAccount {
    const state = liveState({ balance: 54_000, threshold: 50_000 });
    return {
        assumptions: [],
        cushion: state.balance - state.threshold,
        kind: ReconstructedLiveKind.Live,
        livePlan,
        plan,
        state,
        ...overrides,
    };
}

function advisorAt(reconstructed: ReconstructedLiveAccount): LiveSizingAdvisor {
    return new LiveSizingAdvisor({
        account: reconstructed,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function liveState(
    overrides: Partial<LiveAccountState> = {},
): LiveAccountState {
    return { ...livePlan.initialState(), ...overrides };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(MFF_RAPID_ID);

describe('LiveSizingAdvisor (PT-19f, F-118, F-129)', () => {
    it("documents live risk at the plan's own resolved cushion percent, not the rulebook default", () => {
        const reconstructed = account();
        const advisor = advisorAt(reconstructed);
        if (reconstructed.state === null) throw new Error('expected a state');

        const documented = advisor.documented();

        const expectedPercent = livePlan.cushionPercentFor(reconstructed.state);
        expect(documented?.rungs[0]?.risk).toBeCloseTo(
            4000 * expectedPercent,
            6,
        );
    });

    it('caps() reports the live affordable room', () => {
        const advisor = advisorAt(account());

        const caps = advisor.caps();

        expect(caps.affordable).toBeGreaterThan(0);
    });

    it('requests no engine optimum for the live stage (no engine source is modeled yet)', () => {
        const advisor = advisorAt(account());

        expect(advisor.optimumRequests()).toEqual([]);
    });

    it('reports no sizing when the account has no reconstructed live state (E8/FTMO not modeled, no dashboard floor)', () => {
        const advisor = advisorAt(
            account({ cushion: null, livePlan: null, state: null }),
        );

        expect(advisor.documented()).toBeNull();
    });

    it('always discloses that live-transition triggers are not yet checked (F-145)', () => {
        const advisor = advisorAt(account());

        const advice = advisor.assemble([]);

        expect(
            advice.assumptions.some(
                (assumption) =>
                    assumption.kind === AssumptionKind.LiveTriggersNotChecked,
            ),
        ).toBe(true);
    });

    it('caps() still reports the dashboard-floor cushion when the plan is not modeled', () => {
        const advisor = advisorAt(
            account({ cushion: dollars(1200), livePlan: null, state: null }),
        );

        const caps = advisor.caps();

        expect(caps.affordable).toBe(1200);
        expect(NO_PERSONAL_CAPS.maxTradesPerDay).toBeNull();
    });

    it('assemble() carries the real firm-data verification date and any given plan-rules fingerprint (F-126)', () => {
        const advice = advisorAt(account()).assemble([]);

        expect(advice.provenance.firmDataDate).toBe(
            firmDataProvenance(FirmId.Mffu).verifiedOn,
        );
        expect(advice.provenance.planRulesFingerprint).toBeNull();

        const withFingerprint = new LiveSizingAdvisor({
            account: account(),
            planRulesFingerprint: { atAdvice: 'old-hash', current: 'new-hash' },
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        }).assemble([]);

        expect(withFingerprint.provenance.planRulesFingerprint).toBe(
            'new-hash',
        );
    });
});
