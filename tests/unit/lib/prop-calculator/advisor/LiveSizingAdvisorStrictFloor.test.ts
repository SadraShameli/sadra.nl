import { describe, expect, it } from 'vitest';

import {
    buildMffuRapidLivePlan,
    buildTopStepLivePlan,
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    type LiveAccountState,
    type LivePlan,
    MffuVariant,
    type Plan,
    type PlanId,
    resolveLiveRiskAt,
    resolvePositionSizing,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AdviceStalenessKind,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    LiveSizingAdvisor,
    type LiveSizingAdvisorInput,
    NO_PERSONAL_CAPS,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

const STOP_POINTS = 22.5;
const ONE_NQ_CONTRACT_RISK = 450;

const topStepPlan = registryPlan({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.NoFeeStandard,
});
const mffuPlan = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Rapid,
});

function advisorFor(
    plan: Plan,
    livePlan: LivePlan,
    state: LiveAccountState,
    positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    },
    overrides: Partial<
        Pick<
            LiveSizingAdvisorInput,
            'personalCaps' | 'personalDll' | 'snapshotAsOf'
        >
    > = {},
): LiveSizingAdvisor {
    const account: ReconstructedLiveAccount = {
        assumptions: [],
        cushion: dollars(state.balance - state.threshold),
        kind: ReconstructedLiveKind.Live,
        livePlan,
        plan,
        state,
    };
    return new LiveSizingAdvisor({
        account,
        positionSizing,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-10-02',
        substate: null,
        today: '2026-10-02',
        ...overrides,
    });
}

function nqPlacement() {
    return { instrument: InstrumentSymbol.NQ, stopPoints: STOP_POINTS };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function stateOnFloor(livePlan: LivePlan): LiveAccountState {
    const state = livePlan.initialState();
    state.balance = state.threshold;
    return state;
}

describe('LiveSizingAdvisor caps at a strictly-below floor agree with the simulator (WP62c, WP62d, N-94)', () => {
    it('offers the one-contract minimum the simulator places for a Topstep LFA sitting exactly on $1,000.00', () => {
        const livePlan = buildTopStepLivePlan();
        const state = stateOnFloor(livePlan);
        const positionSizing = resolvePositionSizing(
            InstrumentSymbol.NQ,
            STOP_POINTS,
        );
        if (positionSizing === null) throw new Error('expected a position');

        const simulated = resolveLiveRiskAt({
            commission: dollars(0),
            plan: livePlan,
            positionSizing,
            state,
        });
        const caps = advisorFor(
            topStepPlan,
            livePlan,
            state,
            nqPlacement(),
        ).caps();

        expect(simulated.risk).toBe(ONE_NQ_CONTRACT_RISK);
        expect(caps.affordable).toBe(simulated.risk);
    });

    it('falls back to the one-cent placeable minimum when no instrument and stop are entered, never $0', () => {
        const livePlan = buildTopStepLivePlan();

        const caps = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
        ).caps();

        expect(caps.affordable).toBe(0.01);
    });

    it('still bounds the minimum by the daily loss room left today', () => {
        const livePlan = buildTopStepLivePlan();
        const state = stateOnFloor(livePlan);
        state.todayPnL = -1800;

        const caps = advisorFor(
            topStepPlan,
            livePlan,
            state,
            nqPlacement(),
        ).caps();

        expect(caps.affordable).toBe(200);
    });

    it('advises $0 on a plain floor at cushion 0, where the account is already busted (pinned)', () => {
        const livePlan = buildMffuRapidLivePlan(
            DEFAULT_RULEBOOK.live.cushionPercent,
        );
        const state = stateOnFloor(livePlan);

        expect(livePlan.isBust(state)).toBe(true);
        expect(
            advisorFor(mffuPlan, livePlan, state, nqPlacement()).caps()
                .affordable,
        ).toBe(0);
    });

    it('leaves a cushion above 0 as the room it was', () => {
        const livePlan = buildTopStepLivePlan();
        const state = livePlan.initialState();

        expect(
            advisorFor(topStepPlan, livePlan, state, nqPlacement()).caps()
                .affordable,
        ).toBe(2000);
    });

    it('offers the documented ladder the one-contract rung the simulator places at a Topstep LFA on its floor, with no NoCushion flag (WP62d)', () => {
        const livePlan = buildTopStepLivePlan();
        const state = stateOnFloor(livePlan);
        const positionSizing = resolvePositionSizing(
            InstrumentSymbol.NQ,
            STOP_POINTS,
        );
        if (positionSizing === null) throw new Error('expected a position');
        const simulated = resolveLiveRiskAt({
            commission: dollars(0),
            plan: livePlan,
            positionSizing,
            state,
        });

        const documented = advisorFor(
            topStepPlan,
            livePlan,
            state,
            nqPlacement(),
        ).documented();

        expect(documented?.rungs.map((rung) => rung.risk)).toStrictEqual([
            simulated.risk,
        ]);
        expect(documented?.constraints).not.toContain(
            SizingConstraint.NoCushion,
        );
    });

    it('offers the one-cent rung at the strict floor when no instrument and stop are entered', () => {
        const livePlan = buildTopStepLivePlan();

        const documented = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
        ).documented();

        expect(documented?.rungs.map((rung) => rung.risk)).toStrictEqual([
            0.01,
        ]);
    });

    it('lets the daily plan card show the floor rung too, then stops once that loss would bust the account', () => {
        const livePlan = buildTopStepLivePlan();

        const card = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
        ).dailyPlanCard();

        expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([
            ONE_NQ_CONTRACT_RISK,
        ]);
    });

    it('still offers no rungs and flags no cushion on a plain floor at cushion 0 (pinned)', () => {
        const livePlan = buildMffuRapidLivePlan(
            DEFAULT_RULEBOOK.live.cushionPercent,
        );

        const documented = advisorFor(
            mffuPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
        ).documented();

        expect(documented?.rungs).toStrictEqual([]);
        expect(documented?.constraints).toContain(SizingConstraint.NoCushion);
    });

    it('leaves a ladder above the floor sized by the cushion percent (pinned)', () => {
        const livePlan = buildTopStepLivePlan();
        const state = livePlan.initialState();

        const documented = advisorFor(
            topStepPlan,
            livePlan,
            state,
            nqPlacement(),
        ).documented();

        expect(documented?.rungs[0]?.risk).toBe(
            (state.balance - state.threshold) *
                livePlan.cushionPercentFor(state),
        );
    });
});

describe('LiveSizingAdvisor names why it offers the floor rung at zero cushion (PT-73h)', () => {
    it('returns the typed one-contract reason for a Topstep LFA on its floor with an entered stop', () => {
        const livePlan = buildTopStepLivePlan();

        const advice = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
        ).assemble([]);

        expect(advice.differenceReasons).toStrictEqual([
            {
                affordableRisk: ONE_NQ_CONTRACT_RISK,
                isPlacedAtEnteredStop: true,
                kind: DifferenceReason.LiveFloorMinimumTrade,
                minimumTradeRisk: ONE_NQ_CONTRACT_RISK,
            },
        ]);
    });

    it('returns the one-cent reason when no instrument and stop are entered', () => {
        const livePlan = buildTopStepLivePlan();

        const advice = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
        ).assemble([]);

        expect(advice.differenceReasons).toStrictEqual([
            {
                affordableRisk: 0.01,
                isPlacedAtEnteredStop: false,
                kind: DifferenceReason.LiveFloorMinimumTrade,
                minimumTradeRisk: 0.01,
            },
        ]);
    });

    it('gives the reason the same risk the caps and the documented rung offer', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
        );

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(reason).toMatchObject({
            minimumTradeRisk: advisor.documented()?.rungs[0]?.risk,
        });
    });

    it('bounds the reason by the daily loss room left today, the same number the caps show', () => {
        const livePlan = buildTopStepLivePlan();
        const state = stateOnFloor(livePlan);
        state.todayPnL = -1800;
        const advisor = advisorFor(topStepPlan, livePlan, state, nqPlacement());

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(advisor.caps().affordable).toBe(200);
        expect(reason).toMatchObject({
            affordableRisk: 200,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: ONE_NQ_CONTRACT_RISK,
        });
    });

    it('says no risk is affordable once the daily loss limit is used up', () => {
        const livePlan = buildTopStepLivePlan();
        const state = stateOnFloor(livePlan);
        state.todayPnL = -2000;
        const advisor = advisorFor(topStepPlan, livePlan, state, nqPlacement());

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(advisor.caps().affordable).toBe(0);
        expect(reason).toMatchObject({
            affordableRisk: 0,
            minimumTradeRisk: ONE_NQ_CONTRACT_RISK,
        });
    });

    it('bounds the reason by a personal max risk per trade below one contract', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
            {
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    maxRiskPerTrade: dollars(100),
                },
            },
        );

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(reason).toMatchObject({
            affordableRisk: 100,
            minimumTradeRisk: ONE_NQ_CONTRACT_RISK,
        });
    });

    it('folds a personal daily loss limit into the reason like the documented rung (PT-36s, N-94)', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
            { personalDll: dollars(100) },
        );

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(advisor.documented()?.rungs[0]?.risk).toBe(100);
        expect(reason).toMatchObject({
            affordableRisk: 100,
            kind: DifferenceReason.LiveFloorMinimumTrade,
            minimumTradeRisk: ONE_NQ_CONTRACT_RISK,
        });
    });

    it('leaves the reason at the one-contract risk when the personal daily loss limit is looser than it', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
            { personalDll: dollars(5000) },
        );

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(advisor.documented()?.rungs[0]?.risk).toBe(ONE_NQ_CONTRACT_RISK);
        expect(reason).toMatchObject({ affordableRisk: ONE_NQ_CONTRACT_RISK });
    });

    it('takes the tighter of a personal daily loss limit and a personal max risk per trade', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
            {
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    maxRiskPerTrade: dollars(60),
                },
                personalDll: dollars(100),
            },
        );

        const [reason] = advisor.assemble([]).differenceReasons;

        expect(advisor.documented()?.rungs[0]?.risk).toBe(60);
        expect(reason).toMatchObject({ affordableRisk: 60 });
    });

    it('gives no floor reason on stale advice, where the rung amounts are withheld', () => {
        const livePlan = buildTopStepLivePlan();
        const advisor = advisorFor(
            topStepPlan,
            livePlan,
            stateOnFloor(livePlan),
            nqPlacement(),
            { snapshotAsOf: '2020-01-01' },
        );

        expect(advisor.staleness().kind).toBe(AdviceStalenessKind.Stale);
        expect(advisor.documented()).toBeNull();
        expect(
            advisor.assemble([]).differenceReasons.map((reason) => reason.kind),
        ).toStrictEqual([DifferenceReason.StaleAdvice]);
    });

    it('gives no floor reason above the floor', () => {
        const livePlan = buildTopStepLivePlan();

        const advice = advisorFor(
            topStepPlan,
            livePlan,
            livePlan.initialState(),
            nqPlacement(),
        ).assemble([]);

        expect(advice.differenceReasons).toStrictEqual([]);
    });

    it('gives no floor reason on a plain-floor live account above its floor', () => {
        const livePlan = buildMffuRapidLivePlan(
            DEFAULT_RULEBOOK.live.cushionPercent,
        );

        const advice = advisorFor(
            mffuPlan,
            livePlan,
            livePlan.initialState(),
            nqPlacement(),
        ).assemble([]);

        expect(advice.differenceReasons).toStrictEqual([]);
    });
});
